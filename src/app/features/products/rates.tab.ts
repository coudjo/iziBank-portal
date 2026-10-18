import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { LookupRow, ProductRateView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate, todayIso } from '../../core/formats/dates';
import { formatMoney } from '../../core/formats/money';
import { LookupsService } from '../../core/lookups/lookups.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  DateInputComponent,
  DialogService,
  EmptyStateComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
  ToastService,
} from '../../shared/ui';
import { RATE_STATUS_LABELS, RATE_TYPE_LABELS, labelOf } from './product-labels';
import { ProductRecordStore } from './product-record.store';
import { ProductsClient } from './products.client';
import { RateDraft, earliestClose, overlappingRate, rateClosedBy, timeline } from './rate-rules';

const FIELDS = [
  'rateTypeId',
  'interestRate',
  'minimumAmount',
  'maximumAmount',
  'effectiveFrom',
  'effectiveTo',
];
const MESSAGES = {
  rateTypeId: { required: 'Choose credit or debit.' },
  interestRate: { required: 'Enter the rate.', pattern: 'Enter a rate from 0 to 100.' },
  minimumAmount: { pattern: 'Enter an amount, for example 1000.00.' },
  maximumAmount: { pattern: 'Enter an amount, for example 5000.00.' },
  effectiveFrom: { required: 'Enter the date the rate starts.' },
};
const AMOUNT = /^\d+(\.\d{1,2})?$/;
const RATE = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;

/**
 * Rates tab (UX 6.9 step 3): a timeline of rates by type. Adding a rate shows the date it closes the current one;
 * overlaps are explained and prevented in the form. Started rates are not editable, only closable; a rate that has
 * not started can be removed (API A5-02).
 */
