import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AccountBalanceView } from '../../core/api/api-types';
import { formatMoney } from '../../core/formats/money';

/**
 * The four balances (UX 7.4): clear, held, available and total. Until the transactions phase they all read zero, so
 * the card says "No transactions yet" rather than showing bare zeros.
 */
@Component({
  selector: 'ib-account-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--ib-space-3);
      margin: 0;
    }
    @media (max-width: 767.98px) {
      dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    div {
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-sm);
      padding: var(--ib-space-3);
    }
    dt {
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    dd {
      margin: var(--ib-space-1) 0 0;
      font-size: 18px;
      font-weight: 650;
    }
    .note {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <dl>
      <div>
        <dt>Clear balance</dt>
        <dd class="ib-num">{{ money(balance().clearBalance) }}</dd>
      </div>
      <div>
        <dt>Held</dt>
        <dd class="ib-num">{{ money(balance().freezedAmount) }}</dd>
      </div>
      <div>
        <dt>Available balance</dt>
        <dd class="ib-num" data-testid="available-balance">{{ money(balance().availableBalance) }}</dd>
      </div>
      <div>
        <dt>Total balance</dt>
        <dd class="ib-num">{{ money(balance().totalBalance) }}</dd>
      </div>
    </dl>
    @if (noTransactions()) {
      <p class="note">No transactions yet.</p>
    }
    @if (balance().minimumBalance !== null) {
      <p class="note">Minimum balance for this product: {{ money(balance().minimumBalance ?? 0) }}</p>
    }
  `,
})
export class AccountBalancesComponent {
  readonly balance = input.required<AccountBalanceView>();

  protected readonly noTransactions = computed(
    () => !this.balance().lastCreditTransactionDate && !this.balance().lastDebitTransactionDate,
  );

  protected money(amount: number): string {
    return formatMoney(amount, this.balance().currencyCode);
  }
}
