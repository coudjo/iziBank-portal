import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

/** Persistent page message (UX 5.6). Danger and warning are announced assertively. */
@Component({
  selector: 'ib-banner',
  imports: [NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [attr.role]="tone() === 'danger' || tone() === 'warning' ? 'alert' : 'status'">
      <nz-alert [nzType]="nzType()" [nzMessage]="message()" [nzDescription]="description()" nzShowIcon />
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--ib-space-4);
    }
  `,
})
export class BannerComponent {
  readonly tone = input<BannerTone>('info');
  readonly message = input.required<string>();
  readonly description = input<string | null>(null);

  protected readonly nzType = computed((): 'info' | 'success' | 'warning' | 'error' => {
    const tone = this.tone();
    return tone === 'danger' ? 'error' : tone;
  });
}
