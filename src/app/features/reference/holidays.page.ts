import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { HolidayView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate, todayIso } from '../../core/formats/dates';
import { PermissionService } from '../../core/permissions/permission.service';
import { errorMessage } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DateInputComponent,
  DialogService,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  PageHeaderComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import { ReferenceClient } from './reference.client';

interface MonthCell {
  day: number | null;
  date: string | null;
  weekend: boolean;
  holiday: HolidayView | null;
}

interface Month {
  name: string;
  cells: MonthCell[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Holidays (UX 7.7): the year as a calendar with holidays marked, and the same holidays as a list where they are
 * added and removed. The calendar is a visual overview; the list is what assistive technology reads. A date a branch
 * has already opened cannot be added or removed (API `holiday.business-day-exists`).
 */
@Component({
  selector: 'ib-holidays-page',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    DateInputComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    PageHeaderComponent,
    ReferenceBackComponent,
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
    .year {
      display: flex;
      align-items: center;
      gap: var(--ib-space-3);
      margin-bottom: var(--ib-space-3);
    }
    .year strong {
      font-size: 18px;
      min-width: 4ch;
      text-align: center;
    }
    .add {
      display: grid;
      grid-template-columns: 12rem minmax(0, 1fr) auto;
      gap: 0 var(--ib-space-3);
      align-items: start;
    }
    .add ib-button {
      margin-top: 28px;
    }
    @media (max-width: 767.98px) {
      .add {
        grid-template-columns: 1fr;
      }
      .add ib-button {
        margin-top: 0;
      }
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-4);
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
    }
    .months {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: var(--ib-space-4);
    }
    .month h3 {
      margin: 0 0 var(--ib-space-1);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      font-size: 12px;
      text-align: center;
    }
    .head {
      color: var(--ib-ink-meta);
      font-weight: 600;
    }
    .cell {
      padding: 2px 0;
      border-radius: var(--ib-radius-sm);
    }
    .weekend {
      color: var(--ib-ink-meta);
      background: var(--ib-surface-subtle);
    }
    .holiday {
      font-weight: 700;
      color: var(--ib-ink);
      background: var(--ib-accent-tint);
      box-shadow: inset 0 0 0 1px var(--ib-border-control);
    }
    .holiday::after {
      content: '•';
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
    }
    th {
      background: var(--ib-surface-subtle);
      font-weight: 600;
    }
    td.end {
      text-align: right;
    }
    .none {
      color: var(--ib-ink-muted);
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Holidays" />
    <div class="year">
      <ib-button (click)="year.set(year() - 1)"
        >‹ <span class="ib-visually-hidden">Show</span> {{ year() - 1 }}</ib-button
      >
      <strong aria-live="polite">{{ year() }}</strong>
      <ib-button (click)="year.set(year() + 1)"
        ><span class="ib-visually-hidden">Show</span> {{ year() + 1 }} ›</ib-button
      >
    </div>
    @if (failure(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }

    @if (canAdd()) {
      <section aria-labelledby="add-title">
        <h2 id="add-title">Add a holiday</h2>
        <form class="add" [formGroup]="form" (ngSubmit)="add()" novalidate>
          <ib-form-field label="Date" [required]="true" [error]="dateError()">
            <ib-date-input formControlName="holidayDate" />
          </ib-form-field>
          <ib-form-field label="Name or remarks" [error]="remarksError()">
            <input ibInput ibControl formControlName="remarks" autocomplete="off" maxlength="100" />
          </ib-form-field>
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">Add holiday</ib-button>
        </form>
      </section>
    }

    <section aria-labelledby="list-title">
      <h2 id="list-title">Holidays in {{ year() }}</h2>
      @if (holidays().length === 0) {
        <p class="none">No holidays in {{ year() }} yet.</p>
      } @else {
        <table aria-labelledby="list-title">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Day</th>
              <th scope="col">Name or remarks</th>
              @if (canDelete()) {
                <th scope="col" class="end">Action</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (holiday of holidays(); track holiday.holidayId) {
              <tr>
                <td class="ib-num">{{ date(holiday.holidayDate) }}</td>
                <td>{{ weekday(holiday.holidayDate) }}</td>
                <td>{{ holiday.remarks ?? '—' }}</td>
                @if (canDelete()) {
                  <td class="end">
                    <ib-button variant="quiet" icon="close" (click)="remove(holiday)"
                      >Remove<span class="ib-visually-hidden">
                        {{ date(holiday.holidayDate) }}</span
                      ></ib-button
                    >
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <section aria-labelledby="calendar-title">
      <h2 id="calendar-title">Calendar</h2>
      <p class="legend">
        <span>Holidays are bold and marked •</span>
        <span>Saturdays and Sundays are shaded</span>
      </p>
      <div class="months" aria-hidden="true">
        @for (month of months(); track month.name) {
          <div class="month">
            <h3>{{ month.name }}</h3>
            <div class="grid">
              @for (label of heads; track $index) {
                <span class="head">{{ label }}</span>
              }
              @for (cell of month.cells; track $index) {
                <span
                  class="cell"
                  [class.weekend]="cell.weekend && !cell.holiday"
                  [class.holiday]="!!cell.holiday"
                  [attr.title]="cell.holiday?.remarks ?? null"
                  >{{ cell.day ?? '' }}</span
                >
              }
            </div>
          </div>
        }
      </div>
    </section>
  `,
})
export class HolidaysPage {
  private readonly client = inject(ReferenceClient);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly heads = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  protected readonly guard = new SubmitGuard();
  protected readonly year = signal(Number(todayIso().slice(0, 4)));
  protected readonly holidays = signal<HolidayView[]>([]);
  protected readonly failure = signal<string | null>(null);
  private readonly submitted = signal(false);
  protected readonly canAdd = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CALENDAR', action: 'add' }),
  );
  protected readonly canDelete = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'CALENDAR', action: 'delete' }),
  );

  protected readonly form = new FormGroup({
    holidayDate: new FormControl<string | null>(null, Validators.required),
    remarks: new FormControl('', { nonNullable: true, validators: Validators.maxLength(100) }),
  });

  protected readonly months = computed((): Month[] =>
    MONTHS.map((name, index) => {
      const first = new Date(Date.UTC(this.year(), index, 1));
      const days = new Date(Date.UTC(this.year(), index + 1, 0)).getUTCDate();
      const cells: MonthCell[] = Array.from({ length: first.getUTCDay() }, () => ({
        day: null,
        date: null,
        weekend: false,
        holiday: null,
      }));
      for (let day = 1; day <= days; day++) {
        const date = `${this.year()}-${String(index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const weekday = new Date(Date.UTC(this.year(), index, day)).getUTCDay();
        cells.push({
          day,
          date,
          weekend: weekday === 0 || weekday === 6,
          holiday: this.holidays().find((holiday) => holiday.holidayDate === date) ?? null,
        });
      }
      return { name, cells };
    }),
  );

  constructor() {
    effect(() => {
      const year = this.year();
      untracked(() => void this.load(year));
    });
  }

  private async load(year: number): Promise<void> {
    this.failure.set(null);
    try {
      const rows = await this.client.holidays(year);
      if (year === this.year()) {
        this.holidays.set(rows);
      }
    } catch (failure) {
      this.failure.set(messageFor(toApiProblem(failure)));
    }
  }

  protected dateError(): string | null {
    const control = this.form.controls.holidayDate;
    return control.invalid && (control.touched || this.submitted())
      ? errorMessage(control, { required: 'Enter the date of the holiday.' })
      : null;
  }

  protected remarksError(): string | null {
    const control = this.form.controls.remarks;
    return control.invalid && (control.touched || this.submitted()) ? errorMessage(control) : null;
  }

  protected async add(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        await this.client.addHoliday(value.holidayDate!, value.remarks.trim() || null);
        this.toast.success(`Holiday added for ${formatDate(value.holidayDate)}.`);
        this.form.reset({ holidayDate: null, remarks: '' });
        this.submitted.set(false);
        const added = Number(value.holidayDate!.slice(0, 4));
        if (added !== this.year()) {
          this.year.set(added);
        } else {
          await this.load(added);
        }
      } catch (failure) {
        const problem = toApiProblem(failure);
        const field = problem.errors?.['holidayDate']?.[0];
        if (field) {
          this.form.controls.holidayDate.setErrors({ server: field });
        } else {
          this.failure.set(messageFor(problem));
        }
      }
    });
  }

  protected async remove(holiday: HolidayView): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: `Remove the holiday on ${formatDate(holiday.holidayDate)}?`,
      message: 'Branches can then open a business day on that date.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.client.removeHoliday(holiday.holidayId);
      this.toast.success('Holiday removed.');
    } catch (failure) {
      this.failure.set(messageFor(toApiProblem(failure)));
    }
    await this.load(this.year());
  }

  protected date(value: string): string {
    return formatDate(value);
  }

  protected weekday(value: string): string {
    return WEEKDAYS[new Date(`${value}T00:00:00Z`).getUTCDay()];
  }
}
