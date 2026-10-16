import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

/** A decorative icon for features (`<ib-icon name="check-circle" />`). Always hidden from screen readers. */
@Component({
  selector: 'ib-icon',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<span nz-icon [nzType]="name()"></span>`,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<string>();
}
