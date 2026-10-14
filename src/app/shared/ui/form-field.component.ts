import { ChangeDetectionStrategy, Component, Directive, computed, inject, input } from '@angular/core';

let nextId = 0;

/**
 * Label above, hint, error and required marker (frontend plan 4.2). Put `ibControl` on the input inside: it takes
 * the field's id and wires aria-describedby and aria-invalid.
 */
@Component({
  selector: 'ib-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label" [attr.for]="controlId">
      {{ label() }}
      @if (required()) {
        <span class="required" aria-hidden="true">*</span>
        <span class="ib-visually-hidden">(required)</span>
      }
    </label>
    @if (hint()) {
      <p class="hint" [id]="hintId">{{ hint() }}</p>
    }
    <ng-content />
    @if (error()) {
      <p class="error" [id]="errorId" role="alert">{{ error() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--ib-space-4);
    }
    .label {
      display: block;
      font-weight: 550;
      color: var(--ib-ink);
      margin-bottom: var(--ib-space-1);
    }
    .required {
      color: var(--ib-danger-text);
      margin-left: 2px;
    }
    .hint {
      margin: 0 0 var(--ib-space-1);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .error {
      margin: var(--ib-space-1) 0 0;
      color: var(--ib-danger-text);
      font-size: 13px;
    }
  `,
})
export class FormFieldComponent {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly required = input(false);

  readonly controlId = `ib-field-${++nextId}`;
  readonly hintId = `${this.controlId}-hint`;
  readonly errorId = `${this.controlId}-error`;

  readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId : null, this.error() ? this.errorId : null].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  });
}

@Directive({
  selector: '[ibControl]',
  host: {
    '[id]': 'field.controlId',
    '[attr.aria-describedby]': 'field.describedBy()',
    '[attr.aria-invalid]': "field.error() ? 'true' : null",
    '[attr.aria-required]': "field.required() ? 'true' : null",
  },
})
export class FormControlDirective {
  protected readonly field = inject(FormFieldComponent);
}
