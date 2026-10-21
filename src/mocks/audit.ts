import { http, HttpResponse } from 'msw';
import type { ActivityRow, ChangeRow } from '../app/core/api/api-types';
import { MOCK_USERS } from './data';

/**
 * Mock audit logs for the audit viewer (API A2-08, UX 6.12): the activity log and the data-change log. Rows are
 * generated relative to today, never real data. Customer activity tabs keep their own rows (kyc mock); account
 * activity and the viewer's general queries are answered here. Each query is itself recorded, as the API does.
 */
const codeOf = (staffUserId: number) =>
  MOCK_USERS.find((user) => user.staffUserId === staffUserId)?.staffCode ?? null;

function at(daysAgo: number, hour: number, minute: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

let nextEvent = 5000;

function activity(
  daysAgo: number,
  hour: number,
  minute: number,
  staffUserId: number | null,
  eventCode: string,
  entityType: string | null,
  entityId: string | null,
  outcome = 'Success',
  details: Record<string, unknown> | null = null,
): ActivityRow {
  return {
    eventId: nextEvent++,
    eventTimestamp: at(daysAgo, hour, minute),
    eventCode,
    outcome,
    sessionId: staffUserId ? 9000 + staffUserId : null,
    staffUserId,
    staffCode: staffUserId ? codeOf(staffUserId) : null,
    branchId: 1,
    entityType,
    entityId,
    requestDetailsJson: details ? JSON.stringify(details) : null,
  };
}

const ACTIVITY: ActivityRow[] = [
  activity(0, 8, 5, 2, 'LOGIN', 'StaffUser', 'TELLER1', 'Success', { device: 'Chrome on Windows' }),
  activity(0, 8, 40, 3, 'LOGIN', 'StaffUser', 'KYC1'),
  activity(0, 9, 12, 2, 'SEARCH', 'Party', null, 'Success', { resultCount: 3 }),
  activity(0, 9, 14, 2, 'VIEW_RECORD', 'Party', '0000000101'),
  activity(0, 9, 30, 3, 'KYC_VERIFY', 'Party', '0000000104', 'Success', { kycStatus: 'VERIFIED' }),
  activity(0, 10, 2, 2, 'ACCOUNT_OPEN', 'Account', '2000000000003', 'Success', { productCode: 'CUR01' }),
  activity(0, 10, 20, 2, 'PERMISSION_DENIED', 'Account', '1000000000001', 'Denied', {
    module: 'ACC',
    subModule: 'CONDITION',
    action: 'Edit',
  }),
  activity(0, 11, 0, null, 'LOGIN_FAILED', 'StaffUser', 'LOCKED', 'Denied', { reason: 'locked' }),
  activity(1, 8, 2, 1, 'BUSINESS_DAY_OPEN', 'BusinessDayStatus', '001:2026-10-14'),
  activity(1, 9, 45, 1, 'USER_ADMIN', 'StaffUser', 'FIELD1', 'Success', { action: 'reset-secret-key' }),
  activity(1, 11, 30, 1, 'BALANCE_HOLD', 'Account', '1000000000001', 'Success', { amount: 150.5 }),
  activity(1, 11, 35, 1, 'BALANCE_RELEASE', 'Account', '1000000000001', 'Success', { amount: 150.5 }),
  activity(1, 16, 50, 6, 'LOGOUT', 'StaffUser', 'FIELD1'),
  activity(2, 10, 0, 7, 'AUDIT_VIEW', 'UserActivityLog', null),
  activity(2, 10, 30, 7, 'SESSION_EXPIRED', 'StaffUser', 'AUDIT1'),
  activity(2, 14, 10, 1, 'SUPERVISE_APPROVE', 'Product', 'SAV01'),
  activity(3, 9, 0, 1, 'CREATE_RECORD', 'LedgerAccount', '1001002', 'Error', { message: 'Unexpected error' }),
  activity(3, 18, 10, 3, 'BUSINESS_DAY_CLOSE', 'BusinessDayStatus', '001:2026-10-13'),
];

let nextChange = 800;

function change(
  daysAgo: number,
  hour: number,
  minute: number,
  staffUserId: number,
  tableName: string,
  recordId: string,
  actionType: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): ChangeRow {
  return {
    auditId: nextChange++,
    loggedOn: at(daysAgo, hour, minute),
    tableName,
    recordId,
    actionType,
    staffUserId,
    staffCode: codeOf(staffUserId),
    branchId: 1,
    oldValueJson: oldValues ? JSON.stringify(oldValues) : null,
    newValueJson: newValues ? JSON.stringify(newValues) : null,
  };
}

const CHANGES: ChangeRow[] = [
  change(
    0,
    9,
    30,
    3,
    'Party',
    '104',
    'UPDATE',
    { KYCStatusId: 1, SupervisedByUserId: null },
    { KYCStatusId: 2, SupervisedByUserId: 3 },
  ),
  change(0, 10, 2, 2, 'Account', '203', 'INSERT', null, {
    AccountNumber: '2000000000003',
    ProductId: 2,
    AccountName: 'Akosua Darko',
    IsSupervised: false,
  }),
  change(
    1,
    9,
    45,
    1,
    'StaffUser',
    '6',
    'UPDATE',
    { SecretKeyHash: '[redacted]', MustChangeSecretKey: false },
    {
      SecretKeyHash: '[redacted]',
      MustChangeSecretKey: true,
    },
  ),
  change(1, 11, 30, 1, 'AccountCondition', '201', 'UPDATE', { FreezedAmount: 0 }, { FreezedAmount: 150.5 }),
  change(
    2,
    14,
    10,
    1,
    'Product',
    '1',
    'UPDATE',
    { ProductName: 'Savings', CreditInterestRate: 2.5 },
    {
      ProductName: 'Regular savings',
      CreditInterestRate: 3,
    },
  ),
  change(
    3,
    12,
    0,
    1,
    'DefinedHoliday',
    '9',
    'DELETE',
    { HolidayDate: '2026-10-09', Remarks: 'Staff day' },
    null,
  ),
  change(
    4,
    15,
    20,
    1,
    'Branch',
    '2',
    'UPDATE',
    { BranchName: 'Kumasi Central', ClearingDays: 3 },
    {
      BranchName: 'Kumasi',
      ClearingDays: 2,
    },
  ),
];

function inRange(timestamp: string, from: string | null, to: string | null): boolean {
  return (!from || timestamp >= from) && (!to || timestamp <= to);
}

function page<T>(rows: T[], url: URL) {
  const current = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));
  return {
    items: rows.slice((current - 1) * size, current * size),
    page: current,
    pageSize: size,
    totalCount: rows.length,
  };
}

