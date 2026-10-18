import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  CurrencyView,
  LedgerAccountView,
  LookupRow,
  ProductRequest,
  ProductView,
} from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { LookupsService } from '../../core/lookups/lookups.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
} from '../../shared/ui';
import { LedgerClient } from '../ledger-accounts';
import { controlAccountType } from './product-labels';
import { ProductsClient } from './products.client';

const FIELDS = [
  'productCode',
  'productName',
  'productTypeId',
  'accountPrefix',
  'currencyId',
  'ledgerControlAccountId',
  'minimumBalance',
  'accountsPerCustomer',
  'creditInterestRate',
  'debitInterestRate',
];

const MESSAGES = {
  productCode: {
    required: 'Enter the product code.',
    pattern: 'Use 1 to 10 capital letters, digits or dashes.',
  },
  productName: { required: 'Enter the product name.' },
  productTypeId: { required: 'Choose the product type.' },
  accountPrefix: { required: 'Enter the account prefix.', pattern: 'Use 1 to 6 digits.' },
  currencyId: { required: 'Choose the currency.' },
  ledgerControlAccountId: { required: 'Choose the control account.' },
  minimumBalance: { pattern: 'Enter an amount, for example 50.00.' },
  accountsPerCustomer: { pattern: 'Enter a whole number. 0 means no limit.' },
  creditInterestRate: { pattern: 'Enter a rate from 0 to 100.' },
  debitInterestRate: { pattern: 'Enter a rate from 0 to 100.' },
};

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const RATE = /^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/;

/** What saving did: the new product's id, or for an edit whether it waits for approval. */
export interface ProductSaved {
  productId: number;
  waitsForApproval: boolean;
}

/**
 * The product form (UX 6.9 step 1): code, name, type, account prefix, currency, control ledger account, minimum
 * balance, accounts per customer, cheque book. After approval the code, type, prefix and currency are locked
 * (API A5-a); other changes wait for a second person, except freezing or deactivating, which apply at once.
 */
