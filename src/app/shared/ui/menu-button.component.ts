import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

export interface MenuItem {
  label: string;
  value: string;
}

/**
 * A button that opens a menu (`ib-menu-button`), built on the CDK menu so roles, arrow keys, Home and End, Esc and
 * focus return work as the ARIA menu button pattern says.
 */
@Component({
  selector: 'ib-menu-button',
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="ant-btn"
      [class.ant-btn-primary]="variant() === 'primary'"
      [cdkMenuTriggerFor]="menu"
    >
      @if (icon()) {
        <span nz-icon [nzType]="icon()!" aria-hidden="true"></span>
      }
      <span>{{ label() }}</span>
      <span nz-icon nzType="down" aria-hidden="true"></span>
    </button>
    <ng-template #menu>
      <div cdkMenu class="ib-menu" [attr.aria-label]="label()">
        @for (item of items(); track item.value) {
          <button
            type="button"
            cdkMenuItem
            class="ib-menu-item"
            (cdkMenuItemTriggered)="selected.emit(item.value)"
          >
            {{ item.label }}
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    button.ant-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-2);
      font-weight: 550;
    }
  `,
})
export class MenuButtonComponent {
  readonly label = input.required<string>();
  readonly items = input.required<readonly MenuItem[]>();
  readonly icon = input<string | null>(null);
  readonly variant = input<'primary' | 'secondary'>('secondary');
  readonly selected = output<string>();
}
