import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ActivityRow, StaffSummary } from '../../core/api/api-types';
import { EVENT_LABELS, isSuccess } from '../../core/audit/audit-labels';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatTimestamp } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  BannerComponent,
  ButtonComponent,
  CardDirective,
  ColumnDirective,
  DataTableComponent,
  DateInputComponent,
  EmptyDirective,
  EmptyStateComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  StatusChipComponent,
} from '../../shared/ui';
import { SecurityClient } from '../admin';
import { ActivityFilter, AuditClient } from './audit.client';
import { RECORD_TYPES, activitySummary, dayRange, prettyJson } from './audit-rules';

const PAGE_SIZE = 25;

/**
 * Activity log (UX 6.12 steps 1, 2): filter by staff member, dates, event and record, then Apply. Each row reads as a
 * sentence, with the raw details in an expandable block. The API has no outcome filter yet (api-requests P20), so
 * the outcome is a column instead.
 */
@Component({
  selector: 'ib-activity-log-page',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    CardDirective,
    ColumnDirective,
    DataTableComponent,
    DateInputComponent,
    EmptyDirective,
    EmptyStateComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
      gap: 0 var(--ib-space-4);
      align-items: start;
      margin-bottom: var(--ib-space-3);
    }
    .actions {
      display: flex;
      gap: var(--ib-space-2);
      align-items: center;
      margin-top: 28px;
    }
    details summary {
      cursor: pointer;
      min-height: var(--ib-touch-target);
      display: flex;
      align-items: center;
      color: var(--ib-primary);
    }
    pre {
      margin: 0;
      padding: var(--ib-space-2);
      background: var(--ib-surface-subtle);
      border-radius: var(--ib-radius-sm);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-width: 28rem;
    }
    .muted {
      color: var(--ib-ink-muted);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-1);
    }
    .summary {
      font-weight: 600;
    }
  `,
  template: `
    <form
      [formGroup]="form"
      role="search"
      aria-label="Filter the activity log"
      (ngSubmit)="apply()"
      novalidate
    >
      @if (staff().length > 0) {
        <ib-form-field label="Staff member">
          <select ibInput ibControl formControlName="staffUserId">
            <option [ngValue]="null">Anyone</option>
            @for (person of staff(); track person.staffUserId) {
              <option [ngValue]="person.staffUserId">{{ person.fullName }} ({{ person.staffCode }})</option>
            }
          </select>
        </ib-form-field>
      }
      <ib-form-field label="From">
        <ib-date-input formControlName="from" />
      </ib-form-field>
      <ib-form-field label="To">
        <ib-date-input formControlName="to" />
      </ib-form-field>
      <ib-form-field label="Event">
        <select ibInput ibControl formControlName="eventCode">
          <option [ngValue]="null">Any event</option>
          @for (event of events; track event.code) {
            <option [ngValue]="event.code">{{ event.label }}</option>
          }
        </select>
      </ib-form-field>
      <ib-form-field label="Record type">
        <select ibInput ibControl formControlName="entityType">
          <option [ngValue]="null">Any record</option>
          @for (type of types; track type.code) {
            <option [ngValue]="type.code">{{ type.label }}</option>
          }
        </select>
      </ib-form-field>
      <ib-form-field label="Record number" hint="For example an account number">
        <input ibInput ibControl formControlName="entityId" autocomplete="off" maxlength="50" />
      </ib-form-field>
      <div class="actions">
        <ib-button variant="primary" type="submit" [loading]="loading()">Apply</ib-button>
        <ib-button (click)="clear()">Clear</ib-button>
      </div>
    </form>

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
    } @else {
      <ib-data-table
        caption="Activity"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="goTo($event)"
      >
        <ng-template ibColumn="When" let-row
          ><span class="ib-num">{{ time(row.eventTimestamp) }}</span></ng-template
        >
        <ng-template ibColumn="Staff" let-row>{{ row.staffCode ?? 'Not signed in' }}</ng-template>
        <ng-template ibColumn="What" let-row>{{ summary(row) }}</ng-template>
        <ng-template ibColumn="Outcome" let-row>
          <ib-status-chip domain="outcome" [code]="outcome(row.outcome)" />
        </ng-template>
        <ng-template ibColumn="Details" let-row>
          @if (details(row); as json) {
            <details>
              <summary>
                Show details<span class="ib-visually-hidden"> of event {{ row.eventId }}</span>
              </summary>
              <pre>{{ json }}</pre>
            </details>
          } @else {
            <span class="muted">—</span>
          }
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span class="ib-num muted">{{ time(row.eventTimestamp) }}</span>
            <ib-status-chip domain="outcome" [code]="outcome(row.outcome)" />
          </div>
          <p class="summary">{{ summary(row) }}</p>
          <p class="muted">{{ row.staffCode ?? 'Not signed in' }}</p>
          @if (details(row); as json) {
            <details>
              <summary>
                Show details<span class="ib-visually-hidden"> of event {{ row.eventId }}</span>
              </summary>
              <pre>{{ json }}</pre>
            </details>
          }
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No activity matches"
            message="Widen the dates or clear a filter."
            icon="audit"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class ActivityLogPage {
  private readonly client = inject(AuditClient);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly events = Object.entries(EVENT_LABELS)
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  protected readonly types = Object.entries(RECORD_TYPES)
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  protected readonly staff = signal<StaffSummary[]>([]);
  protected readonly rows = signal<ActivityRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private applied: ActivityFilter = blank();
  private request = 0;

  protected readonly form = new FormGroup({
    staffUserId: new FormControl<number | null>(null),
    from: new FormControl<string | null>(null),
    to: new FormControl<string | null>(null),
    eventCode: new FormControl<string | null>(null),
    entityType: new FormControl<string | null>(null),
    entityId: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    if (inject(PermissionService).can({ module: 'SEC', subModule: 'USERS', action: 'view' })) {
      inject(SecurityClient)
        .staff({ page: 1, pageSize: 100 })
        .then(
          (result) => this.staff.set(result.items),
          () => this.staff.set([]),
        );
    }
    void this.load();
  }

  protected apply(): void {
    const value = this.form.getRawValue();
    const range = dayRange(value.from, value.to);
    this.applied = {
      staffUserId: value.staffUserId,
      eventCode: value.eventCode,
      entityType: value.entityType,
      entityId: value.entityId.trim() || null,
      ...range,
    };
    this.page.set(1);
    void this.load();
  }

  protected clear(): void {
    this.form.reset({
      staffUserId: null,
      from: null,
      to: null,
      eventCode: null,
      entityType: null,
      entityId: '',
    });
    this.apply();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  private async load(): Promise<void> {
    const id = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.client.activity(this.applied, this.page(), PAGE_SIZE);
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

  protected summary(row: ActivityRow): string {
    return activitySummary(row);
  }

  protected outcome(value: string): string {
    return isSuccess(value) ? 'SUCCESS' : value.toUpperCase();
  }

  protected details(row: ActivityRow): string | null {
    return prettyJson(row.requestDetailsJson);
  }

  protected time(value: string): string {
    return formatTimestamp(value);
  }

  protected track(row: ActivityRow): number {
    return row.eventId;
  }
}

function blank(): ActivityFilter {
  return { staffUserId: null, eventCode: null, entityType: null, entityId: null, from: null, to: null };
}
