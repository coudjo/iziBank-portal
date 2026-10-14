import { DestroyRef, Injectable, inject } from '@angular/core';
import { Clock } from './clock';

const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/** Remembers when the user last interacted with the page (frontend plan 5). Used only by the session monitor. */
@Injectable({ providedIn: 'root' })
export class ActivityTracker {
  private readonly clock = inject(Clock);
  private last = this.clock.now();
  private readonly handler = () => {
    this.last = this.clock.now();
  };

  constructor() {
    for (const event of EVENTS) {
      document.addEventListener(event, this.handler, { passive: true, capture: true });
    }
    inject(DestroyRef).onDestroy(() => {
      for (const event of EVENTS) {
        document.removeEventListener(event, this.handler, { capture: true });
      }
    });
  }

  get lastActivityAt(): number {
    return this.last;
  }

  /** Counts as activity, e.g. pressing Stay signed in. */
  touch(): void {
    this.last = this.clock.now();
  }
}
