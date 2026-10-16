import { ApiProblem } from './api-problem';

/**
 * One message per API problem type (frontend plan 6.2, UX section 8). The wording belongs to the portal; the
 * API's titles are never shown. `npm run check:errors` fails when this list and api/problem-types.md differ.
 */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  validation: 'Some fields need attention.',
  'not-found': 'We could not find that record.',
  unexpected: 'Something went wrong.',
  'auth.invalid-credentials': 'Check your staff code and password.',
  'auth.locked': 'Too many attempts. Try again in {minutes} minutes.',
  'auth.unauthenticated': 'Sign in to continue.',
  'auth.session-ended': 'You have been signed out.',
  'auth.session-superseded': 'You were signed out because your staff code signed in somewhere else.',
  'auth.session-timed-out': 'You were signed out after a period of inactivity.',
  'auth.session-max-exceeded': 'Your session reached its maximum length. Sign in again to continue.',
  'auth.session-forced': 'An administrator ended your session.',
  'auth.must-change-secret-key': 'Change your password to continue.',
  'auth.secret-key-rules': 'The new password does not meet the rules.',
  'auth.current-secret-key-wrong': 'The current password is not correct.',
  'auth.permission-denied': 'You do not have permission to do that.',
  'auth.branch-not-allowed': 'You cannot work in that branch.',
  'audit.activity-log-unavailable': 'We could not open this record safely. Try again.',
  'session.not-open': 'That session has already ended.',
  'rolegroup.code-taken': 'A role group with this code already exists.',
  'rolegroup.inactive': 'This role group is already inactive.',
  'security.self-assignment': 'You cannot change your own role groups. Ask another administrator.',
  'security.last-administrator':
    'This change would leave nobody able to manage users, permissions and KYC, so it was not applied.',
  'change.pending-exists': 'A change to this record is already waiting for approval.',
  'change.not-pending': 'This change is no longer waiting for approval.',
  'lookup.code-taken': 'This code is already in the list.',
  'lookup.code-immutable': 'A code cannot be changed after it is created.',
  'lookup.coded-row': 'The system relies on this value, so it cannot be deactivated.',
  'staff.code-taken': 'This staff code is already in use.',
  'staff.self-change': 'You cannot change your own staff record here. Ask another administrator.',
  'supervision.permission-denied': 'You do not have permission to approve this.',
  'supervision.self-approval': 'A different supervisor must approve this, because you created or changed it.',
  'supervision.not-pending': 'This record is not waiting for approval.',
  'supervision.pending': 'This record is waiting for supervisor approval.',
  'supervision.reject-not-allowed':
    'This record was changed after approval. Correct it with Edit, then approve.',
  'supervision.has-dependents': 'This record is already in use, so it cannot be rejected.',
  'reference.code-taken': 'This code is already in use.',
  'reference.code-immutable': 'A code cannot be changed after it is created.',
  'record.other-branch': 'This record belongs to another branch. Switch to that branch to change it.',
  'record.changed': 'Someone else changed this record. Reload it and try again.',
  'currency.local-required': 'There must always be one local currency. Make another currency local instead.',
  'holiday.exists': 'A holiday is already set for that date.',
  'holiday.business-day-exists': 'A branch has already worked on that date, so it cannot be changed.',
  'business-day.not-open': 'The business day is not open for this branch. Ask a supervisor to open it.',
  'business-day.previous-open': 'Close the current business day before opening the next one.',
  'business-day.date-not-after': 'The new business day must come after the last one.',
  'business-day.non-working-day': 'That date is a weekend or a holiday.',
  'ledger.field-locked': 'The type and currency cannot change once the account is approved.',
  'party.duplicate-identification': 'A customer with this ID already exists: {name} ({number}).',
  'party.duplicate-registration':
    'A business with this registration number already exists: {name} ({number}).',
  'group.member-in-other-group': 'This person is already an active member of another group ({group}).',
  'group.chairperson-exists': 'This group already has a chairperson.',
  'party.primary-document':
    "This is the customer's main ID document, so it cannot be deleted. Change the ID on the Details tab instead.",
  'upload.empty': 'The file is empty. Choose another file.',
  'upload.too-large': 'The file is too large. The limit is {size}.',
  'upload.type-not-allowed':
    'This type of file is not allowed. Use a JPEG or PNG image, or a PDF for documents.',
  'upload.type-mismatch':
    'The file does not match its type. Save it again as a JPEG, PNG or PDF and try again.',
  'upload.dimensions': 'The signature image is too large. It can be at most {width} by {height} pixels.',
  'credit-officer.exists': 'This staff member is already a credit officer.',
  'kyc.checklist-incomplete': 'The checklist is not complete, so KYC cannot be verified yet.',
  'kyc.not-pending': 'KYC for this customer has already been decided.',
  'idempotency.key-invalid': 'Something went wrong. Try again.',
  'idempotency.key-reused': 'This was already sent with different details. Start again.',
  'idempotency.in-progress': 'The first attempt is still being processed. Wait a moment, then check again.',
};

/** Portal-only problems that never come from the API. */
const LOCAL_MESSAGES: Readonly<Record<string, string>> = {
  network: 'We could not reach the server. Check the connection and try again.',
};

/**
 * The message for a problem. `{placeholders}` are filled from the problem's extensions and from `values` (for
 * example a customer's name the screen looked up); a placeholder with no value is dropped with its brackets.
 */
export function messageFor(
  problem: Pick<ApiProblem, 'type' | 'extensions'>,
  traceId?: string,
  values: Readonly<Record<string, string>> = {},
): string {
  if (problem.type === 'auth.locked') {
    const seconds = Number(problem.extensions['retryAfterSeconds'] ?? 0);
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return ERROR_MESSAGES['auth.locked'].replace('{minutes}', String(minutes));
  }

  const message = ERROR_MESSAGES[problem.type] ?? LOCAL_MESSAGES[problem.type];
  if (message) {
    return fill(message, { ...placeholders(problem.extensions), ...values });
  }

  return traceId ? `Something went wrong. Reference: ${traceId}` : ERROR_MESSAGES['unexpected'];
}

/** Extension names the API uses, mapped to the placeholders in the messages above. */
function placeholders(extensions: Readonly<Record<string, unknown>>): Record<string, string> {
  const result: Record<string, string> = {};
  const text = (key: string) => (typeof extensions[key] === 'string' ? (extensions[key] as string) : null);
  const number = (key: string) => (typeof extensions[key] === 'number' ? (extensions[key] as number) : null);

  const party = text('existingPartyNumber') ?? text('memberPartyNumber');
  if (party) {
    result['number'] = party;
  }
  const group = text('groupPartyNumber');
  if (group) {
    result['group'] = group;
  }
  const maxBytes = number('maxBytes');
  if (maxBytes !== null) {
    result['size'] = formatBytes(maxBytes);
  }
  const width = number('maxWidth');
  const height = number('maxHeight');
  if (width !== null && height !== null) {
    result['width'] = String(width);
    result['height'] = String(height);
  }
  return result;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1024)} KB`;
}

/** Fills `{name}` placeholders. "{name} ({number})" with only a number becomes "({number})" without the gap. */
function fill(message: string, values: Readonly<Record<string, string>>): string {
  return message
    .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? '')
    .replace(/:\s+\(/g, ' (')
    .replace(/\s*\(\)/g, '')
    .replace(/\s+([.,])/g, '$1')
    .replace(/:\./g, '.');
}
