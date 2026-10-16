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
import { Router, RouterLink } from '@angular/router';
import type { CreditOfficerView, PartySearchRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { displayPhone, searchTerm } from '../../core/formats/phone';
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
  MenuButtonComponent,
  MenuItem,
  PageHeaderComponent,
  StatusChipComponent,
} from '../../shared/ui';
import { approvalCode, partyTypeLabel } from './customer-labels';
import { CustomerFiltersStore } from './customer-filters.store';
import { CustomersClient } from './customers.client';

const PAGE_SIZE = 25;

/** Customers list (UX 7.2, frontend plan 7.3, F5-01). */
@Component({
  selector: 'ib-customers-list-page',
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
    MenuButtonComponent,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.alt.n)': 'shortcutNew($event)' },
  styles: `
    .filters {
      display: grid;
      grid-template-columns: minmax(16rem, 2fr) repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0 var(--ib-space-4);
      align-items: end;
      margin-bottom: var(--ib-space-2);
    }
    @media (max-width: 767.98px) {
      .filters {
        grid-template-columns: 1fr;
      }
    }
    .filter-actions {
      margin-bottom: var(--ib-space-4);
    }
    .name {
      font-weight: 600;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-1);
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
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <ib-page-header title="Customers">
      <div ibActions>
        @if (newItems().length > 0) {
          <ib-menu-button
            label="New customer"
            variant="primary"
            icon="plus"
            [items]="newItems()"
            (selected)="newCustomer($event)"
          />
        }
      </div>
    </ib-page-header>

    <form class="filters" role="search" aria-label="Customers" (submit)="$event.preventDefault()">
      <ib-form-field label="Search" hint="Customer number, name, mobile or ID number">
        <input
          ibInput
          ibControl
          type="search"
          autocomplete="off"
          spellcheck="false"
          [value]="filters().q"
          (input)="typed($event)"
          (keydown.enter)="searchNow($event)"
        />
      </ib-form-field>
      <ib-form-field label="Type">
        <select ibInput ibControl (change)="pick('partyType', $event)">
          <option value="" [selected]="filters().partyType === null">All types</option>
          @for (option of types; track option.code) {
            <option [value]="option.code" [selected]="filters().partyType === option.code">
              {{ option.label }}
            </option>
          }
        </select>
      </ib-form-field>
      <ib-form-field label="KYC status">
        <select ibInput ibControl (change)="pick('kycStatus', $event)">
          <option value="" [selected]="filters().kycStatus === null">Any KYC status</option>
          @for (option of kycStatuses; track option.code) {
            <option [value]="option.code" [selected]="filters().kycStatus === option.code">
              {{ option.label }}
            </option>
          }
        </select>
      </ib-form-field>
      <ib-form-field label="Approval">
        <select ibInput ibControl (change)="pick('supervision', $event)">
          <option value="" [selected]="filters().supervision === null">Any approval state</option>
          <option value="PENDING" [selected]="filters().supervision === 'PENDING'">Awaiting approval</option>
          <option value="APPROVED" [selected]="filters().supervision === 'APPROVED'">Approved</option>
        </select>
      </ib-form-field>
      @if (officers().length > 0) {
        <ib-form-field label="Credit officer">
          <select ibInput ibControl (change)="pickOfficer($event)">
            <option value="" [selected]="filters().creditOfficerId === null">Any credit officer</option>
            @for (officer of officers(); track officer.creditOfficerId) {
              <option
                [value]="officer.creditOfficerId"
                [selected]="filters().creditOfficerId === officer.creditOfficerId"
              >
                {{ officer.fullName }}
              </option>
            }
          </select>
        </ib-form-field>
      }
    </form>
    @if (store.hasFilters) {
      <div class="filter-actions">
        <ib-button variant="quiet" icon="close" (click)="clearFilters()">Clear filters</ib-button>
      </div>
    }

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Customers"
        [rows]="rows()"
        [total]="total()"
        [page]="filters().page"
        [pageSize]="pageSize"
        [loading]="loading()"
        [descending]="!filters().oldestFirst"
        [trackBy]="trackParty"
        (pageChange)="store.goTo($event)"
        (sortChange)="store.update({ oldestFirst: !$event })"
      >
        <ng-template ibColumn="Customer number" let-row>
          <a class="ib-row-link ib-num" [routerLink]="['/customers', row.partyId]">{{ row.partyNumber }}</a>
        </ng-template>
        <ng-template ibColumn="Name" let-row
          ><span class="name">{{ row.displayName }}</span></ng-template
        >
        <ng-template ibColumn="Type" let-row>{{ typeLabel(row.partyTypeCode) }}</ng-template>
        <ng-template ibColumn="Mobile" let-row
          ><span class="ib-num">{{ phone(row.mobile) }}</span></ng-template
        >
        <ng-template ibColumn="KYC" let-row>
          <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
        </ng-template>
        <ng-template ibColumn="Approval" let-row>
          <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
        </ng-template>
        <ng-template ibColumn="Created" [sortable]="true" let-row>
          <span class="ib-num">{{ created(row.createdOn) }}</span>
        </ng-template>

        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/customers', row.partyId]">{{ row.displayName }}</a>
            <span class="ib-num">{{ row.partyNumber }}</span>
          </div>
          <p class="meta">
            {{ typeLabel(row.partyTypeCode) }}
            @if (row.mobile) {
              · <span class="ib-num">{{ phone(row.mobile) }}</span>
            }
          </p>
          <div class="chips">
            <ib-status-chip domain="kyc" [code]="row.effectiveKycStatusCode" />
            <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
          </div>
        </ng-template>

        <ng-template ibEmpty>
          @if (store.hasFilters) {
            <ib-empty-state
              title="No customers match"
              message="Clear filters or add a customer."
              icon="search"
            >
              <div class="actions">
                <ib-button (click)="clearFilters()">Clear filters</ib-button>
                @if (newItems().length > 0) {
                  <ib-menu-button
                    label="New customer"
                    variant="primary"
                    [items]="newItems()"
                    (selected)="newCustomer($event)"
                  />
                }
              </div>
            </ib-empty-state>
          } @else {
            <ib-empty-state title="No customers yet" message="Customers you add appear here." icon="team">
              @if (newItems().length > 0) {
                <ib-menu-button
                  label="New customer"
                  variant="primary"
                  [items]="newItems()"
                  (selected)="newCustomer($event)"
                />
              }
            </ib-empty-state>
          }
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class CustomersListPage {
  protected readonly store = inject(CustomerFiltersStore);
  private readonly client = inject(CustomersClient);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  protected readonly filters = this.store.filters;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly rows = signal<PartySearchRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly officers = signal<CreditOfficerView[]>([]);

  protected readonly types = [
    { code: 'INDIVIDUAL', label: 'Individual' },
    { code: 'BUSINESS', label: 'Business' },
    { code: 'GROUP', label: 'Group' },
  ];
  protected readonly kycStatuses = [
    { code: 'PENDING', label: 'KYC pending' },
    { code: 'VERIFIED', label: 'Verified' },
    { code: 'REJECTED', label: 'Rejected' },
  ];

  /** The New customer menu: each kind only with its add permission. */
  protected readonly newItems = computed((): MenuItem[] => {
    const items: MenuItem[] = [];
    if (this.permissions.can({ module: 'PTY', subModule: 'PARTY', action: 'add' })) {
      items.push({ label: 'Individual', value: 'individual' }, { label: 'Business', value: 'business' });
    }
    if (this.permissions.can({ module: 'PTY', subModule: 'GROUPS', action: 'add' })) {
      items.push({ label: 'Group', value: 'group' });
    }
    return items;
  });
  private request = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.filters();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => this.debounce && clearTimeout(this.debounce));
    if (this.permissions.can({ module: 'PTY', subModule: 'CREDIT_OFFICERS', action: 'view' })) {
      this.client.creditOfficers().then(
        (officers) => this.officers.set(officers.filter((officer) => !officer.isDisabled)),
        () => this.officers.set([]),
      );
    }
  }

  async load(): Promise<void> {
    const id = ++this.request;
    const current = this.filters();
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.client.search({
        q: current.q.trim() ? searchTerm(current.q) : null,
        partyType: current.partyType,
        kycStatus: current.kycStatus,
        supervision: current.supervision,
        creditOfficerId: current.creditOfficerId,
        oldestFirst: current.oldestFirst,
        page: current.page,
        pageSize: PAGE_SIZE,
      });
      if (id === this.request) {
        this.rows.set(page.items);
        this.total.set(page.totalCount);
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
        this.store.update({ q: text });
      }
    }, 300);
  }

  protected searchNow(event: Event): void {
    event.preventDefault();
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.store.update({ q: (event.target as HTMLInputElement).value });
  }

  protected pick(key: 'partyType' | 'kycStatus' | 'supervision', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.update({ [key]: value === '' ? null : value });
  }

  protected pickOfficer(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.update({ creditOfficerId: value === '' ? null : Number(value) });
  }

  protected clearFilters(): void {
    this.store.clear();
  }

  protected newCustomer(kind: string): void {
    void this.router.navigate(['/customers', 'new', kind]);
  }

  /** Alt+N (UX 5.9): a new individual, the most common kind. */
  protected shortcutNew(event: Event): void {
    if (this.newItems().some((item) => item.value === 'individual')) {
      event.preventDefault();
      this.newCustomer('individual');
    }
  }

  protected readonly trackParty = (row: PartySearchRow) => row.partyId;
  protected readonly typeLabel = partyTypeLabel;
  protected readonly approval = approvalCode;
  protected readonly phone = displayPhone;
  protected readonly created = (value: string) => formatTimestamp(value).slice(0, 10);
}