@Component({
  selector: 'ib-product-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--ib-space-4);
    }
    @media (max-width: 767.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .wide {
      grid-column: 1 / -1;
    }
    label.check {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
    }
    .none {
      margin: 0 0 var(--ib-space-4);
      color: var(--ib-warning-text);
    }
    .none a {
      text-decoration: underline;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <ib-error-summary [problems]="problems()" />
      @if (message(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (locked()) {
        <ib-banner
          tone="info"
          message="The code, type, account prefix and currency cannot change now that the product is approved."
          description="Other changes wait for a second person to approve them. Freezing or deactivating applies at once."
        />
      }
      <div class="grid">
        <ib-form-field
          label="Product code"
          [required]="true"
          [error]="error('productCode')"
          hint="Up to 10 capital letters or digits"
        >
          <input ibInput ibControl formControlName="productCode" autocomplete="off" maxlength="10" />
        </ib-form-field>
        <ib-form-field label="Product name" [required]="true" [error]="error('productName')">
          <input ibInput ibControl formControlName="productName" autocomplete="off" maxlength="100" />
        </ib-form-field>
        <ib-form-field label="Product type" [required]="true" [error]="error('productTypeId')">
          <ib-lookup-select formControlName="productTypeId" [options]="types()" placeholder="Choose a type" />
        </ib-form-field>
        <ib-form-field
          label="Account prefix"
          [required]="true"
          [error]="error('accountPrefix')"
          hint="Digits that start every account number"
        >
          <input
            ibInput
            ibControl
            formControlName="accountPrefix"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
          />
        </ib-form-field>
        <ib-form-field label="Currency" [required]="true" [error]="error('currencyId')">
          <ib-lookup-select
            formControlName="currencyId"
            [options]="currencyOptions()"
            placeholder="Choose a currency"
          />
        </ib-form-field>
        <ib-form-field
          label="Control ledger account"
          [required]="true"
          [error]="error('ledgerControlAccountId')"
          [hint]="'An approved ' + controlType().toLowerCase() + ' account in the product currency'"
        >
          <ib-lookup-select
            formControlName="ledgerControlAccountId"
            [options]="ledgerOptions()"
            placeholder="Choose an account"
          />
        </ib-form-field>
        @if (ledgerLoaded() && ledgerOptions().length === 0) {
          <p class="none wide">
            There is no approved {{ controlType().toLowerCase() }} ledger account in this currency yet.
            Deposit products need a liability account and loans an asset account.
            <a routerLink="/ledger-accounts">Open the chart of accounts</a>
          </p>
        }
        <ib-form-field label="Minimum balance" [error]="error('minimumBalance')" hint="Leave empty for none">
          <input ibInput ibControl formControlName="minimumBalance" inputmode="decimal" autocomplete="off" />
        </ib-form-field>
        <ib-form-field
          label="Accounts per customer"
          [error]="error('accountsPerCustomer')"
          hint="0 or empty means no limit"
        >
          <input
            ibInput
            ibControl
            formControlName="accountsPerCustomer"
            inputmode="numeric"
            autocomplete="off"
          />
        </ib-form-field>
        <ib-form-field
          label="Credit interest rate (%)"
          [error]="error('creditInterestRate')"
          hint="Default when no rate is set on the Rates tab"
        >
          <input
            ibInput
            ibControl
            formControlName="creditInterestRate"
            inputmode="decimal"
            autocomplete="off"
          />
        </ib-form-field>
        <ib-form-field label="Debit interest rate (%)" [error]="error('debitInterestRate')">
          <input
            ibInput
            ibControl
            formControlName="debitInterestRate"
            inputmode="decimal"
            autocomplete="off"
          />
        </ib-form-field>
        <label class="check"
          ><input type="checkbox" formControlName="isChequeBookAllowed" /> Cheque book allowed</label
        >
        @if (product()) {
          <label class="check"><input type="checkbox" formControlName="isActive" /> Active</label>
          <label class="check"
            ><input type="checkbox" formControlName="isFreezed" /> Frozen (no new accounts can be
            opened)</label
          >
        }
      </div>
      @if (canSave()) {
        <div class="actions">
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
            product() ? 'Save changes' : 'Create product'
          }}</ib-button>
        </div>
      }
    </form>
  `,
})
export class ProductFormComponent {
  /** The product being edited, or null to create one. */
  readonly product = input<ProductView | null>(null);
  readonly saved = output<ProductSaved>();

  private readonly client = inject(ProductsClient);
  private readonly ledger = inject(LedgerClient);
  private readonly lookups = inject(LookupsService);
  private readonly permissions = inject(PermissionService);

  protected readonly guard = new SubmitGuard();
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly types = signal<LookupRow[]>([]);
  protected readonly currencies = signal<CurrencyView[]>([]);
  protected readonly ledgerAccounts = signal<LedgerAccountView[]>([]);
  protected readonly ledgerLoaded = signal(false);
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    productCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{1,10}$/)],
    }),
    productName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    productTypeId: new FormControl<number | null>(null, Validators.required),
    accountPrefix: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{1,6}$/)],
    }),
    currencyId: new FormControl<number | null>(null, Validators.required),
    ledgerControlAccountId: new FormControl<number | null>(null, Validators.required),
    minimumBalance: new FormControl('', { nonNullable: true, validators: Validators.pattern(AMOUNT) }),
    accountsPerCustomer: new FormControl('', {
      nonNullable: true,
      validators: Validators.pattern(/^\d{1,4}$/),
    }),
    creditInterestRate: new FormControl('', { nonNullable: true, validators: Validators.pattern(RATE) }),
    debitInterestRate: new FormControl('', { nonNullable: true, validators: Validators.pattern(RATE) }),
    isChequeBookAllowed: new FormControl(false, { nonNullable: true }),
    isActive: new FormControl(true, { nonNullable: true }),
    isFreezed: new FormControl(false, { nonNullable: true }),
  });

  private readonly typeId = toSignal(this.form.controls.productTypeId.valueChanges, { initialValue: null });
  private readonly currencyId = toSignal(this.form.controls.currencyId.valueChanges, { initialValue: null });

  protected readonly locked = computed(() => this.product()?.supervisionState === 'APPROVED');
  protected readonly canSave = computed(() =>
    this.permissions.can({ module: 'ACC', subModule: 'PRODUCT', action: this.product() ? 'edit' : 'add' }),
  );
  protected readonly controlType = computed(() =>
    controlAccountType(this.types().find((type) => type.id === this.typeId())?.code),
  );
  protected readonly currencyOptions = computed(() =>
    this.currencies().map((currency) => ({
      id: currency.currencyId,
      name: `${currency.currencyCode} ${currency.currencyName}`,
    })),
  );
  /** UX 6.9 step 2: only approved accounts of the right type, in the product currency. */
  protected readonly ledgerOptions = computed(() =>
    this.ledgerAccounts()
      .filter(
        (row) =>
          row.supervisionState !== 'PENDING' &&
          row.ledgerAccountTypeCode === this.controlType() &&
          (this.currencyId() === null || row.currencyId === this.currencyId()),
      )
      .map((row) => ({ id: row.ledgerAccountId, name: `${row.ledgerAccountCode} ${row.accountName}` })),
  );

  constructor() {
    this.lookups.list('product-types').then(
      (rows) => this.types.set(rows),
      () => this.types.set([]),
    );
    this.client.currencies().then(
      (rows) => this.currencies.set(rows),
      () => this.currencies.set([]),
    );
    this.ledger.ledgerAccounts({ pageSize: 100 }).then(
      (page) => {
        this.ledgerAccounts.set(page.items);
        this.ledgerLoaded.set(true);
      },
      () => this.ledgerLoaded.set(true),
    );

    effect(() => {
      const product = this.product();
      if (product) {
        this.form.reset({
          productCode: product.productCode,
          productName: product.productName,
          productTypeId: product.productTypeId,
          accountPrefix: product.accountPrefix,
          currencyId: product.currencyId,
          ledgerControlAccountId: product.ledgerControlAccountId,
          minimumBalance: text(product.minimumBalance),
          accountsPerCustomer: text(product.accountsPerCustomer),
          creditInterestRate: text(product.creditInterestRate),
          debitInterestRate: text(product.debitInterestRate),
          isChequeBookAllowed: product.isChequeBookAllowed,
          isActive: product.isActive,
          isFreezed: product.isFreezed,
        });
        this.form.controls.productCode.disable();
        const fixed = [
          this.form.controls.productTypeId,
          this.form.controls.accountPrefix,
          this.form.controls.currencyId,
        ];
        fixed.forEach((control) => (this.locked() ? control.disable() : control.enable()));
      }
      if (!this.canSave()) {
        this.form.disable();
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name as keyof typeof MESSAGES]);
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = formProblems(this.form, FIELDS, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const value = this.form.getRawValue();
    const request: ProductRequest = {
      productCode: value.productCode.trim().toUpperCase(),
      productName: value.productName.trim(),
      productTypeId: value.productTypeId,
      accountPrefix: value.accountPrefix.trim(),
      currencyId: value.currencyId,
      ledgerControlAccountId: value.ledgerControlAccountId,
      minimumBalance: number(value.minimumBalance),
      accountsPerCustomer: number(value.accountsPerCustomer),
      creditInterestRate: number(value.creditInterestRate),
      debitInterestRate: number(value.debitInterestRate),
      isChequeBookAllowed: value.isChequeBookAllowed,
      isActive: this.product() ? value.isActive : null,
      isFreezed: this.product() ? value.isFreezed : null,
    };
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        const current = this.product();
        if (current) {
          const outcome = await this.client.updateProduct(current.productId, request);
          this.form.markAsPristine();
          this.saved.emit({
            productId: current.productId,
            waitsForApproval: outcome.changeRequestId !== null,
          });
        } else {
          const created = await this.client.createProduct(request);
          this.form.markAsPristine();
          this.saved.emit({ productId: created.id, waitsForApproval: true });
        }
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
}

const text = (value: number | null) => (value === null ? '' : String(value));
const number = (value: string) => (value.trim() === '' ? null : Number(value));
