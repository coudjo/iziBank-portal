import { ChangeDetectionStrategy, Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FormControlDirective } from './form-field.component';

/** A yes/no toggle (`role="switch"`) labelled by its `ib-form-field`. Shows Yes or No in text, not colour alone. */
@Component({
  selector: 'ib-switch',
  imports: [FormControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SwitchComponent), multi: true }],
  template: `
    <button
      type="button"
      role="switch"
      ibControl
      [attr.aria-checked]="on()"
      [disabled]="disabled()"
      (click)="toggle()"
      (blur)="onTouched()"
    >
      <span class="track" [class.on]="on()" aria-hidden="true"><span class="thumb"></span></span>
      <span class="text">{{ on() ? 'Yes' : 'No' }}</span>
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-2);
      min-height: var(--ib-touch-target);
      padding: 0;
      font: inherit;
      color: var(--ib-ink);
      background: none;
      border: 0;
      cursor: pointer;
    }
    .track {
      position: relative;
      width: 44px;
      height: 24px;
      border-radius: 12px;
      border: 1px solid var(--ib-border-control);
      background: var(--ib-surface-subtle);
    }
    .track.on {
      background: var(--ib-primary);
      border-color: var(--ib-primary);
    }
    .thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--ib-surface);
      border: 1px solid var(--ib-border-control);
      transition: left 0.15s;
    }
    .on .thumb {
      left: 22px;
    }
    .text {
      font-weight: 550;
    }
    @media (prefers-reduced-motion: reduce) {
      .thumb {
        transition: none;
      }
    }
  `,
})
export class SwitchComponent implements ControlValueAccessor {
  protected readonly on = signal(false);
  protected readonly disabled = signal(false);
  private onChange: (value: boolean) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: boolean | null): void {
    this.on.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected toggle(): void {
    this.on.set(!this.on());
    this.onChange(this.on());
  }
}
