import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ChangeRequestView, LedgerAccountView } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { BannerComponent, DialogService, PageHeaderComponent, ToastService } from '../../shared/ui';
import { ApprovalBarComponent } from './approval-bar.component';
import { ApprovalKind, ApprovalsService, changeTypeLabel } from './approvals.service';
import { ApprovalsClient } from './approvals.client';
import { ChangesPanelComponent } from './changes-panel.component';
import { FieldChange, diffJson } from './json-diff';

interface Review {
  kind: ApprovalKind;
  title: string;
  facts: { label: string; value: string }[];
  changes: FieldChange[];
  pending: boolean;
  own: boolean;
  /** Reject is only for records never approved before (UX 5.2), and for change requests. */
  canReject: boolean;
  note: string | null;
}

/**
 * Review page (UX 6.6 steps 2 to 5, F8): the record read-only, the changes panel and the approval bar. After a
 * decision the next item in the inbox opens.
 */
@Component({
  selector: 'ib-approval-review-page',
  imports: [RouterLink, ApprovalBarComponent, BannerComponent, ChangesPanelComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(9rem, 1fr) 3fr;
      gap: var(--ib-space-1) var(--ib-space-4);
      margin: 0;
    }
    @media (max-width: 767.98px) {
      dl {
        grid-template-columns: 1fr;
      }
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    a {
      text-decoration: underline;
    }
    .back {
      display: inline-block;
      margin-bottom: var(--ib-space-3);
    }
  `,
  template: `
    <a class="back" [routerLink]="['/approvals', backKind()]">Back to approvals</a>
    <ib-page-header [title]="review()?.title ?? 'Review'" />
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    @if (review(); as current) {
      @if (!current.pending) {
        <ib-banner tone="info" message="This is no longer waiting for approval." />
      }
      <section aria-labelledby="review-facts">
        <h2 id="review-facts">Details</h2>
        <dl>
          @for (fact of current.facts; track fact.label) {
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          }
        </dl>
      </section>
      <section aria-labelledby="review-changes">
        <h2 id="review-changes">
          {{ current.kind === 'ledger' && !current.changes.length ? 'Account' : 'Changes' }}
        </h2>
        <ib-changes-panel [changes]="current.changes" caption="Changes waiting for approval" />
      </section>
      @if (current.pending) {
        <ib-approval-bar
          [own]="current.own"
          [canReject]="current.canReject"
          [note]="current.note"
          [busy]="guard.busy()"
          (approved)="decide(true)"
          (rejected)="decide(false)"
        />
      }
    }
  `,
})
export class ApprovalReviewPage {
  /** Route parameters `:type` (`change` or `ledger`) and `:id`. */
  readonly type = input.required<string>();
  readonly id = input.required<string>();

  private readonly client = inject(ApprovalsClient);
  private readonly approvals = inject(ApprovalsService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly me = inject(AuthService).me;

  protected readonly review = signal<Review | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly guard = new SubmitGuard();
  protected readonly backKind = computed((): ApprovalKind =>
    this.type() === 'ledger' ? 'ledger' : 'security',
  );

  constructor() {
    effect(() => {
      const type = this.type();
      const id = Number(this.id());
      untracked(() => void this.load(type, id));
    });
  }

  protected async decide(approve: boolean): Promise<void> {
    const current = this.review();
    if (!current) {
      return;
    }
    let reason: string | null = null;
    if (!approve) {
      reason = await this.dialogs.reason({
        title: 'Reject?',
        message:
          current.kind === 'ledger'
            ? 'The new ledger account or the rename will not be applied.'
            : 'The change will not be applied. The person who asked for it can see the reason.',
        label: 'Reason',
        confirmLabel: 'Reject',
      });
      if (!reason) {
        return;
      }
    }
    const id = Number(this.id());
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        if (current.kind === 'ledger') {
          await (approve ? this.client.approveLedger(id) : this.client.rejectLedger(id, reason));
        } else {
          await (approve ? this.client.approveChange(id) : this.client.rejectChange(id, reason!));
        }
        this.toast.success(approve ? 'Approved.' : 'Rejected.');
        const link = ['/approvals', 'review', this.type(), id];
        await this.approvals.refresh();
        const next = this.approvals.nextAfter(current.kind, link);
        void this.router.navigate(next ? next.link : ['/approvals', current.kind]);
      } catch (failure) {
        this.message.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  private async load(type: string, id: number): Promise<void> {
    this.review.set(null);
    this.message.set(null);
    try {
      this.review.set(
        type === 'ledger'
          ? this.ledgerReview(await this.client.ledgerAccount(id))
          : this.changeReview(await this.client.changeRequest(id)),
      );
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }

  private changeReview(change: ChangeRequestView): Review {
    return {
      kind: 'security',
      title: changeTypeLabel(change.changeType),
      facts: [
        { label: 'Record', value: `${change.entityType} ${change.entityId}` },
        { label: 'Requested by', value: change.requestedByName ?? String(change.requestedByUserId) },
        { label: 'Requested on', value: formatTimestamp(change.requestedOn) },
        { label: 'Status', value: change.status.toLowerCase() },
      ],
      changes: diffJson(change.before ?? null, change.proposed),
      pending: change.status === 'PENDING',
      own: change.requestedByUserId === this.me()?.staffUserId,
      canReject: true,
      note: null,
    };
  }

  private ledgerReview(account: LedgerAccountView): Review {
    const rename = account.pendingChange;
    const me = this.me()?.staffUserId;
    const facts = [
      { label: 'Code', value: account.ledgerAccountCode },
      { label: 'Name', value: account.accountName },
      { label: 'Type', value: account.ledgerAccountTypeCode ?? '—' },
      { label: 'Currency', value: account.currencyCode ?? '—' },
      { label: 'Branch', value: account.branchCode },
    ];
    if (rename) {
      return {
        kind: 'ledger',
        title: 'Ledger account rename',
        facts: [...facts, { label: 'Requested on', value: formatTimestamp(rename.requestedOn) }],
        changes: diffJson({ accountName: account.accountName }, { accountName: rename.proposedName }),
        pending: true,
        own: rename.requestedByUserId === me,
        canReject: true,
        note: null,
      };
    }
    const neverApproved = account.supervisedByUserId === null;
    return {
      kind: 'ledger',
      title: 'New ledger account',
      facts,
      changes: diffJson(null, {
        ledgerAccountCode: account.ledgerAccountCode,
        accountName: account.accountName,
        type: account.ledgerAccountTypeCode,
        currency: account.currencyCode,
      }),
      pending: account.supervisionState === 'PENDING',
      own: me !== undefined && (account.createdByUserId === me || account.modifiedByUserId === me),
      canReject: neverApproved,
      note: neverApproved
        ? null
        : 'This record was changed after approval. Correct it with Edit, then approve.',
    };
  }
}
