import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { FormControlDirective } from './form-field.component';
import { InputDirective } from './input.directive';

let nextList = 0;

/**
 * `ib-combobox` (frontend plan 4.2): a text input with suggestions. With `strict`, only a listed value is accepted
 * (the `option` validator) and the case is corrected on blur; without it, free text is allowed.
 */
@Component({
  selector: 'ib-combobox',
  imports: [InputDirective, FormControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ComboboxComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => ComboboxComponent), multi: true },
  ],
  template: `
    <input
      ibInput
      ibControl
      type="text"
      autocomplete="off"
      [attr.list]="listId"
      [attr.maxlength]="maxLength()"
      [value]="text()"
      [disabled]="disabled()"
      (input)="typed($event)"
      (blur)="left()"
    />
    <datalist [id]="listId">
      @for (option of options(); track option) {
        <option [value]="option"></option>
      }
    </datalist>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ComboboxComponent implements ControlValueAccessor, Validator {
  readonly options = input<readonly string[]>([]);
  readonly strict = input(false);
  readonly maxLength = input<number | null>(null);

  protected readonly listId = `ib-combobox-${++nextList}`;
  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private readonly byLower = computed(
    () => new Map(this.options().map((option) => [option.toLowerCase(), option])),
  );
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.text.set(value ?? '');
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
    const value = control.value?.trim();
    if (!value || !this.strict()) {
      return null;
    }
    return this.options().includes(value) ? null : { option: true };
  }

  protected typed(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    const trimmed = text.trim();
    this.onChange(trimmed.length === 0 ? null : (this.byLower().get(trimmed.toLowerCase()) ?? trimmed));
  }

  protected left(): void {
    const canonical = this.byLower().get(this.text().trim().toLowerCase());
    if (canonical) {
      this.text.set(canonical);
    }
    this.onTouched();
  }
}
