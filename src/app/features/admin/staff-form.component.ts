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
import type { BranchView, LedgerAccountView, StaffDetail } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  IconComponent,
  InputDirective,
  LookupSelectComponent,
  SwitchComponent,
} from '../../shared/ui';
import { LedgerClient } from '../ledger-accounts';
import { initialPasswordRules, passwordMessages } from './admin-labels';
import { SecurityClient } from './security.client';

const FIELDS = [
  'staffCode',
  'fullName',
  'branchId',
  'initialSecretKey',
  'secretKeyExpiryDays',
  'tellerGLAccountId',
];
const MESSAGES = {
  staffCode: {
    required: 'Enter the staff code.',
    pattern: 'Use 1 to 20 capital letters, digits, dashes or underscores.',
  },
  fullName: { required: 'Enter the full name.' },
  branchId: { required: 'Choose the home branch.' },
  initialSecretKey: {
    required: 'Enter a first password.',
    rules: 'The password does not meet the rules below.',
  },
  secretKeyExpiryDays: { pattern: 'Enter a whole number of days from 1 to 365, or leave it empty.' },
  tellerGLAccountId: { required: "Choose the teller's till account." },
};

export interface StaffSaved {
  staffUserId: number;
}

/**
 * New staff member and the Details tab (UX 6.10 steps 1 and 5). A new person has no role groups yet and must change
 * the first password at first sign-in. A teller needs a till account: an approved asset account in their branch.
 */
