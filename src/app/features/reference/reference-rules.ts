import type { BusinessDayView, HolidayView } from '../../core/api/api-types';
import { addDays, formatDate } from '../../core/formats/dates';
import type { PermissionRule } from '../../core/permissions/permission.service';

/** One reference screen: where it lives, who may open it, and the hub's one-line description. */
export interface ReferenceScreen {
  label: string;
  /** Route path under /reference, or the full link when the screen lives elsewhere. */
  path: string;
  link: string;
  icon: string;
  description: string;
  permission: PermissionRule;
}

/** Administration > Reference (UX 7.7). The hub, the routes and the sidebar read this one list. */
export const REFERENCE_SCREENS: readonly ReferenceScreen[] = [
  {
    label: 'Business day',
    path: 'business-day',
    link: '/business-day',
    icon: 'clock-circle',
    description: 'Open and close the working day for this branch.',
    permission: { module: 'REF', subModule: 'CALENDAR', action: 'view' },
  },
  {
    label: 'Institution',
    path: 'institution',
    link: '/reference/institution',
    icon: 'bank',
    description: 'Name, licence and regulatory category for reports.',
    permission: { module: 'REF', subModule: 'INSTITUTION', action: 'view' },
  },
  {
    label: 'Branches',
    path: 'branches',
    link: '/reference/branches',
    icon: 'appstore',
    description: 'Branch codes, names and licences.',
    permission: { module: 'REF', subModule: 'BRANCHES', action: 'view' },
  },
  {
    label: 'Currencies',
    path: 'currencies',
    link: '/reference/currencies',
    icon: 'sync',
    description: 'The local currency and exchange rates.',
    permission: { module: 'REF', subModule: 'CURRENCIES', action: 'view' },
  },
  {
    label: 'Holidays',
    path: 'holidays',
    link: '/reference/holidays',
    icon: 'inbox',
    description: 'Days no branch opens.',
    permission: { module: 'REF', subModule: 'CALENDAR', action: 'view' },
  },
  {
    label: 'Lookups',
    path: 'lookups',
    link: '/reference/lookups',
    icon: 'setting',
    description: 'The lists used in forms, such as ID types and close reasons.',
    permission: { module: 'REF', subModule: 'LOOKUPS', action: 'view' },
  },
  {
    label: 'Credit officers',
    path: 'credit-officers',
    link: '/reference/credit-officers',
    icon: 'team',
    description: 'Staff who look after customers.',
    permission: { module: 'PTY', subModule: 'CREDIT_OFFICERS', action: 'view' },
  },
];

export const REFERENCE_RULES: readonly PermissionRule[] = REFERENCE_SCREENS.map(
  (screen) => screen.permission,
);

/** Display names for lookup lists, in UX wording (section 8: customer, not party). */
const LOOKUP_NAMES: Readonly<Record<string, string>> = {
  'regulatory-categories': 'Regulatory categories',
  'business-day-statuses': 'Business day statuses',
  'logout-reasons': 'Sign-out reasons',
  'party-types': 'Customer types',
  'kyc-statuses': 'KYC statuses',
  genders: 'Genders',
  'identification-document-types': 'ID document types',
  'business-categories': 'Business categories',
  'group-member-roles': 'Group member roles',
  'product-types': 'Product types',
  'rate-types': 'Rate types',
  'operating-modes': 'Operating modes',
  'operating-instructions': 'Operating instructions',
  'account-holder-roles': 'Account holder roles',
  'close-reasons': 'Account close reasons',
  'freeze-release-actions': 'Hold and freeze actions',
  'ledger-account-types': 'Ledger account types',
};

export function lookupName(slug: string): string {
  const known = LOOKUP_NAMES[slug];
  if (known) {
    return known;
  }
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** API Calendar:WeekendDays (Saturday and Sunday). The API decides; this only explains before sending. */
const WEEKEND = [0, 6];

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Why a date cannot be opened, in words, or null when the API should accept it (UX 6.11 step 2). */
export function whyNotOpen(
  date: string,
  latest: Pick<BusinessDayView, 'workingDate' | 'status'> | null,
  holidays: readonly Pick<HolidayView, 'holidayDate' | 'remarks'>[],
): string | null {
  if (latest && latest.status !== 'CLOSED') {
    return `The day of ${formatDate(latest.workingDate)} is still open. Close it first.`;
  }
  if (latest && date <= latest.workingDate) {
    return `The date must be after the last business day, ${formatDate(latest.workingDate)}.`;
  }
  if (WEEKEND.includes(weekday(date))) {
    return `${formatDate(date)} is a ${weekday(date) === 0 ? 'Sunday' : 'Saturday'}, not a working day.`;
  }
  const holiday = holidays.find((item) => item.holidayDate === date);
  if (holiday) {
    return `${formatDate(date)} is a holiday${holiday.remarks ? ` (${holiday.remarks})` : ''}.`;
  }
  return null;
}

/** The next date the API should accept: the day after the last one (or today when there is none), skipping weekends and holidays. */
export function nextWorkingDay(
  latest: Pick<BusinessDayView, 'workingDate'> | null,
  today: string,
  holidays: readonly Pick<HolidayView, 'holidayDate'>[],
): string {
  let date = latest ? addDays(latest.workingDate, 1) : today;
  for (let guard = 0; guard < 60; guard++) {
    if (!WEEKEND.includes(weekday(date)) && !holidays.some((item) => item.holidayDate === date)) {
      return date;
    }
    date = addDays(date, 1);
  }
  return date;
}

/** The weekends and holidays between the last business day and `date`, with why (shown under the proposal). */
export function skippedDays(
  latest: Pick<BusinessDayView, 'workingDate'> | null,
  date: string,
  holidays: readonly Pick<HolidayView, 'holidayDate' | 'remarks'>[],
): string[] {
  if (!latest) {
    return [];
  }
  const reasons: string[] = [];
  for (let current = addDays(latest.workingDate, 1); current < date; current = addDays(current, 1)) {
    const holiday = holidays.find((item) => item.holidayDate === current);
    if (!holiday && !WEEKEND.includes(weekday(current))) {
      continue;
    }
    reasons.push(
      holiday
        ? `${formatDate(current)}: holiday${holiday.remarks ? ` (${holiday.remarks})` : ''}`
        : `${formatDate(current)}: ${weekday(current) === 0 ? 'Sunday' : 'Saturday'}`,
    );
  }
  return reasons;
}
