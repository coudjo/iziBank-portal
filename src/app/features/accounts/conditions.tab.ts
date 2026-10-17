import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { formatMoney } from '../../core/formats/money';
import { AccountRecordStore } from './account-record.store';

/**
 * Conditions tab (UX 7.4): freeze, dormancy, limits and flags. Freezing and dormancy are changed from the Actions
 * menu; limits and flags are set by later phases and shown here read-only.
 */
@Component({
  selector: 'ib-account-conditions-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) 2fr;
      gap: var(--ib-space-2) var(--ib-space-4);
      margin: 0;
    }
    @media (max-width: 767.98px) {
      dl {
        grid-template-columns: 1fr;
      }
      dd {
        margin-bottom: var(--ib-space-2);
      }
    }
    dt {
      color: var(--ib-ink-muted);
    }
    dd {
      margin: 0;
    }
    .note {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    @if (store.account(); as account) {
      <section aria-label="Conditions">
        <dl>
          <dt>Frozen</dt>
          <dd>{{ yesNo(account.condition.isFreezed) }}</dd>
          <dt>Dormant</dt>
          <dd>{{ yesNo(account.isDormant) }}</dd>
          <dt>Credits allowed</dt>
          <dd>{{ yesNo(!account.condition.doNotAllowCredit) }}</dd>
          <dt>Debits allowed</dt>
          <dd>{{ yesNo(!account.condition.doNotAllowDebit) }}</dd>
          <dt>Credit limit</dt>
          <dd class="ib-num">{{ limit(account.condition.creditLimit, account.currencyCode) }}</dd>
          <dt>Debit limit</dt>
          <dd class="ib-num">{{ limit(account.condition.debitLimit, account.currencyCode) }}</dd>
          <dt>Approve every transaction</dt>
          <dd>{{ yesNo(account.condition.superviseAllTransactions) }}</dd>
          <dt>Transaction charges</dt>
          <dd>{{ account.condition.doNotApplyTransactionCharges ? 'Not charged' : 'Charged' }}</dd>
        </dl>
        <p class="note">Freeze and dormancy are changed from the Actions menu.</p>
      </section>
    }
  `,
})
export class AccountConditionsTab {
  protected readonly store = inject(AccountRecordStore);

  protected yesNo(value: boolean): string {
    return value ? 'Yes' : 'No';
  }

  protected limit(value: number | null, currency: string): string {
    return value === null ? 'No limit' : formatMoney(value, currency);
  }
}
