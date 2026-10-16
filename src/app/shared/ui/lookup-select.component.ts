import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FormControlDirective } from './form-field.component';
import { InputDirective } from './input.directive';

export interface LookupOption {
  id: number;
  name: string;
}

/**
 * `ib-lookup-select` (frontend plan 4.2): a native select for short lookup lists, so it works with keyboards, screen
 * readers and phone pickers without extra code (ADR 0003). The value is the option id, or null.
 */
@Component({
  selector: 'ib-lookup-select',
  imports: [InputDirective, FormControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LookupSelectComponent), multi: true },
  ],
  template: `
    <select ibInput ibControl [disabled]="disabled()" (change)="picked($event)" (blur)="onTouched()">
      <option value="" [selected]="value() === null">{{ placeholder() }}</option>
      @for (option of options(); track option.id) {
        <option [value]="option.id" [selected]="option.id === value()">{{ option.name }}</option>
      }
    </select>
  `,
  styles: `
    :host {
      display: block;
    }
    select {
      appearance: auto;
      cursor: pointer;
    }
  `,
})
export class LookupSelectComponent implements ControlValueAccessor {
  readonly options = input<readonly LookupOption[]>([]);
  readonly placeholder = input('Choose');

  protected readonly value = signal<number | null>(null);
  protected readonly disabled = signal(false);
  private onChange: (value: number | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected picked(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const value = raw === '' ? null : Number(raw);
    this.value.set(value);
    this.onChange(value);
  }
}
