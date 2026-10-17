import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { ButtonComponent } from './button.component';
import { FormControlDirective, FormFieldComponent } from './form-field.component';
import { InputDirective } from './input.directive';

export interface ReasonOptions {
  title: string;
  message: string;
  label: string;
  confirmLabel: string;
  required?: boolean;
  maxLength?: number;
}

/** `ib-dialog` reason-required variant (frontend plan 4.2): closes with the reason, or undefined on cancel. */
@Component({
  selector: 'ib-reason-dialog',
  imports: [ButtonComponent, FormControlDirective, FormFieldComponent, InputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    p {
      margin: 0 0 var(--ib-space-4);
    }
    textarea {
      min-height: 6rem;
      resize: vertical;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <form (submit)="$event.preventDefault(); confirm()" novalidate>
      <p>{{ data.message }}</p>
      <ib-form-field [label]="data.label" [required]="data.required ?? true" [error]="error()">
        <textarea
          ibInput
          ibControl
          data-autofocus
          [attr.maxlength]="data.maxLength ?? 300"
          (input)="text.set($any($event.target).value)"
        ></textarea>
      </ib-form-field>
      <div class="actions">
        <ib-button (click)="ref.close()">Cancel</ib-button>
        <ib-button variant="danger" type="submit">{{ data.confirmLabel }}</ib-button>
      </div>
    </form>
  `,
})
export class ReasonDialogComponent {
  protected readonly ref = inject<NzModalRef<ReasonDialogComponent, string>>(NzModalRef);
  protected readonly data = inject<ReasonOptions>(NZ_MODAL_DATA);
  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);

  protected confirm(): void {
    const reason = this.text().trim();
    if ((this.data.required ?? true) && reason.length === 0) {
      this.error.set('Give the reason.');
      return;
    }
    this.ref.close(reason);
  }
}
