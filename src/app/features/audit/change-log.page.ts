import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { ChangeRow, StaffSummary } from '../../core/api/api-types';
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
  IconComponent,
  InputDirective,
} from '../../shared/ui';
import { SecurityClient } from '../admin';
import { AuditClient, ChangeFilter } from './audit.client';
import { ACTION_LABELS, FieldChange, RECORD_TYPES, dayRange, fieldChanges, recordType } from './audit-rules';

const PAGE_SIZE = 25;

/**
 * Data-change log (UX 6.12 step 3): old and new values side by side for each changed field. Secret values never
 * appear; the API replaces them before storing, and the page says "Hidden" with a lock rather than the marker.
 */
@Component({
  selector: 'ib-change-log-page',
  imports: [
    NgTemplateOutlet,
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
    IconComponent,
    InputDirective,
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
    table.fields {
      border-collapse: collapse;
      font-size: 13px;
      min-width: 18rem;
    }
    table.fields th,
    table.fields td {
      text-align: left;
      padding: 2px var(--ib-space-2) 2px 0;
      vertical-align: top;
      border-top: 1px solid var(--ib-line);
    }
    table.fields thead th {
      border-top: 0;
      color: var(--ib-ink-muted);
      font-weight: 600;
    }
    .hidden {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--ib-ink-muted);
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
    .what {
      font-weight: 600;
    }
  `,
  template: `
    <form
      [formGroup]="form"
      role="search"
      aria-label="Filter the data-change log"
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
      <ib-form-field label="Record type">
        <select ibInput ibControl formControlName="tableName">
          <option [ngValue]="null">Any record</option>
          @for (type of types; track type.code) {
            <option [ngValue]="type.code">{{ type.label }}</option>
          }
        </select>
      </ib-form-field>
      <ib-form-field label="Record id" hint="The record's number in the database">
        <input ibInput ibControl formControlName="recordId" autocomplete="off" maxlength="50" />
      </ib-form-field>
      <div class="actions">
        <ib-button variant="primary" type="submit" [loading]="loading()">Apply</ib-button>
        <ib-button (click)="clear()">Clear</ib-button>
      </div>
    </form>

    <ng-template #fieldsTable let-row>
      @if (changes(row); as fields) {
        @if (fields.length === 0) {
          <span class="muted">No field values</span>
        } @else {
          <table class="fields" [attr.aria-label]="'Changes to ' + what(row)">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              @for (field of fields; track field.field) {
                <tr>
                  <th scope="row">{{ field.field }}</th>
                  <td>
                    @if (field.hidden && field.before === 'Hidden') {
                      <span class="hidden"><ib-icon name="lock" />Hidden</span>
                    } @else {
                      {{ field.before }}
                    }
                  </td>
                  <td>
                    @if (field.hidden && field.after === 'Hidden') {
                      <span class="hidden"><ib-icon name="lock" />Hidden</span>
                    } @else {
                      {{ field.after }}
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </ng-template>

    @if (error(); as message) {
      <ib-banner tone="danger" [message]="message" />
    } @else {
      <ib-data-table
        caption="Data changes"
        [rows]="rows()"
        [total]="total()"
        [page]="page()"
        [pageSize]="pageSize"
        [loading]="loading()"
        [trackBy]="track"
        (pageChange)="goTo($event)"
      >
        <ng-template ibColumn="When" let-row
          ><span class="ib-num">{{ time(row.loggedOn) }}</span></ng-template
        >
        <ng-template ibColumn="Staff" let-row>{{ row.staffCode ?? 'System' }}</ng-template>
        <ng-template ibColumn="Record" let-row>{{ what(row) }}</ng-template>
        <ng-template ibColumn="Changes" let-row>
          <ng-container [ngTemplateOutlet]="fieldsTable" [ngTemplateOutletContext]="{ $implicit: row }" />
        </ng-template>
        <ng-template ibCard let-row>
          <div class="card-top">
            <span class="what">{{ what(row) }}</span>
            <span class="ib-num muted">{{ time(row.loggedOn) }}</span>
          </div>
          <p class="muted">{{ row.staffCode ?? 'System' }}</p>
          <ng-container [ngTemplateOutlet]="fieldsTable" [ngTemplateOutletContext]="{ $implicit: row }" />
        </ng-template>
        <ng-template ibEmpty>
          <ib-empty-state
            title="No changes match"
            message="Widen the dates or clear a filter."
            icon="audit"
          />
        </ng-template>
      </ib-data-table>
    }
  `,
})
export class ChangeLogPage {
  private readonly client = inject(AuditClient);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly types = Object.entries(RECORD_TYPES)
    .filter(([code]) => !code.endsWith('Log'))
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  protected readonly staff = signal<StaffSummary[]>([]);
  protected readonly rows = signal<ChangeRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private applied: ChangeFilter = {
    staffUserId: null,
    tableName: null,
    recordId: null,
    from: null,
    to: null,
  };
  private request = 0;

  protected readonly form = new FormGroup({
    staffUserId: new FormControl<number | null>(null),
    from: new FormControl<string | null>(null),
    to: new FormControl<string | null>(null),
    tableName: new FormControl<string | null>(null),
    recordId: new FormControl('', { nonNullable: true }),
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
    this.applied = {
      staffUserId: value.staffUserId,
      tableName: value.tableName,
      recordId: value.recordId.trim() || null,
      ...dayRange(value.from, value.to),
    };
    this.page.set(1);
    void this.load();
  }

  protected clear(): void {
    this.form.reset({ staffUserId: null, from: null, to: null, tableName: null, recordId: '' });
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
      const result = await this.client.changes(this.applied, this.page(), PAGE_SIZE);
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

  protected what(row: ChangeRow): string {
    return `${ACTION_LABELS[row.actionType] ?? row.actionType} · ${recordType(row.tableName)}${row.recordId ? ` ${row.recordId}` : ''}`;
  }

  protected changes(row: ChangeRow): FieldChange[] {
    return fieldChanges(row);
  }

  protected time(value: string): string {
    return formatTimestamp(value);
  }

  protected track(row: ChangeRow): number {
    return row.auditId;
  }
}
