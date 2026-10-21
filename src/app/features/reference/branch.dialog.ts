import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import type { BranchView } from '../../core/api/api-types';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { applyServerErrors, errorMessage } from '../../shared/forms/form-errors';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import {
  BannerComponent,
  ButtonComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  SwitchComponent,
} from '../../shared/ui';
import { ReferenceClient } from './reference.client';

const MESSAGES: Record<string, Record<string, string>> = {
  branchCode: { required: 'Enter the branch code.', pattern: 'Use 1 to 10 capital letters or digits.' },
  branchName: { required: 'Enter the branch name.' },
  clearingDays: { pattern: 'Enter a number of days from 0 to 30.' },
};

/** New branch and Edit branch (UX 7.7). The code cannot change after it is created. Resolves true when saved. */
@Component({
  selector: 'ib-branch-dialog',
  imports: [
    ReactiveFormsModule,
    BannerComponent,
    ButtonComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    SwitchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      @if (failure(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (!data) {
        <ib-form-field
          label="Branch code"
          [required]="true"
          hint="For example 003"
          [error]="error('branchCode')"
        >
          <input
            ibInput
            ibControl
            formControlName="branchCode"
            autocomplete="off"
            maxlength="10"
            data-autofocus
          />
        </ib-form-field>
      }
      <ib-form-field label="Branch name" [required]="true" [error]="error('branchName')">
        <input ibInput ibControl formControlName="branchName" autocomplete="off" maxlength="100" />
      </ib-form-field>
      <ib-form-field label="Operating licence number" [error]="error('operatingLicenseNo')">
        <input ibInput ibControl formControlName="operatingLicenseNo" autocomplete="off" maxlength="30" />
      </ib-form-field>
      <ib-form-field label="Clearing days" hint="0 to 30" [error]="error('clearingDays')">
        <input ibInput ibControl formControlName="clearingDays" inputmode="numeric" autocomplete="off" />
      </ib-form-field>
      <ib-form-field label="Active">
        <ib-switch formControlName="isActive" />
      </ib-form-field>
      <div class="actions">
        <ib-button (click)="ref.close(false)">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
          data ? 'Save changes' : 'Create branch'
        }}</ib-button>
      </div>
    </form>
  `,
})
export class BranchDialogComponent {
  protected readonly ref = inject<NzModalRef<BranchDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<BranchView | null>(NZ_MODAL_DATA);
  private readonly client = inject(ReferenceClient);

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    branchCode: new FormControl(this.data?.branchCode ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9]{1,10}$/)],
    }),
    branchName: new FormControl(this.data?.branchName ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    operatingLicenseNo: new FormControl(this.data?.operatingLicenseNo ?? '', {
      nonNullable: true,
      validators: Validators.maxLength(30),
    }),
    clearingDays: new FormControl(
      this.data?.clearingDays === null || !this.data ? '' : String(this.data.clearingDays),
      {
        nonNullable: true,
        validators: Validators.pattern(/^([0-9]|[12][0-9]|30)$/),
      },
    ),
    isActive: new FormControl(this.data?.isActive ?? true, { nonNullable: true }),
  });

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name] ?? {});
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      branchCode: value.branchCode.trim().toUpperCase(),
      branchName: value.branchName.trim(),
      operatingLicenseNo: value.operatingLicenseNo.trim() || null,
      clearingDays: value.clearingDays === '' ? null : Number(value.clearingDays),
      isActive: value.isActive,
    };
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        if (this.data) {
          await this.client.updateBranch(this.data.branchId, request);
        } else {
          await this.client.createBranch(request);
        }
        this.ref.close(true);
      } catch (failure) {
        const problem = toApiProblem(failure);
        if (problem.status === 400 && problem.errors) {
          const rest = applyServerErrors(this.form, problem.errors);
          this.failure.set(rest[0]?.message ?? null);
        } else {
          this.failure.set(messageFor(problem));
        }
      }
    });
  }
}
