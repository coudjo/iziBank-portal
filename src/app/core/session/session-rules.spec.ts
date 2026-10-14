import { SessionTiming, formatCountdown, nextSessionAction, shouldWarnMaxSession } from './session-rules';

const MINUTE = 60_000;

function timing(overrides: Partial<SessionTiming>): SessionTiming {
  return {
    now: 0,
    expiresAt: 15 * MINUTE,
    sessionMaxAt: 12 * 60 * MINUTE,
    lastActivityAt: 0,
    refreshWhenRemainingMs: 5 * MINUTE,
    activeWindowMs: MINUTE,
    idleWarningMs: 2 * MINUTE,
    maxNoticeMs: 10 * MINUTE,
    ...overrides,
  };
}

describe('nextSessionAction', () => {
  it('does nothing while plenty of time remains', () => {
    expect(nextSessionAction(timing({ now: MINUTE, lastActivityAt: MINUTE }))).toEqual({ kind: 'none' });
  });

  it('renews silently when under 5 minutes remain and the user was active in the last minute', () => {
    const now = 11 * MINUTE;
    expect(nextSessionAction(timing({ now, lastActivityAt: now - 30_000 }))).toEqual({ kind: 'refresh' });
  });

  it('does not renew for an idle user, and warns 2 minutes before expiry', () => {
    expect(nextSessionAction(timing({ now: 11 * MINUTE, lastActivityAt: 0 }))).toEqual({ kind: 'none' });
    expect(nextSessionAction(timing({ now: 13.5 * MINUTE, lastActivityAt: 0 }))).toEqual({
      kind: 'warn-idle',
      remainingMs: 1.5 * MINUTE,
    });
  });

  it('reports expiry once the token has run out', () => {
    expect(nextSessionAction(timing({ now: 15 * MINUTE }))).toEqual({ kind: 'expired' });
  });

  it('stops renewing when the token already ends at the session maximum', () => {
    const now = 11 * MINUTE;
    expect(nextSessionAction(timing({ now, lastActivityAt: now, sessionMaxAt: 15 * MINUTE }))).toEqual({
      kind: 'none',
    });
  });
});

describe('shouldWarnMaxSession', () => {
  it('warns 10 minutes before the maximum session length', () => {
    const sessionMaxAt = 12 * 60 * MINUTE;
    expect(
      shouldWarnMaxSession({ now: sessionMaxAt - 11 * MINUTE, sessionMaxAt, maxNoticeMs: 10 * MINUTE }),
    ).toBe(false);
    expect(
      shouldWarnMaxSession({ now: sessionMaxAt - 10 * MINUTE, sessionMaxAt, maxNoticeMs: 10 * MINUTE }),
    ).toBe(true);
  });
});

describe('formatCountdown', () => {
  it('shows minutes and seconds', () => {
    expect(formatCountdown(2 * MINUTE)).toBe('2:00');
    expect(formatCountdown(65_400)).toBe('1:06');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
