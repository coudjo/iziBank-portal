import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import type { FreezeActionView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { formatMoney } from '../../core/formats/money';
import {
  BannerComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
} from '../../shared/ui';
import { AccountBalancesComponent } from './balances.component';
import { FREEZE_ACTION_LABELS, label } from './account-labels';
import { AccountRecordStore } from './account-record.store';
import { AccountsClient } from './accounts.client';

/** Balance and holds tab (UX 7.4): the balances and the hold and freeze history, newest first. */
@Component({
  selector: 'ib-account-holds-tab',
  imports: [
    AccountBalancesComponent,
    BannerComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
  ],
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
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      font-weight: 600;
    }
    .meta {
      margin: var(--ib-space-1) 0 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    @if (store.account(); as account) {
      <section aria-labelledby="holds-balances">
        <h2 id="holds-balances">Balances</h2>
        <ib-account-balances [balance]="account.balance" />
      </section>
    }
    <h2>Hold and freeze history</h2>
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    } @else {
      <ib-data-table
        caption="Hold and freeze history"
        [rows]="rows()"
        [total]="rows().length"
        [pageSize]="rows().length || 1"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="When" let-row
          ><span class="ib-num">{{ when(row.createdOn) }}</span></ng-template
        >
        <ng-template ibColumn="Action" let-row>{{ action(row.action) }}</ng-template>
        <ng-template ibColumn="Amount" align="end" let-row
          ><span class="ib-num">{{ amount(row.amount) }}</span></ng-template
        >
        <ng-template ibColumn="Remarks" let-row>{{ row.remarks ?? '' }}</ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span>{{ action(row.action) }}</span>
            <span class="ib-num">{{ amount(row.amount) }}</span>
          </div>
          <p class="meta">{{ when(row.createdOn) }} · {{ row.remarks ?? '' }}</p>
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No holds yet" message="Holds and freezes appear here." icon="lock" />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class AccountHoldsTab {
  protected readonly store = inject(AccountRecordStore);
  private readonly client = inject(AccountsClient);

  protected readonly rows = signal<FreezeActionView[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<string | null>(null);

  constructor() {
    // Reload the history whenever the account changes (after a hold, release, freeze or unfreeze).
    effect(() => {
      const account = this.store.account();
      if (account) {
        untracked(() => void this.load(account.accountId));
      }
    });
  }

  private async load(accountId: number): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.client.freezeHistory(accountId));
      this.message.set(null);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly track = (row: FreezeActionView) => row.freezeReleaseId;
  protected readonly when = formatTimestamp;
  protected action(code: string): string {
    return label(FREEZE_ACTION_LABELS, code);
  }
  protected amount(value: number | null): string {
    return value === null ? '' : formatMoney(value, this.store.account()?.currencyCode ?? 'GHS');
  }
}
