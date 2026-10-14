import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { StatusDomain, statusFor } from './status-map';

/** Icon plus text, always (UX 5.1). With `explain`, it is a button whose tooltip says what the status means. */
@Component({
  selector: 'ib-status-chip',
  imports: [NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (explain() && status().explanation) {
      <button
        type="button"
        class="chip"
        [class]="'chip chip--' + status().family"
        nz-tooltip
        [nzTooltipTitle]="status().explanation"
      >
        <span nz-icon [nzType]="status().icon" aria-hidden="true"></span>
        <span>{{ status().label }}</span>
      </button>
    } @else {
      <span [class]="'chip chip--' + status().family">
        <span nz-icon [nzType]="status().icon" aria-hidden="true"></span>
        <span>{{ status().label }}</span>
      </span>
    }
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--ib-space-1);
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 550;
      line-height: 20px;
      border: 1px solid transparent;
      font-family: inherit;
    }
    button.chip {
      cursor: help;
    }
    .chip--success {
      color: var(--ib-success-text);
      background: var(--ib-success-bg);
    }
    .chip--warning {
      color: var(--ib-warning-text);
      background: var(--ib-warning-bg);
    }
    .chip--danger {
      color: var(--ib-danger-text);
      background: var(--ib-danger-bg);
    }
    .chip--info {
      color: var(--ib-info-text);
      background: var(--ib-info-bg);
    }
    .chip--neutral {
      color: var(--ib-neutral-text);
      background: var(--ib-neutral-bg);
    }
  `,
})
export class StatusChipComponent {
  readonly domain = input.required<StatusDomain>();
  readonly code = input.required<string>();
  readonly explain = input(false);

  protected readonly status = computed(() => statusFor(this.domain(), this.code()));
}
