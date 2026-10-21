/** Readable names for activity codes (API EventCodes), shared by the Activity tabs and the audit viewer. */
export const EVENT_LABELS: Readonly<Record<string, string>> = {
  API_REQUEST: 'Called the API',
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed to sign in',
  LOGOUT: 'Signed out',
  SESSION_EXPIRED: 'Session expired',
  SECRET_KEY_CHANGED: 'Changed the password',
  PERMISSION_DENIED: 'Was refused',
  VIEW_RECORD: 'Viewed the record',
  SEARCH: 'Searched',
  CREATE_RECORD: 'Created',
  UPDATE_RECORD: 'Changed',
  DELETE_RECORD: 'Deleted',
  SUPERVISE_APPROVE: 'Approved',
  SUPERVISE_REJECT: 'Rejected',
  KYC_VERIFY: 'Verified KYC and approved',
  KYC_REJECT: 'Rejected KYC',
  ACCOUNT_OPEN: 'Opened the account',
  ACCOUNT_CLOSE: 'Closed the account',
  ACCOUNT_FREEZE: 'Froze the account',
  ACCOUNT_UNFREEZE: 'Unfroze the account',
  BALANCE_HOLD: 'Held an amount',
  BALANCE_RELEASE: 'Released a hold',
  DORMANCY_CHANGE: 'Changed dormancy',
  USER_ADMIN: 'Changed a staff member',
  AUDIT_VIEW: 'Viewed the audit log',
  BUSINESS_DAY_OPEN: 'Opened the business day',
  BUSINESS_DAY_CLOSE: 'Closed the business day',
};

export function eventLabel(code: string): string {
  return EVENT_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

/** The API's outcomes are Success, Denied and Error (ActivityOutcomes); compare without case to be safe. */
export function isSuccess(outcome: string | null | undefined): boolean {
  return (outcome ?? '').toLowerCase() === 'success';
}
