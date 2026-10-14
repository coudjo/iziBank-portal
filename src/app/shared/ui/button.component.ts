import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/** Buttons (frontend plan 4.2). While loading the button is locked and keeps its width. */
@Component({
  selector: 'ib-button',
  imports: [NzButtonModule, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      nz-button
      [attr.type]="type()"
      [nzType]="nzType()"
      [nzDanger]="variant() === 'danger'"
      [nzLoading]="loading()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [class.ib-button--block]="block()"
    >
      @if (icon() && !loading()) {
        <span nz-icon [nzType]="icon()!" aria-hidden="true"></span>
      }
      <ng-content />
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    :host(.ib-block),
    .ib-button--block {
      width: 100%;
    }
    button {
      min-width: 88px;
      font-weight: 550;
    }
  `,
  host: { '[class.ib-block]': 'block()' },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly type = input<'button' | 'submit'>('button');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);
  readonly icon = input<string | null>(null);

  protected readonly nzType = computed(() => {
    switch (this.variant()) {
      case 'primary':
      case 'danger':
        return 'primary';
      case 'quiet':
        return 'text';
      default:
        return 'default';
    }
  });
}
