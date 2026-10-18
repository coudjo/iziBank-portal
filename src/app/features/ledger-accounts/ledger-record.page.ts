import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LedgerAccountView } from '../../core/api/api-types';
import { ApiProblem, toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatMoney } from '../../core/formats/money';
import { PermissionService } from '../../core/permissions/permission.service';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { BannerComponent, ButtonComponent, StatusChipComponent, ToastService } from '../../shared/ui';
import { LedgerFormComponent, LedgerSaved } from './ledger-form.component';
import { LEDGER_TYPE_LABELS } from './ledger-labels';
import { LedgerClient } from './ledger.client';

/**
 * Ledger account record (UX 7.6): the form, the balance (read-only, kept by postings later), and a waiting rename.
 * Supervisors review new accounts and renames on the approvals review page.
 */
@Component({
  selector: 'ib-ledger-record-page',
  imports: [RouterLink, BannerComponent, ButtonComponent, LedgerFormComponent, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ib-space-2) var(--ib-space-3);
    }
    h1:focus {
      outline: none;
    }
    h1:focus-visible {
      outline: 2px solid var(--ib-focus);
      outline-offset: 2px;
    }
    .code {
      color: var(--ib-ink-muted);
      font-size: 15px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
      margin: var(--ib-space-2) 0 var(--ib-space-4);
    }
    .meta {
      color: var(--ib-ink-muted);
    }
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    .review {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
      margin-bottom: var(--ib-space-4);
    }
  `,
  template: `
    <div class="title-row">
      <h1 tabindex="-1" data-page-title>{{ account()?.accountName ?? 'Ledger account' }}</h1>
      @if (account(); as current) {
        <span class="code ib-num">{{ current.ledgerAccountCode }}</span>
      }
    </div>
    @if (account(); as current) {
      <div class="chips">
        <ib-status-chip
          domain="approval"
          [code]="current.supervisionState === 'PENDING' ? 'PENDING' : 'APPROVED'"
          [explain]="true"
        />
        <span class="meta"
          >{{ type(current.ledgerAccountTypeCode) }} · Branch {{ current.branchCode }} · Balance
          <span class="ib-num">{{ money(current.balance, current.currencyCode) }}</span></span
        >
      </div>
      @if (current.pendingChange) {
        <ib-banner
          tone="warning"
          [message]="'Rename to “' + current.pendingChange.proposedName + '” is awaiting approval.'"
        />
      }
      @if (canReview()) {
        <a
          class="ant-btn ant-btn-primary review"
          [routerLink]="['/approvals', 'review', 'ledger', current.ledgerAccountId]"
          >Review and approve</a
        >
      }
      <section aria-label="Ledger account details">
        <ib-ledger-form [account]="current" (saved)="saved($event)" />
      </section>
    } @else if (problem(); as current) {
      <ib-banner tone="danger" [message]="message(current)" />
      @if (current.type !== 'not-found') {
        <ib-button (click)="load()">Try again</ib-button>
      }
    } @else {
      <p aria-live="polite">Loading the ledger account…</p>
    }
  `,
})
export class LedgerRecordPage implements HasUnsavedChanges {
  /** Route parameter `:id`. */
  readonly id = input.required<string>();

  private readonly client = inject(LedgerClient);
  private readonly permissions = inject(PermissionService);
  private readonly toast = inject(ToastService);
  private readonly form = viewChild(LedgerFormComponent);

  protected readonly account = signal<LedgerAccountView | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly canReview = computed(() => {
    const current = this.account();
    return (
      !!current &&
      (current.supervisionState === 'PENDING' || !!current.pendingChange) &&
      this.permissions.can({ module: 'LED', subModule: 'CHART', action: 'supervise' })
    );
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form()?.hasUnsavedChanges() ?? false;
  }

  async load(): Promise<void> {
    this.problem.set(null);
    try {
      this.account.set(await this.client.ledgerAccount(Number(this.id())));
    } catch (failure) {
      this.account.set(null);
      this.problem.set(toApiProblem(failure));
    }
  }

  protected saved(result: LedgerSaved): void {
    this.toast.success(
      result.waitsForApproval && this.account()?.supervisionState === 'APPROVED'
        ? 'Rename saved. It waits for a supervisor to approve it.'
        : 'Ledger account saved.',
    );
    void this.load();
  }

  protected message(problem: ApiProblem): string {
    return messageFor(problem);
  }

  protected type(code: string | null): string {
    return code ? (LEDGER_TYPE_LABELS[code] ?? code) : '—';
  }

  protected money(amount: number, currency: string | null): string {
    return formatMoney(amount, currency ?? 'GHS');
  }
}
