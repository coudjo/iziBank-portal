import { ChangeDetectionStrategy, Component, forwardRef, signal } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { formatDate, isIsoDate, parseDisplayDate } from '../../core/formats/dates';
import { FormControlDirective } from './form-field.component';
import { InputDirective } from './input.directive';

/**
 * `ib-date-input` (frontend plan 6.7, ADR 0003): typed as `dd/mm/yyyy`, the control value is `yyyy-MM-dd`. Text that
 * is not a real date stays as typed and fails the `date` validator. No `Date` objects are involved.
 */
@Component({
  selector: 'ib-date-input',
  imports: [InputDirective, FormControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateInputComponent), multi: true },
  ],
  template: `
    <input
      ibInput
      ibControl
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="dd/mm/yyyy"
      maxlength="10"
      [value]="text()"
      [disabled]="disabled()"
      (input)="typed($event)"
      (blur)="onTouched()"
    />
  `,
  styles: `
    :host {
      display: block;
      max-width: 12rem;
    }
  `,
})
export class DateInputComponent implements ControlValueAccessor, Validator {
  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private onChange: (value: string | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.text.set(isIsoDate(value) ? formatDate(value) : (value ?? ''));
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    return !control.value || isIsoDate(control.value) ? null : { date: true };
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    const trimmed = text.trim();
    this.onChange(trimmed.length === 0 ? null : (parseDisplayDate(trimmed) ?? trimmed));
  }
}
