/** Wording for account codes (UX section 8 terms: hold amount, not freeze balance; approve, not supervise). */
export const HOLDER_ROLE_LABELS: Readonly<Record<string, string>> = {
  PRIMARY: 'Primary holder',
  JOINT: 'Joint holder',
  SIGNATORY: 'Signatory',
  BENEFICIAL_OWNER: 'Beneficial owner (information only)',
};

export const OPERATING_MODE_LABELS: Readonly<Record<string, string>> = {
  SINGLE: 'Single',
  EITHER_TO_SIGN: 'Either to sign',
  ALL_TO_SIGN: 'All to sign',
};

export const FREEZE_ACTION_LABELS: Readonly<Record<string, string>> = {
  HOLD_AMOUNT: 'Hold amount',
  RELEASE_AMOUNT: 'Release hold',
  FREEZE_ACCOUNT: 'Freeze account',
  UNFREEZE_ACCOUNT: 'Unfreeze account',
};

export const CLOSE_CHECK_LABELS: Readonly<Record<string, string>> = {
  ZERO_BALANCE: 'Balance is zero',
  NO_HOLDS: 'No amounts on hold',
  NO_PENDING_ITEMS: 'No items waiting for approval',
};

export const ACCOUNT_STATUSES = [
  { code: 'ACTIVE', label: 'Active' },
  { code: 'PENDING_SUPERVISION', label: 'Awaiting approval' },
  { code: 'FROZEN', label: 'Frozen' },
  { code: 'DORMANT', label: 'Dormant' },
  { code: 'CLOSED', label: 'Closed' },
];

export const label = (labels: Readonly<Record<string, string>>, code: string | null | undefined): string =>
  code ? (labels[code] ?? code) : '—';

/** Shown once on a new account's page (UX 6.7 step 6). Passed as router state, never in the URL. */
export const OPENED_STATE = 'ibOpened';

/** Set by the customer record's "Open account": the customer number to start with. Router state, never the URL. */
export const PRIMARY_STATE = 'ibPrimary';
