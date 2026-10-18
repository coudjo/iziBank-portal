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
import type { ProductView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatMoney } from '../../core/formats/money';
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
import { PRODUCT_TYPE_LABELS, approvalChip, labelOf } from './product-labels';
import { ProductsClient } from './products.client';

const PAGE_SIZE = 25;

/** Products list with search and status filter (UX 7.6, F10). */
@Component({
  selector: 'ib-products-list-page',
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
    <ib-page-header title="Products">
      <div ibActions>
        @if (canAdd()) {
          <a class="ant-btn ant-btn-primary new" routerLink="/products/new">New product</a>
        }
      </div>
    </ib-page-header>
    <form class="filters" role="search" aria-label="Products" (submit)="$event.preventDefault()">
      <ib-form-field label="Search" hint="Product code or name">
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
        caption="Products"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="page.set($event)"
      >
        <ng-template ibColumn="Code" let-row>
          <a class="ib-row-link ib-num" [routerLink]="['/products', row.productId]">{{ row.productCode }}</a>
        </ng-template>
        <ng-template ibColumn="Name" let-row
          ><span class="name">{{ row.productName }}</span></ng-template
        >
        <ng-template ibColumn="Type" let-row>{{ type(row.productTypeCode) }}</ng-template>
        <ng-template ibColumn="Currency" let-row>{{ row.currencyCode }}</ng-template>
        <ng-template ibColumn="Minimum balance" align="end" let-row
          ><span class="ib-num">{{ minimum(row) }}</span></ng-template
        >
        <ng-template ibColumn="Approval" let-row>
          <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
        </ng-template>
        <ng-template ibColumn="State" let-row
          ><span class="flags">{{ flags(row) }}</span></ng-template
        >
        <ng-template ibCard let-row>
          <div class="card-top">
            <a class="ib-row-link name" [routerLink]="['/products', row.productId]">{{ row.productName }}</a>
            <span class="ib-num">{{ row.productCode }}</span>
          </div>
          <p class="meta">{{ type(row.productTypeCode) }} · {{ row.currencyCode }} · {{ flags(row) }}</p>
          <ib-status-chip domain="approval" [code]="approval(row.supervisionState)" />
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No products" message="Products you create appear here." icon="appstore" />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class ProductsListPage {
  private readonly client = inject(ProductsClient);
  private readonly permissions = inject(PermissionService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly search = signal('');
  protected readonly state = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly rows = signal<ProductView[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'ACC', subModule: 'PRODUCT', action: 'add' }),
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
      const result = await this.client.products({
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

  protected flags(row: ProductView): string {
    const parts = [row.isActive ? 'Active' : 'Inactive'];
    if (row.isFreezed) {
      parts.push('Frozen');
    }
    if (row.pendingChange) {
      parts.push('Change awaiting approval');
    }
    return parts.join(' · ');
  }

  protected minimum(row: ProductView): string {
    return row.minimumBalance === null ? '—' : formatMoney(row.minimumBalance, row.currencyCode);
  }

  protected type(code: string): string {
    return labelOf(PRODUCT_TYPE_LABELS, code);
  }

  protected readonly approval = approvalChip;
  protected readonly track = (row: ProductView) => row.productId;
}
