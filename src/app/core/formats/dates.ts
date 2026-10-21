/**
 * Dates (frontend plan T8, 6.7). `date` values are `yyyy-MM-dd` strings end to end and never pass through `Date`,
 * so no time zone can shift them. Timestamps are ISO UTC strings.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  const match = ISO.exec(value ?? '');
  return match !== null && isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** `1985-03-27` → `27/03/1985`. Anything else is returned as given. */
export function formatDate(value: string | null | undefined): string {
  const match = ISO.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value ?? '');
}

/** `27/03/1985` (also `27-3-1985`, `27.03.1985`) → `1985-03-27`; null when it is not a real date. */
export function parseDisplayDate(text: string | null | undefined): string | null {
  const match = DISPLAY.exec((text ?? '').trim());
  if (!match) {
    return null;
  }
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isRealDate(year, month, day) ? iso(year, month, day) : null;
}

/** Today's local calendar date as `yyyy-MM-dd`. */
export function todayIso(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Whole years from `birth` to `on`, both `yyyy-MM-dd`. Same rule as the API: someone born on 29 February has their
 * birthday on 1 March in other years.
 */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [oy, om, od] = on.split('-').map(Number);
  let age = oy - by;
  const leapBirthday = bm === 2 && bd === 29 && !isLeap(oy);
  const [month, day] = leapBirthday ? [3, 1] : [bm, bd];
  if (om < month || (om === month && od < day)) {
    age--;
  }
  return age;
}

/** Formats an ISO timestamp for display in Ghana time (UTC+0): `14/10/2026 09:30`. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : value;
}

/** `yyyy-MM-dd` plus `days`, in calendar days (no time zones involved). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= days;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
