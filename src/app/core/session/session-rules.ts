/**
 * Session timing rules (frontend plan 6.1, UX 5.8) as a pure function so they can be tested without timers.
 */
export interface SessionTiming {
  now: number;
  expiresAt: number;
  sessionMaxAt: number | null;
  lastActivityAt: number;
  refreshWhenRemainingMs: number;
  activeWindowMs: number;
  idleWarningMs: number;
  maxNoticeMs: number;
}

export type SessionAction =
  { kind: 'none' } | { kind: 'refresh' } | { kind: 'warn-idle'; remainingMs: number } | { kind: 'expired' };

export function nextSessionAction(timing: SessionTiming): SessionAction {
  const remaining = timing.expiresAt - timing.now;
  if (remaining <= 0) {
    return { kind: 'expired' };
  }

  const recentlyActive = timing.now - timing.lastActivityAt <= timing.activeWindowMs;
  // A refresh never extends past the session maximum, so stop asking once the token already ends there.
  const tokenEndsAtMax = timing.sessionMaxAt !== null && timing.expiresAt >= timing.sessionMaxAt;

  if (remaining <= timing.refreshWhenRemainingMs && recentlyActive && !tokenEndsAtMax) {
    return { kind: 'refresh' };
  }

  if (remaining <= timing.idleWarningMs && !recentlyActive) {
    return { kind: 'warn-idle', remainingMs: remaining };
  }

  return { kind: 'none' };
}

/** True once, when the maximum session length is within the notice window. */
export function shouldWarnMaxSession(
  timing: Pick<SessionTiming, 'now' | 'sessionMaxAt' | 'maxNoticeMs'>,
): boolean {
  return timing.sessionMaxAt !== null && timing.sessionMaxAt - timing.now <= timing.maxNoticeMs;
}

/** "1:45" for a countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
