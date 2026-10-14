import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { SessionMonitor } from './core/session/session-monitor';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    const router = inject(Router);
    const auth = inject(AuthService);
    const monitor = inject(SessionMonitor);
    let first = true;

    // The session monitor runs while a profile is loaded (signed in and past the sign-in page).
    effect(() => {
      if (auth.me()) {
        monitor.start();
      } else {
        monitor.stop();
      }
    });

    // Signed out in another tab, or the session ended: leave the signed-in area.
    effect(() => {
      if (!auth.isSignedIn() && auth.endedReason() && !router.url.startsWith('/login')) {
        void router.navigateByUrl('/login');
      }
    });

    // After each navigation, focus moves to the page h1 so screen-reader and keyboard users start at the content.
    router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        if (first) {
          first = false;
          return;
        }
        setTimeout(() => {
          const heading = document.querySelector<HTMLElement>('[data-page-title]');
          (heading ?? document.getElementById('main'))?.focus();
        });
      });
  }
}