export function auditHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  const viewed = (request: Request, entityType: string) => {
    const staffUserId = who(request);
    ACTIVITY.unshift({
      ...activity(0, 0, 0, staffUserId, 'AUDIT_VIEW', entityType, null),
      eventTimestamp: new Date().toISOString(),
    });
  };

  return [
    http.get(`${base}/audit/activity`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const url = new URL(request.url);
      const params = url.searchParams;
      const staffUserId = params.get('staffUserId');
      const rows = ACTIVITY.filter(
        (row) =>
          (!staffUserId || row.staffUserId === Number(staffUserId)) &&
          (!params.get('eventCode') || row.eventCode === params.get('eventCode')) &&
          (!params.get('entityType') || row.entityType === params.get('entityType')) &&
          (!params.get('entityId') || row.entityId === params.get('entityId')) &&
          inRange(row.eventTimestamp, params.get('from'), params.get('to')),
      ).sort((a, b) => (a.eventTimestamp < b.eventTimestamp ? 1 : -1));
      const result = page(rows, url);
      viewed(request, 'UserActivityLog');
      return HttpResponse.json(result);
    }),

    http.get(`${base}/audit/changes`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const url = new URL(request.url);
      const params = url.searchParams;
      const staffUserId = params.get('staffUserId');
      const rows = CHANGES.filter(
        (row) =>
          (!staffUserId || row.staffUserId === Number(staffUserId)) &&
          (!params.get('tableName') || row.tableName === params.get('tableName')) &&
          (!params.get('recordId') || row.recordId === params.get('recordId')) &&
          inRange(row.loggedOn, params.get('from'), params.get('to')),
      ).sort((a, b) => (a.loggedOn < b.loggedOn ? 1 : -1));
      const result = page(rows, url);
      viewed(request, 'DataChangeAuditLog');
      return HttpResponse.json(result);
    }),
  ];
}
