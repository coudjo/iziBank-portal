import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import type { FreezeActionResult } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate, formatTimestamp } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import { newIdempotencyKey } from '../../shared/capture/image-compress';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  MenuButtonComponent,
  MenuItem,
  StatusChipComponent,
  TabLink,
  TabsComponent,
  ToastService,
} from '../../shared/ui';
import { ApprovalBarComponent, ApprovalsService } from '../approvals';
import { OPENED_STATE, OPERATING_MODE_LABELS, label } from './account-labels';
import { AccountRecordStore } from './account-record.store';
import { AccountsClient } from './accounts.client';
import type { CloseDialogData } from './close.dialog';
import type { HoldDialogData } from './hold.dialog';

type Action = 'hold' | 'release' | 'freeze' | 'unfreeze' | 'dormant' | 'reactivate' | 'close';

/** Account record: header, Actions menu, approval bar and tabs (UX 6.8, 7.4; F9). */
@Component({
  selector: 'ib-account-record-page',
  imports: [
    RouterOutlet,
    ApprovalBarComponent,
    BannerComponent,
    ButtonComponent,
    MenuButtonComponent,
    StatusChipComponent,
    TabsComponent,
  ],
  providers: [AccountRecordStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ib-space-3);
      margin-bottom: var(--ib-space-4);
    }
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
    .number {
      color: var(--ib-ink-muted);
      font-size: 15px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-2);
    }
    .meta {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-ink-muted);
    }
    .logged {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-meta);
      font-size: 13px;
    }
  `,
  template: `
    @if (opened && store.account()?.supervisionState === 'PENDING') {
      <ib-banner
        tone="success"
        message="Account opened. Awaiting approval. The account cannot be used until a supervisor approves it."
      />
    }
    @if (!store.problem()) {
      <p class="logged">Viewing this record is logged.</p>
    }
    <div class="header">
      <div>
        <div class="title-row">
          <h1 tabindex="-1" data-page-title>{{ store.account()?.accountName ?? 'Account' }}</h1>
          @if (store.account(); as account) {
            <span class="number ib-num">{{ account.accountNumber }}</span>
          }
        </div>
        @if (store.account(); as account) {
          <div class="chips">
            <ib-status-chip domain="account" [code]="account.status" [explain]="true" />
          </div>
          <p class="meta">
            {{ account.productName }} · Branch {{ account.branchCode }} · Opened
            <span class="ib-num">{{ date(account.dateOpened) }}</span> · Mode
            {{ modeLabel(account.operatingModeCode) }}
          </p>
        }
      </div>
      @if (actions().length > 0) {
        <ib-menu-button label="Actions" [items]="actions()" (selected)="run($any($event))" />
      }
    </div>

    @if (store.account(); as account) {
      @if (account.closedOn) {
        <ib-banner
          tone="info"
          message="This account is closed and read-only."
          [description]="
            'Closed ' +
            timestamp(account.closedOn) +
            (account.closeReasonCode ? ' · ' + reason(account.closeReasonCode) : '')
          "
        />
      }
      <ib-tabs label="Account record" [tabs]="tabs()" />
      <router-outlet />
      @if (canApprove()) {
        <ib-approval-bar
          [own]="own()"
          [canReject]="true"
          [busy]="guard.busy()"
          note="Approving makes the account usable."
          (approved)="decide(true)"
          (rejected)="decide(false)"
        />
      }
    } @else if (store.problem(); as problem) {
      <ib-banner tone="danger" [message]="message()!" />
      @if (problem.type !== 'not-found') {
        <ib-button (click)="store.reload()">Try again</ib-button>
      }
    } @else {
      <p aria-live="polite">Loading the account…</p>
    }
  `,
})
export class AccountRecordPage {
  /** Route parameter `:id` (component input binding). */
  readonly id = input.required<string>();

  protected readonly store = inject(AccountRecordStore);
  protected readonly opened = inject(Router).currentNavigation()?.extras.state?.[OPENED_STATE] === true;
  protected readonly guard = new SubmitGuard();

  private readonly permissions = inject(PermissionService);
  private readonly client = inject(AccountsClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly approvals = inject(ApprovalsService);
  private readonly me = inject(AuthService).me;

  protected readonly tabs = computed((): TabLink[] => {
    const can = (subModule: string, module = 'ACC') =>
      this.permissions.can({ module, subModule, action: 'view' });
    return [
      { label: 'Summary', path: 'summary' },
      { label: 'Holders', path: 'holders' },
      ...(can('CONDITION') ? [{ label: 'Balance and holds', path: 'holds' }] : []),
      { label: 'Conditions', path: 'conditions' },
      ...(can('CLASSIFICATION') ? [{ label: 'Classification', path: 'classification' }] : []),
      ...(can('AUDIT', 'SEC') ? [{ label: 'Activity', path: 'activity' }] : []),
    ];
  });

  /** The Actions menu, filtered by permission and state (UX 6.8). */
  protected readonly actions = computed((): MenuItem[] => {
    const account = this.store.account();
    if (!account || !this.store.changeable()) {
      return [];
    }
    const condition = this.permissions.can({ module: 'ACC', subModule: 'CONDITION', action: 'edit' });
    const items: MenuItem[] = [];
    if (condition) {
      items.push({ label: 'Hold amount', value: 'hold' });
      if (account.balance.freezedAmount > 0) {
        items.push({ label: 'Release hold', value: 'release' });
      }
      items.push(
        account.condition.isFreezed
          ? { label: 'Unfreeze account', value: 'unfreeze' }
          : { label: 'Freeze account', value: 'freeze' },
        account.isDormant
          ? { label: 'Reactivate', value: 'reactivate' }
          : { label: 'Mark dormant', value: 'dormant' },
      );
    }
    if (this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'delete' })) {
      items.push({ label: 'Close account', value: 'close' });
    }
    return items;
  });

  protected readonly canApprove = computed(
    () =>
      this.store.account()?.supervisionState === 'PENDING' &&
      this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'supervise' }),
  );
  protected readonly own = computed(() => {
    const me = this.me()?.staffUserId;
    const account = this.store.account();
    return (
      me !== undefined && !!account && (account.openedByUserId === me || account.modifiedByUserId === me)
    );
  });
  protected readonly message = computed(() => {
    const problem = this.store.problem();
    return problem ? messageFor(problem) : null;
  });

  constructor() {
    effect(() => {
      const accountId = Number(this.id());
      untracked(() => void this.store.load(accountId));
    });
  }

  protected async run(action: Action): Promise<void> {
    const account = this.store.account();
    if (!account) {
      return;
    }
    switch (action) {
      case 'hold':
      case 'release': {
        const { HoldDialogComponent } = await import('./hold.dialog');
        const ref = await this.dialogs.open<
          InstanceType<typeof HoldDialogComponent>,
          HoldDialogData,
          FreezeActionResult
        >(
          HoldDialogComponent,
          { account, release: action === 'release' },
          { title: action === 'hold' ? 'Hold amount' : 'Release hold', width: 480 },
        );
        ref.afterClose.subscribe((result) => {
          if (result) {
            this.store.applyBalance(result.balance, result.isFreezed);
            this.toast.success(action === 'hold' ? 'Amount held.' : 'Hold released.');
          }
        });
        return;
      }
      case 'freeze':
      case 'unfreeze': {
        const remarks = await this.dialogs.reason({
          title: action === 'freeze' ? 'Freeze account?' : 'Unfreeze account?',
          message:
            action === 'freeze'
              ? 'Debits will be blocked until a supervisor unfreezes the account.'
              : 'The account can be debited again.',
          label: 'Remarks',
          confirmLabel: action === 'freeze' ? 'Freeze account' : 'Unfreeze account',
          maxLength: 200,
        });
        if (remarks === null) {
          return;
        }
        await this.act(async () => {
          const result = await this.client.freezeAction(
            account.accountId,
            { action: action === 'freeze' ? 'FREEZE_ACCOUNT' : 'UNFREEZE_ACCOUNT', amount: null, remarks },
            newIdempotencyKey(),
          );
          this.store.applyBalance(result.balance, result.isFreezed);
          this.toast.success(action === 'freeze' ? 'Account frozen.' : 'Account unfrozen.');
        });
        return;
      }
      case 'dormant':
      case 'reactivate': {
        const confirmed = await this.dialogs.confirm({
          title: action === 'dormant' ? 'Mark dormant?' : 'Reactivate account?',
          message:
            action === 'dormant'
              ? 'The account will show as dormant until it is reactivated.'
              : 'The account will show as active again. The reactivation is recorded.',
          confirmLabel: action === 'dormant' ? 'Mark dormant' : 'Reactivate',
        });
        if (confirmed) {
          await this.act(async () => {
            await this.client.dormancy(account.accountId, action === 'dormant' ? 'mark' : 'reactivate');
            await this.store.reload();
            this.toast.success(action === 'dormant' ? 'Marked dormant.' : 'Account reactivated.');
          });
        }
        return;
      }
      case 'close': {
        const { CloseDialogComponent } = await import('./close.dialog');
        const ref = await this.dialogs.open<
          InstanceType<typeof CloseDialogComponent>,
          CloseDialogData,
          boolean
        >(CloseDialogComponent, { account }, { title: 'Close account', width: 520 });
        ref.afterClose.subscribe((closed) => {
          if (closed) {
            void this.store.reload();
            this.toast.success('Account closed.');
          }
        });
        return;
      }
    }
  }

  protected async decide(approve: boolean): Promise<void> {
    const account = this.store.account();
    if (!account) {
      return;
    }
    if (approve) {
      await this.guard.run(() =>
        this.act(async () => {
          await this.client.approve(account.accountId);
          this.toast.success('Account approved. It can now be used.');
          void this.approvals.refresh();
          await this.store.reload();
        }),
      );
      return;
    }
    const reason = await this.dialogs.reason({
      title: 'Reject account?',
      message: 'The account is removed. Its number is not reused.',
      label: 'Reason',
      confirmLabel: 'Reject',
    });
    if (reason === null) {
      return;
    }
    await this.guard.run(() =>
      this.act(async () => {
        await this.client.reject(account.accountId, reason);
        this.toast.success('Account rejected.');
        void this.approvals.refresh();
        await this.router.navigate(['/accounts']);
      }),
    );
  }

  private async act(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (failure) {
      this.toast.error(messageFor(toApiProblem(failure)));
      await this.store.reload();
    }
  }

  protected readonly date = formatDate;
  protected readonly timestamp = formatTimestamp;
  protected modeLabel(code: string | null): string {
    return label(OPERATING_MODE_LABELS, code);
  }
  protected reason(code: string): string {
    return code.charAt(0) + code.slice(1).replace(/_/g, ' ').toLowerCase();
  }
}
