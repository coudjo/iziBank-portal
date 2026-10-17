import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatTimestamp } from '../../core/formats/dates';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
  PageHeaderComponent,
  TabsComponent,
} from '../../shared/ui';
import { ApprovalItem, ApprovalKind, ApprovalsService } from './approvals.service';

export const KIND_LABELS: Readonly<Record<ApprovalKind, string>> = {
  customers: 'Customers',
  ledger: 'Chart of accounts',
  security: 'Security',
};

/** Approvals inbox (UX 6.6 step 1, 7.5; F8): a tab per record type with counts, oldest first. */
@Component({
  selector: 'ib-approvals-inbox-page',
  imports: [
    RouterLink,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
    PageHeaderComponent,
    TabsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .own {
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .what {
      font-weight: 600;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
    }
    .meta {
      color: var(--ib-ink-muted);
      margin: var(--ib-space-1) 0 0;
    }
    .note {
      color: var(--ib-ink-meta);
      font-size: 13px;
      margin: 0 0 var(--ib-space-3);
    }
  `,
  template: `
    <ib-page-header title="Approvals">
      <div ibActions>
        <ib-button icon="sync" [loading]="approvals.loading()" (click)="approvals.refresh()"
          >Refresh</ib-button
        >
      </div>
    </ib-page-header>
    <ib-tabs label="Approvals by type" [tabs]="tabs()" />

    @if (approvals.failed().includes(kind())) {
      <ib-banner tone="danger" message="We could not load this list. Try Refresh." />
    }
    @if (kind() === 'customers') {
      <p class="note">Customers are approved by verifying their KYC. Opening one takes you to its KYC tab.</p>
    }

    <ib-data-table
      [caption]="label()"
      [rows]="rows()"
      [total]="rows().length"
      [pageSize]="rows().length || 1"
      [loading]="approvals.loading() && rows().length === 0"
      [trackBy]="track"
    >
      <ng-template ibColumn="What" let-row>
        <a class="ib-row-link what" [routerLink]="row.link">{{ row.what }}</a>
        @if (own(row)) {
          <span class="own"> (yours, another approver needed)</span>
        }
      </ng-template>
      <ng-template ibColumn="Change" let-row>{{ row.detail }}</ng-template>
      <ng-template ibColumn="Requested by" let-row>{{ row.requestedBy ?? '—' }}</ng-template>
      <ng-template ibColumn="When" let-row
        ><span class="ib-num">{{ when(row.requestedOn) }}</span></ng-template
      >
      <ng-template ibColumn="Age" let-row>{{ age(row.requestedOn) }}</ng-template>

      <ng-template ibCard let-row>
        <div class="card-top">
          <a class="ib-row-link what" [routerLink]="row.link">{{ row.what }}</a>
          <span>{{ age(row.requestedOn) }}</span>
        </div>
        <p class="meta">
          {{ row.detail }}
          @if (row.requestedBy) {
            · {{ row.requestedBy }}
          }
        </p>
        @if (own(row)) {
          <p class="own">Yours, another approver needed</p>
        }
      </ng-template>

      <ng-template ibEmpty>
        <ib-empty-state
          title="Nothing waiting"
          message="There is nothing here for you to approve."
          icon="check-circle"
        />
      </ng-template>
    </ib-data-table>
  `,
})
export class ApprovalsInboxPage {
  /** Route parameter `:kind`. */
  readonly kind = input.required<ApprovalKind>();

  protected readonly approvals = inject(ApprovalsService);
  protected readonly label = computed(() => KIND_LABELS[this.kind()]);
  protected readonly rows = computed(() =>
    this.approvals.items().filter((item) => item.kind === this.kind()),
  );
  protected readonly tabs = computed(() =>
    this.approvals.kinds().map((kind) => {
      const count = this.approvals
        .items()
        .filter((item) => item.kind === kind && !this.approvals.isOwn(item)).length;
      return { label: `${KIND_LABELS[kind]} (${count})`, path: `../${kind}` };
    }),
  );

  constructor() {
    void this.approvals.refresh();
  }

  protected own(item: ApprovalItem): boolean {
    return this.approvals.isOwn(item);
  }

  protected when(value: string): string {
    return value ? formatTimestamp(value) : '—';
  }

  /** "3 days", "5 hours", "just now". */
  protected age(value: string): string {
    if (!value) {
      return '—';
    }
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
    if (minutes < 60) {
      return minutes < 2 ? 'Just now' : `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${Math.floor(hours / 24)} days`;
  }

  protected readonly track = (item: ApprovalItem) => item.link.join('/');
}
