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
import type { LedgerAccountView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
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
import { LEDGER_TYPE_LABELS } from './ledger-labels';
import { LedgerClient } from './ledger.client';

const PAGE_SIZE = 25;

/** Chart of accounts list with search and status filter (UX 7.6, F10). */
@Component({
  selector: 'ib-ledger-list-page',
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
    }
    @media (max-width: 767.98px) {
      .filters {
        grid-template-columns: 1fr;
      }
    }
    .name {
      font-weight: 600;
    }
    .flags {
      color: var(--ib-ink-muted);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
    .new {
      display: inline-flex;
      align-items: center;
      font-weight: 550;
    }
  `,
  template: `
    <ib-page-header title="Chart of accounts">
      <div ibActions>
        @if (canAdd()) {
          <a class="ant-btn ant-btn-primary new" routerLink="/ledger-accounts/new">New ledger account</a>
        }
      </div>
    </ib-page-header>
    <form class="filters" role="search" aria-label="Chart of accounts" (submit)="$event.preventDefault()">
      <ib-form-field label="Search" hint="Account code or name">
        <input ibInput ibControl type="search" autocomplete="off" (input)="typed($event)" />
      </ib-form-field>
      <ib-form-field label="Approval">
        <select ibInput ibControl (change)="pickState($event)">
          <option value="">Any approval state</option>
          <option value="PENDING">Awaiting approval</option>
          <option value="APPROVED">Approved</option>
        </select>
      </ib-form-field>
    </form>

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Chart of accounts"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="page.set($event)"
      >
        <ng-template ibColumn="Code" let-row>
          <a class="ib-row-link ib-num" [routerLink]="['/ledger-accounts', row.ledgerAccountId]">{{
            row.ledgerAccountCode
          }}</a>
        </ng-template>
        <ng-template ibColumn="Name" let-row
          ><span class="name">{{ row.accountName }}</span></ng-template
        >
        <ng-template ibColumn="Type" let-row>{{ type(row.ledgerAccountTypeCode) }}</ng-template>
        <ng-template ibColumn="Currency" let-row>{{ row.currencyCode ?? '—' }}</ng-template>
        <ng-template ibColumn="Branch" let-row>{{ row.branchCode }}</ng-template>
        <ng-template ibColumn="Approval" let-row>
          <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
        </ng-template>
        <ng-template ibColumn="Change" let-row
          ><span class="flags">{{ flags(row) }}</span></ng-template
        >
        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/ledger-accounts', row.ledgerAccountId]">{{
              row.accountName
            }}</a>
            <span class="ib-num">{{ row.ledgerAccountCode }}</span>
          </div>
          <p class="meta">
            {{ type(row.ledgerAccountTypeCode) }} · {{ row.currencyCode ?? '—' }} · {{ row.branchCode }}
          </p>
          <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No ledger accounts"
            message="Ledger accounts you create appear here."
            icon="audit"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class LedgerListPage {
  private readonly client = inject(LedgerClient);
  private readonly permissions = inject(PermissionService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly search = signal('');
  protected readonly state = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly rows = signal<LedgerAccountView[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'LED', subModule: 'CHART', action: 'add' }),
  );

  private request = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.search();
      this.state();
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
      const result = await this.client.ledgerAccounts({
        search: this.search() || null,
        supervisionState: this.state(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      });
      if (id === this.request) {
        this.rows.set(result.items);
        this.total.set(result.totalCount);
      }
    } catch (failure) {
      if (id === this.request) {
        this.error.set(messageFor(toApiProblem(failure)));
      }
    } finally {
      if (id === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => {
      this.page.set(1);
      this.search.set(text);
    }, 300);
  }

  protected pickState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.page.set(1);
    this.state.set(value || null);
  }

  protected flags(row: LedgerAccountView): string {
    return row.pendingChange ? `Rename to "${row.pendingChange.proposedName}" awaiting approval` : '';
  }

  protected type(code: string | null): string {
    return code ? (LEDGER_TYPE_LABELS[code] ?? code) : '—';
  }

  protected readonly approval = (state: string) => (state === 'PENDING' ? 'PENDING' : 'APPROVED');
  protected readonly track = (row: LedgerAccountView) => row.ledgerAccountId;
}
