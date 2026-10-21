import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import type { ActivityRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import {
  BannerComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  EmptyDirective,
  EmptyStateComponent,
} from '../../shared/ui';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import { eventLabel, isSuccess } from '../../core/audit/audit-labels';

const PAGE_SIZE = 25;

/**
 * Activity tab (UX 7.3, F7): who did what to this customer, from the activity log. Needs audit permission; the
 * tab is hidden otherwise. Viewing it is itself recorded.
 */
@Component({
  selector: 'ib-customer-activity-tab',
  imports: [
    BannerComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    EmptyDirective,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .notice {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-meta);
      font-size: 13px;
    }
    details summary {
      cursor: pointer;
      color: var(--ib-primary);
      min-height: 24px;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      background: var(--ib-surface-subtle);
      padding: var(--ib-space-2);
      border-radius: var(--ib-radius-sm);
      margin: var(--ib-space-1) 0 0;
    }
    .failed {
      color: var(--ib-danger-text);
      font-weight: 600;
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      font-weight: 600;
    }
  `,
  template: `
    <p class="notice">Viewing the audit log is itself recorded.</p>
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    } @else {
      <ib-data-table
        caption="Activity"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="trackEvent"
        (pageChange)="page.set($event)"
      >
        <ng-template ibColumn="When" let-row
          ><span class="ib-num">{{ when(row.eventTimestamp) }}</span></ng-template
        >
        <ng-template ibColumn="Staff" let-row>{{ row.staffCode ?? 'System' }}</ng-template>
        <ng-template ibColumn="What" let-row>
          {{ label(row.eventCode) }}
          @if (!succeeded(row.outcome)) {
            <span class="failed"> ({{ row.outcome.toLowerCase() }})</span>
          }
        </ng-template>
        <ng-template ibColumn="Details" let-row>
          @if (row.requestDetailsJson) {
            <details>
              <summary>Show details</summary>
              <pre>{{ pretty(row.requestDetailsJson) }}</pre>
            </details>
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span
              >{{ label(row.eventCode) }}
              @if (!succeeded(row.outcome)) {
                <span class="failed"> ({{ row.outcome.toLowerCase() }})</span>
              }
            </span>
            <span class="ib-num">{{ when(row.eventTimestamp) }}</span>
          </div>
          <div>{{ row.staffCode ?? 'System' }}</div>
          @if (row.requestDetailsJson) {
            <details>
              <summary>Show details</summary>
              <pre>{{ pretty(row.requestDetailsJson) }}</pre>
            </details>
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state title="No activity recorded yet" icon="audit" />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class CustomerActivityTab {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly rows = signal<ActivityRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly message = signal<string | null>(null);

  constructor() {
    effect(() => {
      const party = this.store.party();
      const page = this.page();
      if (party) {
        untracked(() => void this.load(party.partyNumber, page));
      }
    });
  }

  protected label(code: string): string {
    return eventLabel(code);
  }

  protected succeeded(outcome: string): boolean {
    return isSuccess(outcome);
  }

  protected pretty(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  protected readonly when = formatTimestamp;
  protected readonly trackEvent = (row: ActivityRow) => row.eventId;

  private async load(partyNumber: string, page: number): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.client.activity(partyNumber, page, PAGE_SIZE);
      this.rows.set(result.items);
      this.total.set(result.totalCount);
      this.message.set(null);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    } finally {
      this.loading.set(false);
    }
  }
}
