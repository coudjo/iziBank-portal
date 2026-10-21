import type { ActivityRow, ChangeRow } from '../../core/api/api-types';
import { eventLabel } from '../../core/audit/audit-labels';

/** What the API writes for a secret value (AuditRedaction.Redacted). */
export const REDACTED = '[redacted]';

/** Record types in staff wording (entity type in the activity log, table in the data-change log). */
export const RECORD_TYPES: Readonly<Record<string, string>> = {
  Party: 'Customer',
  IndividualDetail: 'Customer details (individual)',
  BusinessDetail: 'Customer details (business)',
  PartyDocument: 'Customer document',
  PartyPhoto: 'Customer photo',
  PartySignature: 'Customer signature',
  NextOfKin: 'Next of kin',
  GroupMember: 'Group member',
  Account: 'Account',
  AccountHolder: 'Account holder',
  AccountCondition: 'Account condition',
  Product: 'Product',
  ProductInterestRate: 'Product rate',
  LedgerAccount: 'Ledger account',
  StaffUser: 'Staff member',
  RoleGroup: 'Role group',
  StaffUserRoleGroup: 'Staff role group',
  Branch: 'Branch',
  Currency: 'Currency',
  DefinedHoliday: 'Holiday',
  BusinessDayStatus: 'Business day',
  CreditOfficer: 'Credit officer',
  InstitutionProfile: 'Institution profile',
  ChangeRequest: 'Change request',
  UserActivityLog: 'Activity log',
  DataChangeAuditLog: 'Data-change log',
};

export function recordType(code: string | null | undefined): string {
  return code ? (RECORD_TYPES[code] ?? code) : '—';
}

/** Readable summary of an activity row (UX 6.12 step 2): "Opened the account · Account 2000000000003". */
export function activitySummary(row: Pick<ActivityRow, 'eventCode' | 'entityType' | 'entityId'>): string {
  const what = eventLabel(row.eventCode);
  if (!row.entityType) {
    return what;
  }
  return `${what} · ${recordType(row.entityType)}${row.entityId ? ` ${row.entityId}` : ''}`;
}

export const ACTION_LABELS: Readonly<Record<string, string>> = {
  INSERT: 'Added',
  UPDATE: 'Changed',
  DELETE: 'Removed',
};

export interface FieldChange {
  field: string;
  before: string;
  after: string;
  /** True when the value is secret and the API kept it out of the log. */
  hidden: boolean;
}

/** `CreditInterestRate` → `Credit interest rate`; `KYCStatusId` → `KYC status id`. */
export function fieldLabel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((word, index) => (index > 0 && !/^[A-Z]{2,}$/.test(word) ? word.toLowerCase() : word));
  return words.join(' ');
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function parse(json: string | null): Record<string, unknown> {
  if (!json) {
    return {};
  }
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Old and new values side by side, one line per field (UX 6.12 step 3). An update lists the fields that changed; an
 * addition only has new values and a removal only old ones. Secret values show as hidden, never as the marker text.
 */
export function fieldChanges(row: Pick<ChangeRow, 'oldValueJson' | 'newValueJson'>): FieldChange[] {
  const before = parse(row.oldValueJson);
  const after = parse(row.newValueJson);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter(
      (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]) || before[field] === REDACTED,
    )
    .map((field) => {
      const hidden = before[field] === REDACTED || after[field] === REDACTED;
      return {
        field: fieldLabel(field),
        before: hidden && field in before ? 'Hidden' : show(before[field]),
        after: hidden && field in after ? 'Hidden' : show(after[field]),
        hidden,
      };
    });
}

/** The raw details, indented, or null when there are none or they are not JSON. */
export function prettyJson(json: string | null): string | null {
  if (!json) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/** A day range (`yyyy-MM-dd`, both inclusive) as the API's date-time bounds, in Ghana time (UTC+0). */
export function dayRange(from: string | null, to: string | null): { from: string | null; to: string | null } {
  return {
    from: from ? `${from}T00:00:00Z` : null,
    to: to ? `${to}T23:59:59.999Z` : null,
  };
}
