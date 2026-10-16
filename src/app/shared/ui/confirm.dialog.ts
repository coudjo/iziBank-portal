import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { ButtonComponent } from './button.component';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

/** `ib-dialog` confirm variant (frontend plan 4.2). Cancel is first in the tab order and is the safe choice. */
@Component({
  selector: 'ib-confirm-dialog',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    p {
      margin: 0 0 var(--ib-space-5);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
    }
  `,
  template: `
    <p>{{ data.message }}</p>
    <div class="actions">
      <ib-button (click)="ref.close(false)">{{ data.cancelLabel ?? 'Cancel' }}</ib-button>
      <ib-button [variant]="data.tone ?? 'primary'" (click)="ref.close(true)">{{
        data.confirmLabel
      }}</ib-button>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly ref = inject<NzModalRef<ConfirmDialogComponent, boolean>>(NzModalRef);
  protected readonly data = inject<ConfirmOptions>(NZ_MODAL_DATA);
}
