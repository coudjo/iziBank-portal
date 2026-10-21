import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import type { LookupRow } from '../../core/api/api-types';
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

export interface LookupDialogData {
  slug: string;
  listName: string;
  row: LookupRow | null;
}

const MESSAGES: Record<string, Record<string, string>> = {
  code: { required: 'Enter the code.', pattern: 'Use 1 to 30 capital letters, digits or underscores.' },
  name: { required: 'Enter the name.' },
};

/**
 * Add value and Edit value for one lookup list (UX 7.7). Values are never deleted, only deactivated, and the code
 * cannot change. System values (the API relies on them) cannot be deactivated. Resolves true when saved.
 */
@Component({
  selector: 'ib-lookup-dialog',
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
    .code {
      margin: 0 0 var(--ib-space-3);
    }
  `,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      @if (failure(); as text) {
        <ib-banner tone="danger" [message]="text" />
      }
      @if (data.row; as row) {
        <p class="code">
          Code <strong class="ib-num">{{ row.code }}</strong> (cannot change)
        </p>
      } @else {
        <ib-form-field
          label="Code"
          [required]="true"
          hint="Capital letters, digits or underscores"
          [error]="error('code')"
        >
          <input ibInput ibControl formControlName="code" autocomplete="off" maxlength="30" data-autofocus />
        </ib-form-field>
      }
      <ib-form-field label="Name" [required]="true" [error]="error('name')">
        <input ibInput ibControl formControlName="name" autocomplete="off" maxlength="100" />
      </ib-form-field>
      @if (data.row; as row) {
        <ib-form-field
          label="Active"
          [hint]="
            row.isCoded
              ? 'A system value: it cannot be deactivated.'
              : 'Inactive values stay on old records but cannot be chosen.'
          "
        >
          <ib-switch formControlName="isActive" />
        </ib-form-field>
      }
      <div class="actions">
        <ib-button (click)="ref.close(false)">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
          data.row ? 'Save changes' : 'Add value'
        }}</ib-button>
      </div>
    </form>
  `,
})
export class LookupDialogComponent {
  protected readonly ref = inject<NzModalRef<LookupDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<LookupDialogData>(NZ_MODAL_DATA);
  private readonly client = inject(ReferenceClient);

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    code: new FormControl(this.data.row?.code ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9_]{1,30}$/)],
    }),
    name: new FormControl(this.data.row?.name ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    isActive: new FormControl(
      { value: this.data.row?.isActive ?? true, disabled: !!this.data.row?.isCoded },
      { nonNullable: true },
    ),
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
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        if (this.data.row) {
          await this.client.updateLookup(this.data.slug, this.data.row, value.name.trim(), value.isActive);
        } else {
          await this.client.addLookup(this.data.slug, value.code.trim().toUpperCase(), value.name.trim());
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
