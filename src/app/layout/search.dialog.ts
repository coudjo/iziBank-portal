import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzModalRef } from 'ng-zorro-antd/modal';
import type { AccountListRow, PartySearchRow } from '../core/api/api-types';
import { toApiProblem } from '../core/errors/api-problem';
import { messageFor } from '../core/errors/error-catalog';
import { searchTerm } from '../core/formats/phone';
import { AccountFiltersStore, AccountsClient } from '../features/accounts';
import { CustomerFiltersStore, CustomersClient, approvalCode, partyTypeLabel } from '../features/customers';
import { PermissionService } from '../core/permissions/permission.service';
import { StatusChipComponent } from '../shared/ui';

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const LIMIT = 8;

/**
 * Global search (UX 4.1, frontend plan 7.3, F3-04, P12): one query searches customers and accounts together, and
 * the results are grouped by kind in one listbox. Each kind is searched only with its view permission. Both searches
 * are POSTs, so the term never reaches a URL. ID numbers in results are masked by the API.
 */
@Component({
  selector: 'ib-search-dialog',
  imports: [StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .field {
      display: block;
      font-weight: 550;
      margin-bottom: var(--ib-space-1);
    }
    .hint {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    input {
      width: 100%;
      font-size: 16px;
    }
    .group {
      margin-top: var(--ib-space-4);
    }
    .group-title {
      font-size: 13px;
      font-weight: 650;
      color: var(--ib-ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 var(--ib-space-2);
    }
    [role='listbox'] {
      max-height: min(60vh, 28rem);
      overflow-y: auto;
    }
    [role='listbox'] .group:first-child {
      margin-top: 0;
    }
    .more {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--ib-space-4);
    }
    [role='option'] {
      padding: var(--ib-space-2) var(--ib-space-3);
      border-radius: var(--ib-radius-sm);
      cursor: pointer;
      border: 2px solid transparent;
    }
    [role='option'].active {
      border-color: var(--ib-focus);
      background: var(--ib-primary-tint);
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-1);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .status {
      margin: var(--ib-space-3) 0 0;
      color: var(--ib-ink-muted);
    }
    .all {
      font: inherit;
      color: var(--ib-primary);
      background: none;
      border: 0;
      padding: var(--ib-space-2) 0 0;
      text-decoration: underline;
      cursor: pointer;
      min-height: var(--ib-touch-target);
    }
  `,
  template: `
    <label class="field" for="ib-global-search">Search customers or accounts</label>
    <p class="hint" id="ib-global-search-hint">{{ hint() }} At least 2 characters.</p>
    <input
      data-autofocus
      id="ib-global-search"
      class="ant-input ib-input"
      type="search"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-describedby="ib-global-search-hint"
      aria-controls="ib-search-results"
      [attr.aria-expanded]="options().length > 0"
      [attr.aria-activedescendant]="activeId()"
      (input)="typed($event)"
      (keydown)="key($event)"
    />

    <p class="status" aria-live="polite">{{ status() }}</p>

    <div id="ib-search-results" role="listbox" aria-label="Search results" [hidden]="options().length === 0">
      @if (customers().length > 0) {
        <div class="group" role="group" aria-label="Customers">
          <p class="group-title" aria-hidden="true">Customers</p>
          @for (row of customers(); track row.partyId; let index = $index) {
            <div
              role="option"
              tabindex="-1"
              [id]="'ib-search-option-' + index"
              [class.active]="index === active()"
              [attr.aria-selected]="index === active()"
              (click)="choose(index)"
              (keydown.enter)="choose(index)"
              (mousemove)="active.set(index)"
            >
              <div class="top">
                <span>{{ row.displayName }}</span>
                <span class="ib-num">{{ row.partyNumber }}</span>
              </div>
              <div class="meta">
                <span>{{ typeLabel(row.partyTypeCode) }}</span>
                @if (row.identificationNumberMasked) {
                  <span class="ib-num">ID {{ row.identificationNumberMasked }}</span>
                }
                <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
                <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
              </div>
            </div>
          }
        </div>
      }
      @if (accounts().length > 0) {
        <div class="group" role="group" aria-label="Accounts">
          <p class="group-title" aria-hidden="true">Accounts</p>
          @for (row of accounts(); track row.accountId; let index = $index) {
            <div
              role="option"
              tabindex="-1"
              [id]="'ib-search-option-' + (customers().length + index)"
              [class.active]="customers().length + index === active()"
              [attr.aria-selected]="customers().length + index === active()"
              (click)="choose(customers().length + index)"
              (keydown.enter)="choose(customers().length + index)"
              (mousemove)="active.set(customers().length + index)"
            >
              <div class="top">
                <span>{{ row.accountName }}</span>
                <span class="ib-num">{{ row.accountNumber }}</span>
              </div>
              <div class="meta">
                <span>{{ row.productName }}</span>
                <ib-status-chip domain="account" [code]="row.status" />
              </div>
            </div>
          }
        </div>
      }
    </div>

    @if (customerTotal() > customers().length || accountTotal() > accounts().length) {
      <div class="more">
        @if (customerTotal() > customers().length) {
          <button type="button" class="all" (click)="showAllCustomers()">
            Show all {{ customerTotal() }} customers
          </button>
        }
        @if (accountTotal() > accounts().length) {
          <button type="button" class="all" (click)="showAllAccounts()">
            Show all {{ accountTotal() }} accounts
          </button>
        }
      </div>
    }
  `,
})
export class SearchDialogComponent {
  private readonly ref = inject<NzModalRef<SearchDialogComponent, void>>(NzModalRef);
  private readonly customersClient = inject(CustomersClient);
  private readonly accountsClient = inject(AccountsClient);
  private readonly customerFilters = inject(CustomerFiltersStore);
  private readonly accountFilters = inject(AccountFiltersStore);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  /** Each kind is searched only when the user may see it (deny by default). */
  private readonly canCustomers = this.permissions.can({ module: 'PTY', subModule: 'PARTY', action: 'view' });
  private readonly canAccounts = this.permissions.can({
    module: 'ACC',
    subModule: 'ACCOUNT',
    action: 'view',
  });

  protected readonly customers = signal<PartySearchRow[]>([]);
  protected readonly accounts = signal<AccountListRow[]>([]);
  protected readonly customerTotal = signal(0);
  protected readonly accountTotal = signal(0);
  protected readonly active = signal(-1);
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly options = computed<Option[]>(() => [
    ...this.customers().map((row): Option => ({ kind: 'customer', row })),
    ...this.accounts().map((row): Option => ({ kind: 'account', row })),
  ]);
  protected readonly hint = computed(() =>
    this.canCustomers && this.canAccounts
      ? 'Customer number, account number, name, mobile or ID number.'
      : this.canAccounts
        ? 'Account number, customer number or customer name.'
        : 'Customer number, name, mobile or ID number.',
  );
  protected readonly activeId = computed(() =>
    this.active() >= 0 ? `ib-search-option-${this.active()}` : null,
  );
  protected readonly status = computed(() => {
    if (this.error()) {
      return this.error();
    }
    if (this.query().trim().length < MIN_LENGTH) {
      return '';
    }
    if (this.loading()) {
      return 'Searching…';
    }
    const parts = [
      this.canCustomers ? count(this.customerTotal(), 'customer', 'customers') : null,
      this.canAccounts ? count(this.accountTotal(), 'account', 'accounts') : null,
    ].filter((part): part is string => part !== null);
    if (this.customerTotal() + this.accountTotal() === 0) {
      return this.canCustomers && this.canAccounts
        ? 'No customers or accounts match.'
        : this.canAccounts
          ? 'No accounts match.'
          : 'No customers match.';
    }
    return `${parts.join(' and ')} found.`;
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (text.trim().length < MIN_LENGTH) {
      this.request++;
      this.clearResults();
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.timer = setTimeout(() => void this.search(text), DEBOUNCE_MS);
  }

  protected key(event: KeyboardEvent): void {
    const total = this.options().length;
    if (event.key === 'ArrowDown' && total > 0) {
      event.preventDefault();
      this.active.set((this.active() + 1) % total);
      this.scrollActive();
    } else if (event.key === 'ArrowUp' && total > 0) {
      event.preventDefault();
      this.active.set(this.active() <= 0 ? total - 1 : this.active() - 1);
      this.scrollActive();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.options()[this.active()]) {
        this.choose(this.active());
      } else if (this.query().trim().length >= MIN_LENGTH) {
        if (this.canCustomers) {
          this.showAllCustomers();
        } else if (this.canAccounts) {
          this.showAllAccounts();
        }
      }
    }
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (!option) {
      return;
    }
    this.ref.close();
    void this.router.navigate(
      option.kind === 'customer' ? ['/customers', option.row.partyId] : ['/accounts', option.row.accountId],
    );
  }

  protected showAllCustomers(): void {
    this.customerFilters.clear();
    this.customerFilters.update({ q: this.query().trim() });
    this.ref.close();
    void this.router.navigateByUrl('/customers');
  }

  protected showAllAccounts(): void {
    this.accountFilters.search(this.query());
    this.ref.close();
    void this.router.navigateByUrl('/accounts');
  }

  /**
   * Both kinds are searched together. A failure in one still shows the other's results; the message says what could
   * not be searched.
   */
  private async search(text: string): Promise<void> {
    const id = ++this.request;
    this.error.set(null);
    const [customers, accounts] = await Promise.allSettled([
      this.canCustomers
        ? this.customersClient.search({ q: searchTerm(text), page: 1, pageSize: LIMIT })
        : Promise.resolve(null),
      this.canAccounts
        ? this.accountsClient.search({ q: text.trim(), page: 1, pageSize: LIMIT })
        : Promise.resolve(null),
    ]);
    if (id !== this.request) {
      return;
    }
    const customerPage = customers.status === 'fulfilled' ? customers.value : null;
    const accountPage = accounts.status === 'fulfilled' ? accounts.value : null;
    this.customers.set(customerPage?.items ?? []);
    this.customerTotal.set(customerPage?.totalCount ?? 0);
    this.accounts.set(accountPage?.items ?? []);
    this.accountTotal.set(accountPage?.totalCount ?? 0);
    this.active.set(this.options().length > 0 ? 0 : -1);
    const failed = [customers, accounts].find((result) => result.status === 'rejected');
    if (failed) {
      this.error.set(messageFor(toApiProblem(failed.reason)));
    }
    this.loading.set(false);
  }

  private clearResults(): void {
    this.customers.set([]);
    this.accounts.set([]);
    this.customerTotal.set(0);
    this.accountTotal.set(0);
    this.active.set(-1);
  }

  private scrollActive(): void {
    const id = this.activeId();
    if (id) {
      document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    }
  }

  protected readonly typeLabel = partyTypeLabel;
  protected readonly approval = approvalCode;
}

type Option = { kind: 'customer'; row: PartySearchRow } | { kind: 'account'; row: AccountListRow };

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}
