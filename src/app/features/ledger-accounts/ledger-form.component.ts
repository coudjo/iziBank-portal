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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  CurrencyView,
  LedgerAccountRequest,
  LedgerAccountView,
  LookupRow,
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
import { ProductsClient } from '../products';
import { LedgerClient } from './ledger.client';

const FIELDS = ['ledgerAccountCode', 'accountName', 'ledgerAccountTypeId', 'currencyId'];
const MESSAGES = {
  ledgerAccountCode: {
    required: 'Enter the account code.',
    pattern: 'Use 1 to 20 capital letters, digits, dots or dashes.',
  },
  accountName: { required: 'Enter the account name.' },
  ledgerAccountTypeId: { required: 'Choose the account type.' },
  currencyId: { required: 'Choose the currency.' },
};

export interface LedgerSaved {
  ledgerAccountId: number;
  waitsForApproval: boolean;
}

/**
 * Ledger account form (UX 7.6): code, name, type and currency; the branch is the working branch. After approval
 * only the name can change, and a new name waits for a second person (API ADR A3-a).
 */
@Component({
  selector: 'ib-ledger-form',
  imports: [
    ReactiveFormsModule,
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
    .actions {
      display: flex;
      justify-content: flex-end;
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
          message="The code, type and currency cannot change now that the account is approved."
          description="A new name waits for a second person to approve it."
        />
      }
      <div class="grid">
        <ib-form-field label="Account code" [required]="true" [error]="error('ledgerAccountCode')">
          <input ibInput ibControl formControlName="ledgerAccountCode" autocomplete="off" maxlength="20" />
        </ib-form-field>
        <ib-form-field label="Account name" [required]="true" [error]="error('accountName')">
          <input ibInput ibControl formControlName="accountName" autocomplete="off" maxlength="100" />
        </ib-form-field>
        <ib-form-field label="Account type" [required]="true" [error]="error('ledgerAccountTypeId')">
          <ib-lookup-select
            formControlName="ledgerAccountTypeId"
            [options]="types()"
            placeholder="Choose a type"
          />
        </ib-form-field>
        <ib-form-field label="Currency" [required]="true" [error]="error('currencyId')">
          <ib-lookup-select
            formControlName="currencyId"
            [options]="currencyOptions()"
            placeholder="Choose a currency"
          />
        </ib-form-field>
      </div>
      @if (canSave()) {
        <div class="actions">
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
            account() ? 'Save changes' : 'Create account'
          }}</ib-button>
        </div>
      }
    </form>
  `,
})
export class LedgerFormComponent {
  readonly account = input<LedgerAccountView | null>(null);
  readonly saved = output<LedgerSaved>();

  private readonly client = inject(LedgerClient);
  private readonly products = inject(ProductsClient);
  private readonly lookups = inject(LookupsService);
  private readonly permissions = inject(PermissionService);

  protected readonly guard = new SubmitGuard();
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly types = signal<LookupRow[]>([]);
  protected readonly currencies = signal<CurrencyView[]>([]);
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    ledgerAccountCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9.-]{1,20}$/)],
    }),
    accountName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    ledgerAccountTypeId: new FormControl<number | null>(null, Validators.required),
    currencyId: new FormControl<number | null>(null, Validators.required),
  });

  protected readonly locked = computed(() => this.account()?.supervisionState === 'APPROVED');
  protected readonly canSave = computed(() =>
    this.permissions.can({ module: 'LED', subModule: 'CHART', action: this.account() ? 'edit' : 'add' }),
  );
  protected readonly currencyOptions = computed(() =>
    this.currencies().map((row) => ({ id: row.currencyId, name: `${row.currencyCode} ${row.currencyName}` })),
  );

  constructor() {
    this.lookups.list('ledger-account-types').then(
      (rows) => this.types.set(rows),
      () => this.types.set([]),
    );
    this.products.currencies().then(
      (rows) => this.currencies.set(rows),
      () => this.currencies.set([]),
    );
    effect(() => {
      const account = this.account();
      if (account) {
        this.form.reset({
          ledgerAccountCode: account.ledgerAccountCode,
          accountName: account.pendingChange?.proposedName ?? account.accountName,
          ledgerAccountTypeId: account.ledgerAccountTypeId,
          currencyId: account.currencyId,
        });
        this.form.controls.ledgerAccountCode.disable();
        for (const control of [this.form.controls.ledgerAccountTypeId, this.form.controls.currencyId]) {
          if (this.locked()) {
            control.disable();
          } else {
            control.enable();
          }
        }
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
    const current = this.account();
    const request: LedgerAccountRequest = {
      ledgerAccountCode: current ? null : value.ledgerAccountCode.trim().toUpperCase(),
      accountName: value.accountName.trim(),
      ledgerAccountTypeId: value.ledgerAccountTypeId,
      currencyId: value.currencyId,
    };
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        if (current) {
          const outcome = await this.client.updateLedgerAccount(current.ledgerAccountId, request);
          this.form.markAsPristine();
          this.saved.emit({
            ledgerAccountId: current.ledgerAccountId,
            waitsForApproval: outcome.changeRequestId !== null,
          });
        } else {
          const created = await this.client.createLedgerAccount(request);
          this.form.markAsPristine();
          this.saved.emit({ ledgerAccountId: created.id, waitsForApproval: true });
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
