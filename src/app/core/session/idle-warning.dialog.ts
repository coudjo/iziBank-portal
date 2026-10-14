import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { ButtonComponent } from '../../shared/ui';
import { Clock } from './clock';
import { formatCountdown } from './session-rules';

export interface IdleWarningData {
  expiresAt: number;
}

export type IdleWarningResult = 'stay' | 'sign-out';

/** UX 5.8: "You will be signed out in 2:00." with Stay signed in and Sign out. */
@Component({
  selector: 'ib-idle-warning-dialog',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .countdown {
      font-size: 16px;
      margin: 0 0 var(--ib-space-4);
    }
    .actions {
      display: flex;
      gap: var(--ib-space-2);
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  `,
  template: `
    <p class="countdown" aria-hidden="true">You will be signed out in {{ remaining() }}.</p>
    <p class="ib-visually-hidden" role="status">{{ announcement() }}</p>
    <div class="actions">
      <ib-button (click)="close('sign-out')">Sign out</ib-button>
      <ib-button variant="primary" (click)="close('stay')">Stay signed in</ib-button>
    </div>
  `,
})
export class IdleWarningDialogComponent {
  private readonly data = inject<IdleWarningData>(NZ_MODAL_DATA);
  private readonly ref = inject<NzModalRef<IdleWarningDialogComponent, IdleWarningResult>>(NzModalRef);
  private readonly clock = inject(Clock);

  protected readonly remaining = signal(formatCountdown(this.data.expiresAt - this.clock.now()));
  /** Announced at the start and at each whole minute, not every second. */
  protected readonly announcement = signal(`You will be signed out in ${this.remaining()}.`);

  constructor() {
    const timer = setInterval(() => {
      const left = this.data.expiresAt - this.clock.now();
      this.remaining.set(formatCountdown(left));
      if (Math.ceil(left / 1000) % 60 === 0) {
        this.announcement.set(`You will be signed out in ${this.remaining()}.`);
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected close(result: IdleWarningResult): void {
    this.ref.close(result);
  }
}
