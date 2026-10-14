import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CurrentBusinessDay } from '../api/api-types';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { ActivityTracker } from '../session/activity-tracker';
import { Clock } from '../session/clock';
import { dueForRefresh, formatWorkingDate, stateOf } from './working-date-rules';

/**
 * The open business day of the working branch (frontend plan 6.4, F3-03). Loads when the profile loads or the
 * branch changes, then every 5 minutes while the user is active. Account opening reads `isOpen` later.
 */
@Injectable({ providedIn: 'root' })
export class WorkingDateService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly activity = inject(ActivityTracker);
  private readonly clock = inject(Clock);
  private readonly base = inject(ConfigService).config.apiBaseUrl.replace(/\/$/, '');

  private readonly day = signal<CurrentBusinessDay | null>(null);
  private loadedAt = 0;
  private context: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private request = 0;

  readonly current = this.day.asReadonly();
  readonly state = computed(() => stateOf(this.day()));
  readonly isOpen = computed(() => this.state() === 'open');
  /** `12/10/2026`, or null when no day is open. */
  readonly displayDate = computed(() => {
    const day = this.day();
    return day?.workingDate && this.state() !== 'not-open' ? formatWorkingDate(day.workingDate) : null;
  });

  constructor() {
    effect(() => {
      const me = this.auth.me();
      const context = me ? `${me.staffUserId}:${me.branchId}` : null;
      untracked(() => this.onContext(context));
    });
  }

  /** Reloads now, e.g. after a supervisor opens or closes the day. */
  async refresh(): Promise<void> {
    const ticket = ++this.request;
    this.loadedAt = this.clock.now();
    try {
      const day = await firstValueFrom(
        this.http.get<CurrentBusinessDay>(`${this.base}/business-day/current`),
      );
      if (ticket === this.request && this.context !== null) {
        this.day.set(day);
      }
    } catch {
      // Keep what we had; the next refresh tries again. Session problems are handled by the interceptor.
    }
  }

  /** One timer evaluation. Public for tests. */
  tick(): void {
    if (
      this.context !== null &&
      dueForRefresh(this.clock.now(), this.loadedAt, this.activity.lastActivityAt)
    ) {
      void this.refresh();
    }
  }

  private onContext(context: string | null): void {
    if (context === this.context) {
      return;
    }
    const sameUser = context !== null && this.context?.split(':')[0] === context.split(':')[0];
    this.context = context;
    if (!sameUser) {
      // A different person (or nobody) must never see the previous branch's date.
      this.day.set(null);
    }

    if (context === null) {
      this.request++;
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }

    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), 30_000);
    }
    void this.refresh();
  }
}