@Component({
  selector: 'ib-product-rates-tab',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
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
    h2,
    h3 {
      margin-bottom: var(--ib-space-3);
    }
    ol {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: 0 0 0 var(--ib-space-4);
      border-left: 2px solid var(--ib-line);
    }
    li {
      position: relative;
      padding: var(--ib-space-2) 0 var(--ib-space-3);
    }
    li::before {
      content: '';
      position: absolute;
      left: calc(-1 * var(--ib-space-4) - 6px);
      top: 14px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ib-surface);
      border: 2px solid var(--ib-ink-muted);
    }
    li.current::before {
      background: var(--ib-primary);
      border-color: var(--ib-primary);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
    }
    .rate {
      font-weight: 650;
    }
    .meta {
      color: var(--ib-ink-muted);
    }
    .status {
      display: inline-block;
      padding: 0 8px;
      border: 1px solid var(--ib-border-control);
      border-radius: 999px;
      font-size: 13px;
      font-weight: 550;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0 var(--ib-space-4);
    }
    @media (max-width: 1279.98px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 767.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .preview {
      margin: 0 0 var(--ib-space-3);
    }
    .clash {
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-danger-text);
      font-weight: 550;
    }
    .closing {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0 var(--ib-space-3);
      margin-top: var(--ib-space-2);
    }
    .closing ib-button,
    .actions {
      margin-bottom: var(--ib-space-4);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }
    <section aria-labelledby="rates-title">
      <h2 id="rates-title">Rates</h2>
      @for (group of groups(); track group.rateTypeCode) {
        <h3>{{ rateType(group.rateTypeCode) }}</h3>
        <ol [attr.aria-label]="rateType(group.rateTypeCode)">
          @for (row of group.rows; track row.productInterestRateId) {
            <li [class.current]="row.status === 'CURRENT'">
              <div class="row">
                <span>
                  <span class="rate ib-num">{{ percent(row.interestRate) }}</span>
                  <span class="meta">
                    · {{ band(row) }} · <span class="ib-num">{{ period(row) }}</span></span
                  >
                </span>
                <span class="row">
                  <span class="status">{{ status(row.status) }}</span>
                  @if (canEdit() && closable(row)) {
                    <ib-button (click)="startClose(row)"
                      >Close<span class="ib-visually-hidden">
                        rate {{ percent(row.interestRate) }}</span
                      ></ib-button
                    >
                  }
                  @if (canEdit() && !row.isStarted) {
                    <ib-button variant="quiet" icon="close" (click)="remove(row)"
                      >Remove<span class="ib-visually-hidden">
                        rate {{ percent(row.interestRate) }}</span
                      ></ib-button
                    >
                  }
                </span>
              </div>
              @if (closingId() === row.productInterestRateId) {
                <form class="closing" (submit)="$event.preventDefault(); close(row)" novalidate>
                  <ib-form-field
                    label="Last day of this rate"
                    [required]="true"
                    [hint]="
                      'From ' + date(earliest(row)) + (row.effectiveTo ? ' to ' + date(row.effectiveTo) : '')
                    "
                    [error]="closeError()"
                  >
                    <ib-date-input [formControl]="closeOn" />
                  </ib-form-field>
                  <ib-button variant="primary" type="submit" [loading]="guard.busy()">Close rate</ib-button>
                  <ib-button (click)="closingId.set(null)">Cancel</ib-button>
                </form>
              }
            </li>
          }
        </ol>
      } @empty {
        @if (!loaded()) {
          <p aria-live="polite">Loading the rates…</p>
        } @else {
          <ib-empty-state
            title="No rates yet"
            message="Accounts use the product's default rates until rates are added here."
            icon="clock-circle"
          />
        }
      }
    </section>

    @if (canEdit()) {
      <section aria-labelledby="add-rate-title">
        <h2 id="add-rate-title">Add a rate</h2>
        <form [formGroup]="form" (ngSubmit)="add()" novalidate>
          <ib-error-summary [problems]="problems()" />
          <div class="grid">
            <ib-form-field label="Rate type" [required]="true" [error]="error('rateTypeId')">
              <ib-lookup-select formControlName="rateTypeId" [options]="rateTypes()" placeholder="Choose" />
            </ib-form-field>
            <ib-form-field label="Rate (% a year)" [required]="true" [error]="error('interestRate')">
              <input
                ibInput
                ibControl
                formControlName="interestRate"
                inputmode="decimal"
                autocomplete="off"
              />
            </ib-form-field>
            <ib-form-field
              label="Starts on"
              [required]="true"
              [error]="error('effectiveFrom')"
              hint="Today or later"
            >
              <ib-date-input formControlName="effectiveFrom" />
            </ib-form-field>
            <ib-form-field label="From amount" [error]="error('minimumAmount')" hint="Empty for any amount">
              <input
                ibInput
                ibControl
                formControlName="minimumAmount"
                inputmode="decimal"
                autocomplete="off"
              />
            </ib-form-field>
            <ib-form-field label="To amount" [error]="error('maximumAmount')" hint="Empty for no upper limit">
              <input
                ibInput
                ibControl
                formControlName="maximumAmount"
                inputmode="decimal"
                autocomplete="off"
              />
            </ib-form-field>
            <ib-form-field label="Ends on" [error]="error('effectiveTo')" hint="Empty until replaced">
              <ib-date-input formControlName="effectiveTo" />
            </ib-form-field>
          </div>
          @if (closes(); as closing) {
            <p class="preview" aria-live="polite">
              Adding this rate ends the current rate of {{ percent(closing.rate.interestRate) }} on
              <span class="ib-num">{{ date(closing.closesOn) }}</span
              >.
            </p>
          }
          @if (clash(); as other) {
            <p class="clash" aria-live="polite">
              This overlaps the rate of {{ percent(other.interestRate) }} for {{ band(other) }} ({{
                period(other)
              }}). Change the dates or the amounts.
            </p>
          }
          <div class="actions">
            <ib-button variant="primary" type="submit" [disabled]="!!clash()" [loading]="guard.busy()"
              >Add rate</ib-button
            >
          </div>
        </form>
      </section>
    }
  `,
})
export class ProductRatesTab {
  private readonly store = inject(ProductRecordStore);
  private readonly client = inject(ProductsClient);
  private readonly lookups = inject(LookupsService);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly guard = new SubmitGuard();
  protected readonly today = todayIso();
  protected readonly rows = signal<ProductRateView[]>([]);
  protected readonly loaded = signal(false);
  protected readonly rateTypes = signal<LookupRow[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly closingId = signal<number | null>(null);
  protected readonly closeError = signal<string | null>(null);
  protected readonly closeOn = new FormControl<string | null>(null);
  private readonly submitted = signal(false);
  protected readonly canEdit = signal(
    inject(PermissionService).can({ module: 'ACC', subModule: 'PRODUCT', action: 'edit' }),
  );

  protected readonly form = new FormGroup({
    rateTypeId: new FormControl<number | null>(null, Validators.required),
    interestRate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(RATE)],
    }),
    minimumAmount: new FormControl('', { nonNullable: true, validators: Validators.pattern(AMOUNT) }),
    maximumAmount: new FormControl('', { nonNullable: true, validators: Validators.pattern(AMOUNT) }),
    effectiveFrom: new FormControl<string | null>(todayIso(), Validators.required),
    effectiveTo: new FormControl<string | null>(null),
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly groups = computed(() => timeline(this.rows()));
  /** The rate being typed, once it has a type and a start date. */
  private readonly draft = computed((): RateDraft | null => {
    const value = this.value();
    const type = this.rateTypes().find((row) => row.id === value.rateTypeId)?.code;
    if (!type || !value.effectiveFrom) {
      return null;
    }
    return {
      rateTypeCode: type,
      minimumAmount: amount(value.minimumAmount ?? ''),
      maximumAmount: amount(value.maximumAmount ?? ''),
      from: value.effectiveFrom,
      to: value.effectiveTo ?? null,
    };
  });
  protected readonly closes = computed(() => {
    const draft = this.draft();
    return draft ? rateClosedBy(this.rows(), draft) : null;
  });
  protected readonly clash = computed(() => {
    const draft = this.draft();
    return draft ? overlappingRate(this.rows(), draft) : null;
  });

  constructor() {
    this.lookups.list('rate-types').then(
      (rows) => this.rateTypes.set(rows),
      () => this.rateTypes.set([]),
    );
    effect(() => {
      const product = this.store.product();
      if (product) {
        untracked(() => void this.load(product.productId));
      }
    });
  }

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name as keyof typeof MESSAGES]);
  }

  protected closable(row: ProductRateView): boolean {
    return row.status !== 'ENDED' && (row.effectiveTo === null || row.effectiveTo >= this.today);
  }

  protected earliest(row: ProductRateView): string {
    return earliestClose(row, this.today);
  }

  protected startClose(row: ProductRateView): void {
    this.closeError.set(null);
    this.closeOn.setValue(this.earliest(row) > this.today ? this.earliest(row) : this.today);
    this.closingId.set(row.productInterestRateId);
  }

  protected async close(row: ProductRateView): Promise<void> {
    const productId = this.store.id;
    const end = this.closeOn.value;
    if (!end || end < this.earliest(row) || (row.effectiveTo !== null && end > row.effectiveTo)) {
      this.closeError.set('Choose a date in the range shown.');
      return;
    }
    if (productId === null) {
      return;
    }
    await this.guard.run(async () => {
      try {
        await this.client.closeRate(productId, row.productInterestRateId, end);
        this.closingId.set(null);
        this.toast.success('Rate closed.');
        await this.load(productId);
      } catch (failure) {
        const problem = toApiProblem(failure);
        this.closeError.set(problem.errors?.['effectiveTo']?.[0] ?? messageFor(problem));
      }
    });
  }

  protected async remove(row: ProductRateView): Promise<void> {
    const productId = this.store.id;
    if (productId === null) {
      return;
    }
    const confirmed = await this.dialogs.confirm({
      title: 'Remove rate?',
      message: `The rate of ${this.percent(row.interestRate)} from ${formatDate(row.effectiveFrom)} has not started. It will be removed.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.client.removeRate(productId, row.productInterestRateId);
      this.toast.success('Rate removed.');
      await this.load(productId);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }

  protected async add(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = formProblems(this.form, FIELDS, MESSAGES);
    this.problems.set(problems);
    const productId = this.store.id;
    if (problems.length > 0 || this.clash() || productId === null) {
      return;
    }
    const value = this.form.getRawValue();
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        const added = await this.client.addRate(productId, {
          rateTypeId: value.rateTypeId,
          interestRate: Number(value.interestRate),
          minimumAmount: amount(value.minimumAmount),
          maximumAmount: amount(value.maximumAmount),
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo,
        });
        this.toast.success(
          added.closedOn
            ? `Rate added. The previous rate ends on ${formatDate(added.closedOn)}.`
            : 'Rate added.',
        );
        this.form.reset({
          rateTypeId: null,
          interestRate: '',
          minimumAmount: '',
          maximumAmount: '',
          effectiveFrom: todayIso(),
          effectiveTo: null,
        });
        this.submitted.set(false);
        this.problems.set([]);
        await this.load(productId);
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const rest = applyServerErrors(this.form, problem.errors);
          this.problems.set([...formProblems(this.form, FIELDS, MESSAGES), ...rest]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }

  private async load(productId: number): Promise<void> {
    try {
      this.rows.set(await this.client.rates(productId));
      this.loaded.set(true);
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }

  protected percent(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  protected band(row: { minimumAmount: number | null; maximumAmount: number | null }): string {
    const currency = this.store.product()?.currencyCode ?? 'GHS';
    if (row.minimumAmount === null && row.maximumAmount === null) {
      return 'any amount';
    }
    if (row.maximumAmount === null) {
      return `${formatMoney(row.minimumAmount ?? 0, currency)} and above`;
    }
    return `${formatMoney(row.minimumAmount ?? 0, currency)} to ${formatMoney(row.maximumAmount, currency)}`;
  }

  protected period(row: ProductRateView): string {
    return `${formatDate(row.effectiveFrom)} to ${row.effectiveTo ? formatDate(row.effectiveTo) : 'open'}`;
  }

  protected status(code: string): string {
    return labelOf(RATE_STATUS_LABELS, code);
  }

  protected rateType(code: string): string {
    return labelOf(RATE_TYPE_LABELS, code);
  }

  protected readonly date = formatDate;
}

const amount = (value: string) => (value.trim() === '' ? null : Number(value));
