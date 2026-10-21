import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AccountListRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  PageHeaderComponent,
  StatusChipComponent,
} from '../../shared/ui';
import { ACCOUNT_STATUSES } from './account-labels';
import { AccountFiltersStore } from './account-filters.store';
import { AccountsClient } from './accounts.client';

const PAGE_SIZE = 25;

/** Accounts list and search (UX 7.4, F9). The search term goes in the request body, never the URL. */
@Component({
  selector: 'ib-accounts-list-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: minmax(16rem, 2fr) minmax(10rem, 1fr);
      gap: 0 var(--ib-space-4);
      align-items: end;
      margin-bottom: var(--ib-space-2);
    }
    @media (max-width: 767.98px) {
      .filters {
        grid-template-columns: 1fr;
      }
    }
    .name {
      font-weight: 600;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-2);
    }
    .meta {
      color: var(--ib-ink-muted);
      margin: 0 0 var(--ib-space-2);
    }
    .new {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
  `,
  template: `
    <ib-page-header title="Accounts">
      <div ibActions>
        @if (canOpen()) {
          <a class="ant-btn ant-btn-primary new" routerLink="/accounts/new">Open account</a>
        }
      </div>
    </ib-page-header>

    <form class="filters" role="search" aria-label="Accounts" (submit)="$event.preventDefault()">
      <ib-form-field label="Search" hint="Account number, customer number or customer name">
        <input
          ibInput
          ibControl
          type="search"
          autocomplete="off"
          spellcheck="false"
          [value]="term()"
          (input)="typed($event)"
          (keydown.enter)="searchNow($event)"
        />
      </ib-form-field>
      <ib-form-field label="Status">
        <select ibInput ibControl (change)="pickStatus($event)">
          <option value="" [selected]="status() === null">Any status</option>
          @for (option of statuses; track option.code) {
            <option [value]="option.code" [selected]="status() === option.code">{{ option.label }}</option>
          }
        </select>
      </ib-form-field>
    </form>

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Accounts"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="trackAccount"
        (pageChange)="page.set($event)"
      >
        <ng-template ibColumn="Account number" let-row>
          <a class="ib-row-link ib-num" [routerLink]="['/accounts', row.accountId]">{{
            row.accountNumber
          }}</a>
        </ng-template>
        <ng-template ibColumn="Name" let-row
          ><span class="name">{{ row.accountName }}</span></ng-template
        >
        <ng-template ibColumn="Product" let-row>{{ row.productName }}</ng-template>
        <ng-template ibColumn="Branch" let-row>{{ row.branchCode }}</ng-template>
        <ng-template ibColumn="Primary holder" let-row>{{ row.primaryHolderName ?? '—' }}</ng-template>
        <ng-template ibColumn="Status" let-row>
          <ib-status-chip domain="account" [code]="row.status" />
        </ng-template>
        <ng-template ibColumn="Opened" let-row
          ><span class="ib-num">{{ date(row.dateOpened) }}</span></ng-template
        >

        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/accounts', row.accountId]">{{ row.accountName }}</a>
            <span class="ib-num">{{ row.accountNumber }}</span>
          </div>
          <p class="meta">{{ row.productName }} · {{ row.primaryHolderName ?? '—' }}</p>
          <ib-status-chip domain="account" [code]="row.status" />
        </ng-template>

        <ng-template ibEmpty>
          @if (term() || status()) {
            <ib-empty-state title="No accounts match" message="Try another search or status." icon="search" />
          } @else {
            <ib-empty-state title="No accounts yet" message="Accounts you open appear here." icon="bank" />
          }
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class AccountsListPage {
  private readonly client = inject(AccountsClient);
  private readonly permissions = inject(PermissionService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = ACCOUNT_STATUSES;
  private readonly filters = inject(AccountFiltersStore);
  protected readonly term = this.filters.term;
  protected readonly status = this.filters.status;
  protected readonly page = this.filters.page;
  protected readonly rows = signal<AccountListRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canOpen = computed(() =>
    this.permissions.can({ module: 'ACC', subModule: 'ACCOUNT', action: 'add' }),
  );

  private request = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.term();
      this.status();
      this.page();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => this.debounce && clearTimeout(this.debounce));
  }

  async load(): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.client.search({
        q: this.term().trim() || null,
        status: this.status(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      });
      if (id === this.request) {
        this.rows.set(result.items);
        this.total.set(result.totalCount);
      }
    } catch (failure) {
      if (id === this.request) {
        this.rows.set([]);
        this.total.set(0);
        this.error.set(messageFor(toApiProblem(failure)));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || trimmed.length >= 2) {
        this.page.set(1);
        this.term.set(trimmed);
      }
    }, 300);
  }

  protected searchNow(event: Event): void {
    event.preventDefault();
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.page.set(1);
    this.term.set((event.target as HTMLInputElement).value.trim());
  }

  protected pickStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.page.set(1);
    this.status.set(value === '' ? null : value);
  }

  protected readonly date = formatDate;
  protected readonly trackAccount = (row: AccountListRow) => row.accountId;
}
