import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { NzModalRef } from 'ng-zorro-antd/modal';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { DialogService } from '../../shared/ui/dialog.service';
import { ActivityTracker } from './activity-tracker';
import { Clock } from './clock';
import type { IdleWarningData, IdleWarningDialogComponent, IdleWarningResult } from './idle-warning.dialog';
import { ReauthService } from './reauth.service';
import { nextSessionAction, shouldWarnMaxSession } from './session-rules';

/**
 * Frontend plan 6.1: silent renewal while active, idle warning before expiry, notice before the maximum session
 * length, and the re-sign-in dialog when the token runs out.
 */
@Injectable({ providedIn: 'root' })
export class SessionMonitor {
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityTracker);
  private readonly clock = inject(Clock);
  private readonly dialogs = inject(DialogService);
  private readonly reauth = inject(ReauthService);
  private readonly router = inject(Router);
  private readonly config = inject(ConfigService).config;

  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private idleDialog: NzModalRef<IdleWarningDialogComponent, IdleWarningResult> | null = null;
  private idleDialogOpening = false;
  private noticedMaxFor: string | null = null;

  /** Set when the maximum session length is near: "Your session reaches its maximum length at 18:30." */
  readonly maxSessionNotice = signal<string | null>(null);

  start(): void {
    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), 1000);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.closeIdleDialog();
    this.maxSessionNotice.set(null);
  }

  /** One evaluation of the rules. Public for tests. */
  tick(): void {
    const expiresAt = this.auth.expiresAt();
    if (!expiresAt || !this.auth.me() || this.reauth.isOpen) {
      return;
    }

    const sessionMax = this.auth.sessionMaxExpiresAt();
    const timing = {
      now: this.clock.now(),
      expiresAt: Date.parse(expiresAt),
      sessionMaxAt: sessionMax ? Date.parse(sessionMax) : null,
      lastActivityAt: this.activity.lastActivityAt,
      refreshWhenRemainingMs: this.config.refreshWhenRemainingSeconds * 1000,
      activeWindowMs: this.config.activeWindowSeconds * 1000,
      idleWarningMs: this.config.idleWarningSeconds * 1000,
      maxNoticeMs: (this.config.maxSessionNoticeSeconds ?? 600) * 1000,
    };

    if (sessionMax && this.noticedMaxFor !== sessionMax && shouldWarnMaxSession(timing)) {
      this.noticedMaxFor = sessionMax;
      const at = new Date(timing.sessionMaxAt!).toLocaleTimeString('en-GH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      this.maxSessionNotice.set(`Your session reaches its maximum length at ${at}. Save your work.`);
    }

    const action = nextSessionAction(timing);
    switch (action.kind) {
      case 'refresh':
        this.closeIdleDialog();
        void this.refresh();
        break;
      case 'warn-idle':
        this.openIdleDialog(timing.expiresAt);
        break;
      case 'expired':
        this.closeIdleDialog();
        this.reauth.request('auth.session-timed-out');
        break;
      default:
        break;
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      await this.auth.refresh();
    } catch {
      // A failed refresh surfaces through the session interceptor (re-sign-in dialog).
    } finally {
      this.refreshing = false;
    }
  }

  private openIdleDialog(expiresAt: number): void {
    if (this.idleDialog || this.idleDialogOpening) {
      return;
    }
    this.idleDialogOpening = true;
    void import('./idle-warning.dialog')
      .then(({ IdleWarningDialogComponent: component }) =>
        this.dialogs.open<IdleWarningDialogComponent, IdleWarningData, IdleWarningResult>(
          component,
          { expiresAt },
          { title: 'Are you still there?', dismissible: false },
        ),
      )
      .then((ref) => {
        this.idleDialog = ref;
        ref.afterClose.subscribe((result) => {
          this.idleDialog = null;
          if (result === 'stay') {
            this.activity.touch();
            void this.refresh();
          } else if (result === 'sign-out') {
            void this.auth.logout().then(() => this.router.navigateByUrl('/login'));
          }
        });
      })
      .finally(() => (this.idleDialogOpening = false));
  }

  private closeIdleDialog(): void {
    this.idleDialog?.close();
    this.idleDialog = null;
  }
}
