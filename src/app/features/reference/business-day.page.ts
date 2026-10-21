import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { BranchView, BusinessDayView, HolidayView } from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { WorkingDateService } from '../../core/branch/working-date.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate, formatTimestamp, todayIso } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DateInputComponent,
  DialogService,
  FormFieldComponent,
  PageHeaderComponent,
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import { nextWorkingDay, skippedDays, whyNotOpen } from './reference-rules';
import { ReferenceClient } from './reference.client';

interface BranchDay {
  branch: BranchView;
  latest: BusinessDayView | null;
}

/**
 * Open and close the business day (UX 6.11). A supervisor sees every branch's latest day. Open and Close act on the
 * working branch only (the API refuses another branch), so other branches say to switch branch first. Open proposes
 * the next working day and says why the dates in between are skipped; Close warns that end of day is not part of
 * this phase.
 */
@Component({
  selector: 'ib-business-day-page',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    DateInputComponent,
    FormFieldComponent,
    PageHeaderComponent,
    ReferenceBackComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    .state {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2) var(--ib-space-3);
      margin-bottom: var(--ib-space-3);
      font-size: 16px;
    }
    .open {
      max-width: 32rem;
    }
    .skipped {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
    }
    .skipped ul {
      margin: var(--ib-space-1) 0 0;
      padding-left: var(--ib-space-4);
    }
    .actions {
      display: flex;
      gap: var(--ib-space-2);
      flex-wrap: wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      text-align: left;
      padding: var(--ib-space-2);
      border-top: 1px solid var(--ib-line);
      vertical-align: top;
    }
    th {
      background: var(--ib-surface-subtle);
      font-weight: 600;
    }
    .muted {
      color: var(--ib-ink-muted);
    }
    .scroll {
      overflow-x: auto;
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Business day" />
    @if (failure(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }

    <section aria-labelledby="this-branch-title">
      <h2 id="this-branch-title">{{ branchName() }}</h2>
      <div class="state">
        <ib-status-chip domain="businessDay" [code]="stateCode()" [explain]="true" />
        @if (latest(); as day) {
          <span
            >{{ day.status === 'OPEN' ? 'Working date' : 'Last business day' }}
            <strong class="ib-num">{{ date(day.workingDate) }}</strong></span
          >
        } @else {
          <span>No business day has been opened in this branch yet.</span>
        }
      </div>

      @if (latest()?.status === 'OPEN') {
        @if (canClose()) {
          <ib-button variant="primary" [loading]="guard.busy()" (click)="close()">Close day</ib-button>
        } @else {
          <p class="muted">A supervisor closes the day.</p>
        }
      } @else if (canOpen()) {
        <form class="open" (submit)="$event.preventDefault(); open()" novalidate>
          <ib-form-field
            label="Date to open"
            [required]="true"
            [hint]="'Proposed: ' + date(proposed())"
            [error]="refusal()"
          >
            <ib-date-input [formControl]="openOn" />
          </ib-form-field>
          @if (skipped().length > 0) {
            <div class="skipped">
              Not working days since the last business day:
              <ul>
                @for (line of skipped(); track line) {
                  <li>{{ line }}</li>
                }
              </ul>
            </div>
          }
          <div class="actions">
            <ib-button variant="primary" type="submit" [disabled]="!!refusal()" [loading]="guard.busy()"
              >Open day</ib-button
            >
          </div>
        </form>
      } @else {
        <p class="muted">A supervisor opens the day.</p>
      }
    </section>

    <section aria-labelledby="recent-title">
      <h2 id="recent-title">Recent days in {{ branchName() }}</h2>
      @if (recent().length === 0) {
        <p class="muted">None yet.</p>
      } @else {
        <div class="scroll" tabindex="0" role="region" aria-label="Recent days table">
          <table>
            <thead>
              <tr>
                <th scope="col">Working date</th>
                <th scope="col">Status</th>
                <th scope="col">Opened</th>
                <th scope="col">Closed</th>
              </tr>
            </thead>
            <tbody>
              @for (day of recent(); track day.businessDayStatusId) {
                <tr>
                  <td class="ib-num">{{ date(day.workingDate) }}</td>
                  <td><ib-status-chip domain="businessDay" [code]="day.status ?? 'CLOSED'" /></td>
                  <td class="ib-num">{{ time(day.startedOn) }}</td>
                  <td class="ib-num">{{ time(day.endedOn) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (others().length > 0) {
      <section aria-labelledby="others-title">
        <h2 id="others-title">Other branches</h2>
        <p class="muted">
          To open or close another branch's day, switch to that branch from your account menu.
        </p>
        <div class="scroll" tabindex="0" role="region" aria-label="Other branches table">
          <table>
            <thead>
              <tr>
                <th scope="col">Branch</th>
                <th scope="col">Status</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              @for (row of others(); track row.branch.branchId) {
                <tr>
                  <td>{{ row.branch.branchCode }} {{ row.branch.branchName }}</td>
                  <td>
                    <ib-status-chip
                      domain="businessDay"
                      [code]="row.latest ? (row.latest.status ?? 'CLOSED') : 'NOT_OPEN'"
                    />
                  </td>
                  <td class="ib-num">{{ row.latest ? date(row.latest.workingDate) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
})
export class BusinessDayPage {
  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly workingDate = inject(WorkingDateService);
  private readonly me = inject(AuthService).me;

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  private readonly branches = signal<BranchDay[]>([]);
  protected readonly recent = signal<BusinessDayView[]>([]);
  private readonly holidays = signal<HolidayView[]>([]);
  protected readonly openOn = new FormControl<string | null>(null);
  private readonly openValue = signal<string | null>(null);

  private readonly branchId = computed(() => this.me()?.branchId ?? null);
  protected readonly branchName = computed(
    () =>
      this.branches().find((row) => row.branch.branchId === this.branchId())?.branch.branchName ??
      'This branch',
  );
  protected readonly latest = computed(() => this.recent()[0] ?? null);
  protected readonly others = computed(() =>
    this.branches().filter((row) => row.branch.branchId !== this.branchId()),
  );
  protected readonly stateCode = computed(() => {
    const day = this.latest();
    return !day
      ? 'NOT_OPEN'
      : day.status === 'OPEN'
        ? 'OPEN'
        : day.status === 'EOD_IN_PROGRESS'
          ? 'EOD_IN_PROGRESS'
          : 'CLOSED';
  });
  protected readonly proposed = computed(() => nextWorkingDay(this.latest(), todayIso(), this.holidays()));
  protected readonly skipped = computed(() => skippedDays(this.latest(), this.proposed(), this.holidays()));
  protected readonly refusal = computed(() => {
    const value = this.openValue();
    return value ? whyNotOpen(value, this.latest(), this.holidays()) : 'Enter the date to open.';
  });
  protected readonly canOpen = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CALENDAR', action: 'edit' }),
  );
  protected readonly canClose = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CALENDAR', action: 'supervise' }),
  );

  constructor() {
    this.openOn.valueChanges.subscribe((value) => this.openValue.set(value));
    effect(() => {
      const branchId = this.branchId();
      untracked(() => (branchId === null ? undefined : void this.load(branchId)));
    });
    effect(() => {
      const proposed = this.proposed();
      untracked(() => this.openOn.setValue(proposed));
    });
  }

  private async load(branchId: number): Promise<void> {
    this.failure.set(null);
    try {
      const year = Number(todayIso().slice(0, 4));
      const [branches, recent, thisYear, nextYear] = await Promise.all([
        this.client.branches(false),
        this.client.businessDays(branchId, 1, 10),
        this.client.holidays(year),
        this.client.holidays(year + 1),
      ]);
      this.recent.set(recent.items);
      this.holidays.set([...thisYear, ...nextYear]);
      const latest = await Promise.all(
        branches.map(async (branch) => ({
          branch,
          latest:
            branch.branchId === branchId
              ? (recent.items[0] ?? null)
              : ((await this.client.businessDays(branch.branchId, 1, 1)).items[0] ?? null),
        })),
      );
      this.branches.set(latest);
    } catch (failure) {
      this.failure.set(messageFor(toApiProblem(failure)));
    }
  }

  protected async open(): Promise<void> {
    const branchId = this.branchId();
    const date = this.openValue();
    if (branchId === null || !date || this.refusal()) {
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.openDay(branchId, date);
        this.toast.success(`Business day ${formatDate(date)} is open.`);
        void this.workingDate.refresh();
        await this.load(branchId);
      } catch (failure) {
        this.failure.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected async close(): Promise<void> {
    const branchId = this.branchId();
    const day = this.latest();
    if (branchId === null || !day) {
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: `Close the day of ${formatDate(day.workingDate)}?`,
      message:
        'End-of-day processing is not part of this phase: closing only marks the day closed. Work that needs an open day, such as opening accounts, waits until the next day is opened.',
      confirmLabel: 'Close day',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.closeDay(branchId, day.workingDate);
        this.toast.success(`Business day ${formatDate(day.workingDate)} is closed.`);
        void this.workingDate.refresh();
        await this.load(branchId);
      } catch (failure) {
        this.failure.set(messageFor(toApiProblem(failure)));
      }
    });
  }

  protected date(value: string | null): string {
    return value ? formatDate(value) : '—';
  }

  protected time(value: string | null): string {
    return value ? formatTimestamp(value) : '—';
  }
}
