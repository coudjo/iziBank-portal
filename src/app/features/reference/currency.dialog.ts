import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import type { CurrencyView } from '../../core/api/api-types';
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

export interface CurrencyDialogData {
  currency: CurrencyView | null;
  local: CurrencyView | null;
}

const MESSAGES: Record<string, Record<string, string>> = {
  currencyCode: {
    required: 'Enter the currency code.',
    pattern: 'Use the three-letter ISO code, for example USD.',
  },
  currencyName: { required: 'Enter the currency name.' },
  exchangeRate: {
    required: 'Enter the exchange rate.',
    pattern: 'Enter a rate greater than zero, for example 15.25.',
  },
};

/**
 * New currency and Edit currency (UX 7.7). Exactly one currency is local: ticking Local moves the flag here, and the
 * local currency's rate is always 1. Resolves true when saved.
 */
@Component({
  selector: 'ib-currency-dialog',
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
      @if (!data.currency) {
        <ib-form-field
          label="Currency code"
          [required]="true"
          hint="ISO code, for example USD"
          [error]="error('currencyCode')"
        >
          <input
            ibInput
            ibControl
            formControlName="currencyCode"
            autocomplete="off"
            maxlength="3"
            data-autofocus
          />
        </ib-form-field>
      }
      <ib-form-field label="Currency name" [required]="true" [error]="error('currencyName')">
        <input ibInput ibControl formControlName="currencyName" autocomplete="off" maxlength="50" />
      </ib-form-field>
      @if (data.currency?.isLocalCurrency) {
        <ib-banner
          tone="info"
          message="This is the local currency."
          description="Its rate is always 1. To change the local currency, edit the currency that should become local."
        />
      } @else {
        <ib-form-field
          label="Local currency"
          [hint]="
            data.local
              ? 'Moves the local flag from ' + data.local.currencyCode + '. Not possible once products exist.'
              : null
          "
        >
          <ib-switch formControlName="isLocalCurrency" />
        </ib-form-field>
        @if (!value().isLocalCurrency) {
          <ib-form-field
            label="Exchange rate"
            [required]="true"
            [hint]="'Value of 1 unit in ' + (data.local?.currencyCode ?? 'the local currency')"
            [error]="error('exchangeRate')"
          >
            <input ibInput ibControl formControlName="exchangeRate" inputmode="decimal" autocomplete="off" />
          </ib-form-field>
        }
      }
      <div class="actions">
        <ib-button (click)="ref.close(false)">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="guard.busy()">{{
          data.currency ? 'Save changes' : 'Create currency'
        }}</ib-button>
      </div>
    </form>
  `,
})
export class CurrencyDialogComponent {
  protected readonly ref = inject<NzModalRef<CurrencyDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<CurrencyDialogData>(NZ_MODAL_DATA);
  private readonly client = inject(ReferenceClient);

  protected readonly guard = new SubmitGuard();
  protected readonly failure = signal<string | null>(null);
  private readonly submitted = signal(false);
  private readonly current = this.data.currency;

  protected readonly form = new FormGroup({
    currencyCode: new FormControl(this.current?.currencyCode ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
    currencyName: new FormControl(this.current?.currencyName ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    isLocalCurrency: new FormControl(this.current?.isLocalCurrency ?? false, { nonNullable: true }),
    exchangeRate: new FormControl(
      this.current?.exchangeRate === null || this.current?.exchangeRate === undefined
        ? ''
        : String(this.current.exchangeRate),
      { nonNullable: true, validators: Validators.pattern(/^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,6})?$/) },
    ),
  });
  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name] ?? {});
  }

  protected async save(): Promise<void> {
    this.submitted.set(true);
    const value = this.form.getRawValue();
    const local = value.isLocalCurrency || !!this.current?.isLocalCurrency;
    const rate = this.form.controls.exchangeRate;
    rate.setValidators(
      local ? null : [Validators.required, Validators.pattern(/^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,6})?$/)],
    );
    rate.updateValueAndValidity({ emitEvent: false });
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const request = {
      currencyCode: value.currencyCode.trim().toUpperCase(),
      currencyName: value.currencyName.trim(),
      exchangeRate: local ? 1 : Number(value.exchangeRate),
      isLocalCurrency: local,
    };
    await this.guard.run(async () => {
      this.failure.set(null);
      try {
        if (this.current) {
          await this.client.updateCurrency(this.current.currencyId, request);
        } else {
          await this.client.createCurrency(request);
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