@Component({
  selector: 'ib-staff-form',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    IconComponent,
    InputDirective,
    LookupSelectComponent,
    SwitchComponent,
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
    .rules {
      list-style: none;
      margin: 0 0 var(--ib-space-4);
      padding: 0;
      display: grid;
      gap: var(--ib-space-1);
      color: var(--ib-ink-muted);
    }
    .rules li {
      display: flex;
      align-items: center;
      gap: var(--ib-space-2);
    }
    .rules li.met {
      color: var(--ib-success-text);
    }
    .none {
      margin: 0 0 var(--ib-space-4);
      color: var(--ib-warning-text);
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
      @if (!staff()) {
        <ib-banner
          tone="info"
          message="They must change this password the first time they sign in."
          description="Give it to them in person. Role groups are added on their record after it is created."
        />
      }
      <div class="grid">
        @if (!staff()) {
          <ib-form-field
            label="Staff code"
            [required]="true"
            hint="Used to sign in, for example TELLER2"
            [error]="error('staffCode')"
          >
            <input ibInput ibControl formControlName="staffCode" autocomplete="off" maxlength="20" />
          </ib-form-field>
        }
        <ib-form-field label="Full name" [required]="true" [error]="error('fullName')">
          <input ibInput ibControl formControlName="fullName" autocomplete="off" maxlength="100" />
        </ib-form-field>
        @if (!staff()) {
          <ib-form-field label="Home branch" [required]="true" [error]="error('branchId')">
            <ib-lookup-select
              formControlName="branchId"
              [options]="branchOptions()"
              placeholder="Choose a branch"
            />
          </ib-form-field>
          <ib-form-field label="First password" [required]="true" [error]="error('initialSecretKey')">
            <input
              ibInput
              ibControl
              type="password"
              formControlName="initialSecretKey"
              autocomplete="new-password"
              aria-describedby="first-password-rules"
            />
          </ib-form-field>
          <ul class="rules" id="first-password-rules" aria-label="Password rules">
            @for (rule of rules(); track rule.id) {
              <li [class.met]="rule.met">
                <ib-icon [name]="rule.met ? 'check-circle' : 'minus-circle'" />
                <span
                  >{{ rule.label
                  }}<span class="ib-visually-hidden">{{ rule.met ? ': done' : ': not yet' }}</span></span
                >
              </li>
            }
          </ul>
        }
        <ib-form-field label="May work in other branches">
          <ib-switch formControlName="canSwitchBranch" />
        </ib-form-field>
        @if (staff()) {
          <ib-form-field
            label="Password expires after (days)"
            hint="Empty for never"
            [error]="error('secretKeyExpiryDays')"
          >
            <input
              ibInput
              ibControl
              formControlName="secretKeyExpiryDays"
              inputmode="numeric"
              autocomplete="off"
            />
          </ib-form-field>
        }
        <ib-form-field label="Teller">
          <ib-switch formControlName="isTeller" />
        </ib-form-field>
        @if (value().isTeller) {
          <ib-form-field
            label="Till account"
            [required]="true"
            hint="An approved asset account in the home branch"
            [error]="error('tellerGLAccountId')"
          >
            <ib-lookup-select
              formControlName="tellerGLAccountId"
              [options]="tillOptions()"
              placeholder="Choose an account"
            />
          </ib-form-field>
        }
      </div>
      @if (value().isTeller && tillLoaded() && tillOptions().length === 0) {
        <p class="none">There is no approved asset ledger account in this branch for a till yet.</p>
      }
      @if (canSave()) {
        <div class="actions">
          <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
            staff() ? 'Save changes' : 'Create staff member'
          }}</ib-button>
        </div>
      }
    </form>
  `,
})
export class StaffFormComponent {
  readonly staff = input<StaffDetail | null>(null);
  /** Your own record cannot be changed here (API `staff.self-change`). */
  readonly readOnly = input(false);
  readonly saved = output<StaffSaved>();

  private readonly client = inject(SecurityClient);
  private readonly ledger = inject(LedgerClient);
  private readonly permissions = inject(PermissionService);

  protected readonly guard = new SubmitGuard();
  protected readonly problems = signal<FormProblem[]>([]);
  protected readonly message = signal<string | null>(null);
  protected readonly branches = signal<BranchView[]>([]);
  private readonly tills = signal<LedgerAccountView[]>([]);
  protected readonly tillLoaded = signal(false);
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    staffCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{1,20}$/)],
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    branchId: new FormControl<number | null>(null, Validators.required),
    initialSecretKey: new FormControl('', { nonNullable: true, validators: Validators.required }),
    canSwitchBranch: new FormControl(false, { nonNullable: true }),
    secretKeyExpiryDays: new FormControl('', {
      nonNullable: true,
      validators: Validators.pattern(/^(36[0-5]|3[0-5]\d|[12]\d{2}|[1-9]\d?)$/),
    }),
    isTeller: new FormControl(false, { nonNullable: true }),
    tellerGLAccountId: new FormControl<number | null>(null),
  });

  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly rules = computed(() =>
    initialPasswordRules(this.value().initialSecretKey ?? '', this.value().staffCode ?? ''),
  );
  protected readonly canSave = computed(
    () =>
      !this.readOnly() &&
      this.permissions.can({ module: 'SEC', subModule: 'USERS', action: this.staff() ? 'edit' : 'add' }),
  );
  protected readonly branchOptions = computed(() =>
    this.branches().map((branch) => ({
      id: branch.branchId,
      name: `${branch.branchCode} ${branch.branchName}`,
    })),
  );
  private readonly homeBranch = computed(() => this.staff()?.staff.branchId ?? this.value().branchId ?? null);
  protected readonly tillOptions = computed(() =>
    this.tills()
      .filter((row) => row.branchId === this.homeBranch() && row.ledgerAccountTypeCode === 'ASSET')
      .map((row) => ({ id: row.ledgerAccountId, name: `${row.ledgerAccountCode} ${row.accountName}` })),
  );

  constructor() {
    this.client.branches().then(
      (rows) => this.branches.set(rows.filter((row) => row.isActive)),
      () => this.branches.set([]),
    );
    this.ledger.ledgerAccounts({ supervisionState: 'APPROVED', pageSize: 100 }).then(
      (page) => {
        this.tills.set(page.items);
        this.tillLoaded.set(true);
      },
      () => this.tillLoaded.set(true),
    );
    this.form.controls.isTeller.valueChanges.subscribe((on) => {
      const till = this.form.controls.tellerGLAccountId;
      till.setValidators(on ? Validators.required : null);
      till.updateValueAndValidity({ emitEvent: false });
    });
    effect(() => {
      const current = this.staff();
      if (current) {
        this.form.reset({
          staffCode: current.staff.staffCode,
          fullName: current.staff.fullName,
          branchId: current.staff.branchId,
          initialSecretKey: 'unused',
          canSwitchBranch: current.staff.canSwitchBranch,
          secretKeyExpiryDays:
            current.secretKeyExpiryDays === null ? '' : String(current.secretKeyExpiryDays),
          isTeller: current.isTeller ?? false,
          tellerGLAccountId: current.tellerGLAccountId ?? null,
        });
      }
      if (!this.canSave()) {
        this.form.disable({ emitEvent: false });
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
    const creating = !this.staff();
    const password = this.form.controls.initialSecretKey;
    if (creating && password.value && !this.rules().every((rule) => rule.met)) {
      password.setErrors({ rules: true });
    }
    const fields = creating
      ? FIELDS
      : FIELDS.filter((name) => !['staffCode', 'branchId', 'initialSecretKey'].includes(name));
    const problems = formProblems(this.form, fields, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const value = this.form.getRawValue();
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        const current = this.staff();
        if (current) {
          await this.client.updateStaff(current.staff.staffUserId, {
            fullName: value.fullName.trim(),
            canSwitchBranch: value.canSwitchBranch,
            isDisabled: current.staff.isDisabled,
            secretKeyExpiryDays: value.secretKeyExpiryDays ? Number(value.secretKeyExpiryDays) : null,
            isTeller: value.isTeller,
            tellerGLAccountId: value.isTeller ? value.tellerGLAccountId : null,
          });
          this.form.markAsPristine();
          this.saved.emit({ staffUserId: current.staff.staffUserId });
        } else {
          const created = await this.client.createStaff({
            staffCode: value.staffCode.trim().toUpperCase(),
            fullName: value.fullName.trim(),
            branchId: value.branchId ?? 0,
            canSwitchBranch: value.canSwitchBranch,
            initialSecretKey: value.initialSecretKey,
            isTeller: value.isTeller,
            tellerGLAccountId: value.isTeller ? value.tellerGLAccountId : null,
          });
          this.form.markAsPristine();
          this.saved.emit({ staffUserId: created.id });
        }
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const errors = { ...problem.errors };
          if (errors['initialSecretKey']) {
            errors['initialSecretKey'] = [passwordMessages(errors['initialSecretKey'])];
          }
          const rest = applyServerErrors(this.form, errors);
          this.problems.set([...formProblems(this.form, fields, MESSAGES), ...rest]);
        } else {
          this.message.set(messageFor(problem));
        }
      }
    });
  }
}
