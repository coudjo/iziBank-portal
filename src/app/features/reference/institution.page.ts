import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { InstitutionProfileView, LookupRow } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { todayIso } from '../../core/formats/dates';
import { LookupsService } from '../../core/lookups/lookups.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import type { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  DateInputComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
  PageHeaderComponent,
  ToastService,
} from '../../shared/ui';
import { ReferenceBackComponent } from './back-link.component';
import { ReferenceClient } from './reference.client';

const FIELDS = [
  'institutionName',
  'licenseNumber',
  'regulatoryCategoryId',
  'incorporationDate',
  'headOfficeAddress',
];
const MESSAGES = {
  institutionName: { required: 'Enter the institution name.' },
  licenseNumber: {},
  regulatoryCategoryId: {},
  incorporationDate: { future: 'The incorporation date cannot be in the future.' },
  headOfficeAddress: {},
};

/** Institution profile (UX 7.7): one form. Regulatory reports need it complete. */
@Component({
  selector: 'ib-institution-page',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    DateInputComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
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
    }
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
    textarea {
      min-height: 4.5rem;
      resize: vertical;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
  template: `
    <ib-reference-back />
    <ib-page-header title="Institution" />
    @if (loadError(); as text) {
      <ib-banner tone="danger" [message]="text" />
    } @else if (profile(); as current) {
      @if (!current.isComplete) {
        <ib-banner
          tone="warning"
          message="The profile is not complete."
          description="Regulatory reports need the licence number, regulatory category, incorporation date and head office address."
        />
      }
      <section aria-label="Institution profile">
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <ib-error-summary [problems]="problems()" />
          @if (message(); as text) {
            <ib-banner tone="danger" [message]="text" />
          }
          <div class="grid">
            <ib-form-field label="Institution name" [required]="true" [error]="error('institutionName')">
              <input
                ibInput
                ibControl
                formControlName="institutionName"
                autocomplete="organization"
                maxlength="150"
              />
            </ib-form-field>
            <ib-form-field label="Licence number" [error]="error('licenseNumber')">
              <input ibInput ibControl formControlName="licenseNumber" autocomplete="off" maxlength="30" />
            </ib-form-field>
            <ib-form-field label="Regulatory category" [error]="error('regulatoryCategoryId')">
              <ib-lookup-select
                formControlName="regulatoryCategoryId"
                [options]="categories()"
                placeholder="Choose"
              />
            </ib-form-field>
            <ib-form-field label="Incorporation date" [error]="error('incorporationDate')">
              <ib-date-input formControlName="incorporationDate" />
            </ib-form-field>
          </div>
          <ib-form-field label="Head office address" [error]="error('headOfficeAddress')">
            <textarea ibInput ibControl formControlName="headOfficeAddress" maxlength="300"></textarea>
          </ib-form-field>
          @if (canEdit()) {
            <div class="actions">
              <ib-button variant="primary" type="submit" [loading]="guard.busy()">Save changes</ib-button>
            </div>
          }
        </form>
      </section>
    } @else {
      <p aria-live="polite">Loading the institution profile…</p>
    }
  `,
})
export class InstitutionPage implements HasUnsavedChanges {
  private readonly client = inject(ReferenceClient);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);

  protected readonly guard = new SubmitGuard();
  protected readonly profile = signal<InstitutionProfileView | null>(null);
  protected readonly categories = signal<LookupRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  private readonly submitted = signal(false);
  protected readonly canEdit = computed(() =>
    this.permissions.can({ module: 'REF', subModule: 'INSTITUTION', action: 'edit' }),
  );

  protected readonly form = new FormGroup({
    institutionName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    licenseNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(30) }),
    regulatoryCategoryId: new FormControl<number | null>(null),
    incorporationDate: new FormControl<string | null>(null, (control) =>
      control.value && control.value > todayIso() ? { future: true } : null,
    ),
    headOfficeAddress: new FormControl('', { nonNullable: true, validators: Validators.maxLength(300) }),
  });

  constructor() {
    inject(LookupsService)
      .list('regulatory-categories')
      .then(
        (rows) => this.categories.set(rows),
        () => this.categories.set([]),
      );
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  private async load(): Promise<void> {
    try {
      const profile = await this.client.institution();
      this.profile.set(profile);
      this.form.reset({
        institutionName: profile.institutionName,
        licenseNumber: profile.licenseNumber ?? '',
        regulatoryCategoryId: profile.regulatoryCategoryId,
        incorporationDate: profile.incorporationDate,
        headOfficeAddress: profile.headOfficeAddress ?? '',
      });
      if (!this.canEdit()) {
        this.form.disable();
      }
    } catch (failure) {
      this.loadError.set(messageFor(toApiProblem(failure)));
    }
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
    await this.guard.run(async () => {
      this.message.set(null);
      try {
        await this.client.updateInstitution({
          institutionName: value.institutionName.trim(),
          licenseNumber: value.licenseNumber.trim() || null,
          regulatoryCategoryId: value.regulatoryCategoryId,
          incorporationDate: value.incorporationDate,
          headOfficeAddress: value.headOfficeAddress.trim() || null,
        });
        this.form.markAsPristine();
        this.toast.success('Institution profile saved.');
        await this.load();
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
