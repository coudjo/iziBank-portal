import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

export type ViewportSize = 'desktop' | 'tablet' | 'phone';

const PHONE = '(max-width: 767.98px)';
const TABLET = '(min-width: 768px) and (max-width: 1279.98px)';

/** One source for layout decisions (frontend plan 4.3): desktop 1280+, tablet 768 to 1279, phone below 768. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly observer = inject(BreakpointObserver);

  readonly size = toSignal(
    this.observer
      .observe([PHONE, TABLET])
      .pipe(
        map((state): ViewportSize =>
          state.breakpoints[PHONE] ? 'phone' : state.breakpoints[TABLET] ? 'tablet' : 'desktop',
        ),
      ),
    { initialValue: sizeNow() },
  );
}

function sizeNow(): ViewportSize {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'desktop';
  }
  if (window.matchMedia(PHONE).matches) {
    return 'phone';
  }
  return window.matchMedia(TABLET).matches ? 'tablet' : 'desktop';
}
