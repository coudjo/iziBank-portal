import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { displayPhone, normalizePhone } from '../../core/formats/phone';
import { FormControlDirective } from './form-field.component';
import { InputDirective } from './input.directive';

/**
 * `ib-phone-input` (frontend plan 6.7): accepts `024 123 4567` or `+233 24 123 4567`. The control value is E.164
 * (`+233241234567`), or the typed text while it is not a valid number, which fails the `phone` validator. On blur
 * a valid number is shown in national format. Use inside `ib-form-field`.
 */
@Component({
  selector: 'ib-phone-input',
  imports: [InputDirective, FormControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
  template: `
    <input
      ibInput
      ibControl
      type="tel"
      inputmode="tel"
      [attr.autocomplete]="autocomplete()"
      [value]="text()"
      [disabled]="disabled()"
      (input)="typed($event)"
      (blur)="left()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class PhoneInputComponent implements ControlValueAccessor, Validator {
  readonly autocomplete = input('tel');

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.text.set(displayPhone(value));
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
    const value = control.value;
    if (!value) {
      return null;
    }
    const result = normalizePhone(value);
    return result.kind === 'valid' && result.e164 === value ? null : { phone: true };
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    this.onChange(valueOf(text));
  }

  protected left(): void {
    const result = normalizePhone(this.text());
    if (result.kind === 'valid') {
      this.text.set(displayPhone(result.e164));
    }
    this.onTouched();
  }
}

function valueOf(text: string): string | null {
  const result = normalizePhone(text);
  switch (result.kind) {
    case 'empty':
      return null;
    case 'valid':
      return result.e164;
    default:
      return text.trim();
  }
}
