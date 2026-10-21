import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CurrencyView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  DialogService,
  EmptyDirective,
  EmptyStateComponent,
  IconComponent,
  PageHeaderComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import type { CurrencyDialogData } from './currency.dialog';
import { ReferenceClient } from './reference.client';

/** Currencies (UX 7.7): one local currency, enforced and explained; other currencies carry a rate against it. */
@Component({
  selector: 'ib-currencies-page',
  imports: [
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    IconComponent,
    PageHeaderComponent,
    ReferenceBackComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .local {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
      font-weight: 600;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
      font-weight: 600;
    }
    .meta {
      margin: 0 0 var(--ib-space-2);
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Currencies">
      <div ibActions>
        @if (canAdd()) {
          <ib-button variant="primary" icon="plus" (click)="edit(null)">New currency</ib-button>
        }
      </div>
    </ib-page-header>
    @if (local(); as home) {
      <ib-banner
        tone="info"
        [message]="home.currencyCode + ' ' + home.currencyName + ' is the local currency.'"
        description="There is always exactly one. Other currencies carry a rate: the value of 1 unit in the local currency. Once products exist, the local currency cannot move."
      />
    }
    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
      <ib-button (click)="load()">Try again</ib-button>
    } @else {
      <ib-data-table
        caption="Currencies"
        [rows]="rows()"
        [total]="rows().length"
        [page]="1"
        [pageSize]="100"
        [loading]="loading()"
        [trackBy]="track"
      >
        <ng-template ibColumn="Code" let-row
          ><span class="ib-num">{{ row.currencyCode }}</span></ng-template
        >
        <ng-template ibColumn="Name" let-row>{{ row.currencyName }}</ng-template>
        <ng-template ibColumn="Rate" align="end" let-row
          ><span class="ib-num">{{ rate(row) }}</span></ng-template
        >
        <ng-template ibColumn="Local" let-row>
          @if (row.isLocalCurrency) {
            <span class="local"><ib-icon name="check-circle" />Local</span>
          } @else {
            <span>—<span class="ib-visually-hidden">Not local</span></span>
          }
        </ng-template>
        <ng-template ibColumn="Action" align="end" let-row>
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.currencyCode }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span>{{ row.currencyName }}</span>
            <span class="ib-num">{{ row.currencyCode }}</span>
          </div>
          <p class="meta">
            @if (row.isLocalCurrency) {
              <span class="local"><ib-icon name="check-circle" />Local currency</span>
            } @else {
              Rate <span class="ib-num">{{ rate(row) }}</span>
            }
          </p>
          @if (canEdit()) {
            <ib-button (click)="edit(row)"
              >Edit<span class="ib-visually-hidden"> {{ row.currencyCode }}</span></ib-button
            >
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No currencies" message="Add the local currency first." icon="sync" />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class CurrenciesPage {
  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly rows = signal<CurrencyView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly local = computed(() => this.rows().find((row) => row.isLocalCurrency) ?? null);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CURRENCIES', action: 'add' }),
  );
  protected readonly canEdit = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CURRENCIES', action: 'edit' }),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.client.currencies());
    } catch (failure) {
      this.error.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }

  protected rate(row: CurrencyView): string {
    return row.exchangeRate === null ? '—' : String(row.exchangeRate);
  }

  protected async edit(currency: CurrencyView | null): Promise<void> {
    const { CurrencyDialogComponent } = await import('./currency.dialog');
    const ref = await this.dialogs.open<
      InstanceType<typeof CurrencyDialogComponent>,
      CurrencyDialogData,
      boolean
    >(
      CurrencyDialogComponent,
      { currency, local: this.local() },
      { title: currency ? `Edit ${currency.currencyCode}` : 'New currency' },
    );
    ref.afterClose.subscribe((saved) => {
      if (saved) {
        this.toast.success(currency ? 'Currency saved.' : 'Currency created.');
        void this.load();
      }
    });
  }

  protected track(row: CurrencyView): number {
    return row.currencyId;
  }
}
