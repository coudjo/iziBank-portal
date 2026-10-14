/** Frontend plan 6.4 and the service table: refresh at load, on branch switch and every 5 minutes. */
export const WORKING_DATE_REFRESH_MS = 5 * 60_000;

/** `2026-10-12` → `12/10/2026` (UX 4.1 shows dates as dd/mm/yyyy). Anything else is returned as given. */
export function formatWorkingDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

/**
 * A timed refresh happens only when the last load is old enough and the user has done something since, so an
 * unattended screen does not keep calling the API.
 */
export function dueForRefresh(now: number, lastLoadedAt: number, lastActivityAt: number): boolean {
  return now - lastLoadedAt >= WORKING_DATE_REFRESH_MS && lastActivityAt > lastLoadedAt;
}

export type WorkingDateState = 'unknown' | 'open' | 'not-open' | 'end-of-day';

export function stateOf(day: { isOpen: boolean; status: string | null } | null): WorkingDateState {
  if (!day) {
    return 'unknown';
  }
  if (day.isOpen) {
    return 'open';
  }
  return day.status === 'EOD_IN_PROGRESS' ? 'end-of-day' : 'not-open';
}
