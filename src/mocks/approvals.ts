import { http, HttpResponse } from 'msw';
import type { ChangeRequestView, LedgerAccountRequest, LedgerAccountView } from '../app/core/api/api-types';
import { problem, validation } from './parties';

/** Mock chart-of-accounts items and security change requests awaiting approval (F8). Never real data. */
const KEY = 'ib-mock-approvals';

export const LEDGER_TYPES = [
  { id: 1, code: 'ASSET', name: 'Asset', isActive: true, isCoded: true },
  { id: 2, code: 'LIABILITY', name: 'Liability', isActive: true, isCoded: true },
  { id: 3, code: 'EQUITY', name: 'Equity', isActive: true, isCoded: true },
  { id: 4, code: 'INCOME', name: 'Income', isActive: true, isCoded: true },
  { id: 5, code: 'EXPENSE', name: 'Expense', isActive: true, isCoded: true },
];

interface ApprovalState {
  ledger: LedgerAccountView[];
  changes: ChangeRequestView[];
}

const grant = (subModuleCode: string | null, flags: string) => ({
  moduleCode: 'PTY',
  subModuleCode,
  allowView: true,
  allowAdd: flags.includes('A'),
  allowEdit: flags.includes('E'),
  allowDelete: false,
  allowSupervise: flags.includes('S'),
});

function seed(): ApprovalState {
  const account = (
    id: number,
    code: string,
    name: string,
    extra: Partial<LedgerAccountView>,
  ): LedgerAccountView => ({
    ledgerAccountId: id,
    branchId: 1,
    branchCode: '001',
    ledgerAccountCode: code,
    accountName: name,
    ledgerAccountTypeCode: 'ASSET',
    currencyId: 1,
    currencyCode: 'GHS',
    balance: 0,
    supervisionState: 'APPROVED',
    createdByUserId: 99,
    modifiedByUserId: null,
    supervisedByUserId: 1,
    supervisedOn: '2026-10-01T09:00:00Z',
    pendingChange: null,
    ...extra,
    ledgerAccountTypeId:
      LEDGER_TYPES.find((type) => type.code === (extra.ledgerAccountTypeCode ?? 'ASSET'))?.id ?? 1,
  });
  return {
    ledger: [
      account(501, '1001002', 'Teller cash - Kumasi', {
        supervisionState: 'PENDING',
        supervisedByUserId: null,
        supervisedOn: null,
      }),
      account(502, '2001001', 'Customer savings', {
        ledgerAccountTypeCode: 'LIABILITY',
        pendingChange: {
          changeRequestId: 901,
          proposedName: 'Savings deposits',
          requestedByUserId: 99,
          requestedOn: '2026-10-11T14:20:00Z',
        },
      }),
      account(503, '1001001', 'Teller cash - Head Office', {}),
      account(504, '2010001', 'Customer savings control', { ledgerAccountTypeCode: 'LIABILITY' }),
      account(505, '1300001', 'Loans to customers', {}),
    ],
    changes: [
      {
        changeRequestId: 701,
        entityType: 'RoleGroup',
        entityId: '1',
        changeType: 'ROLE_GROUP_UPDATE',
        status: 'PENDING',
        before: { code: 'TELLER', name: 'Teller', description: null, permissions: [grant('PARTY', 'A')] },
        proposed: {
          code: 'TELLER',
          name: 'Teller',
          description: 'Counter staff',
          permissions: [grant('PARTY', 'A'), grant('DOCUMENTS', 'A')],
        },
        requestedByUserId: 99,
        requestedByName: 'Grace Owusu',
        requestedOn: '2026-10-09T08:15:00Z',
        decidedByUserId: null,
        decidedOn: null,
        decisionNote: null,
      },
      {
        changeRequestId: 702,
        entityType: 'StaffBranchAssignment',
        entityId: '2:1',
        changeType: 'STAFF_ROLE_GROUPS_REPLACE',
        status: 'PENDING',
        before: { staffUserId: 2, branchId: 1, roleGroupCodes: ['TELLER'] },
        proposed: { staffUserId: 2, branchId: 1, roleGroupCodes: ['TELLER', 'FIELD_OFFICER'] },
        requestedByUserId: 1,
        requestedByName: 'System Administrator',
        requestedOn: '2026-10-12T10:00:00Z',
        decidedByUserId: null,
        decidedOn: null,
        decisionNote: null,
      },
    ],
  };
}

function load(): ApprovalState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as ApprovalState;
    }
  } catch {
    // Fresh state below.
  }
  return seed();
}

const state = load();
function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

export function approvalHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  const decided = (request: Request) => ({
    decidedByUserId: who(request),
    decidedOn: new Date().toISOString(),
  });

  return [
    http.get(`${base}/ledger-accounts`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const url = new URL(request.url);
      const wanted = url.searchParams.get('supervisionState');
      const type = Number(url.searchParams.get('ledgerAccountTypeId') ?? 0);
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const items = state.ledger.filter(
        (row) =>
          (!wanted || row.supervisionState === wanted) &&
          (!type || row.ledgerAccountTypeId === type) &&
          (!search ||
            row.ledgerAccountCode.toLowerCase().includes(search) ||
            row.accountName.toLowerCase().includes(search)),
      );
      return HttpResponse.json({ items, page: 1, pageSize: 100, totalCount: items.length });
    }),

    http.post(`${base}/ledger-accounts`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as LedgerAccountRequest;
      const code = (body.ledgerAccountCode ?? '').trim().toUpperCase();
      const errors: Record<string, string[]> = {};
      if (!/^[A-Z0-9.-]{1,20}$/.test(code)) {
        errors['ledgerAccountCode'] = ['Use 1 to 20 capital letters, digits, dots or dashes.'];
      }
      if (!body.accountName?.trim()) {
        errors['accountName'] = ['Enter a name of up to 100 characters.'];
      }
      const type = LEDGER_TYPES.find((row) => row.id === body.ledgerAccountTypeId);
      if (!type) {
        errors['ledgerAccountTypeId'] = ['Choose an account type from the list.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      if (state.ledger.some((row) => row.ledgerAccountCode === code)) {
        return problem(409, 'reference.code-taken');
      }
      const id = Math.max(...state.ledger.map((row) => row.ledgerAccountId)) + 1;
      state.ledger.push({
        ledgerAccountId: id,
        branchId: 1,
        branchCode: '001',
        ledgerAccountCode: code,
        accountName: body.accountName!.trim(),
        ledgerAccountTypeId: type!.id,
        ledgerAccountTypeCode: type!.code,
        currencyId: body.currencyId ?? 1,
        currencyCode: 'GHS',
        balance: 0,
        supervisionState: 'PENDING',
        createdByUserId: who(request),
        modifiedByUserId: null,
        supervisedByUserId: null,
        supervisedOn: null,
        pendingChange: null,
      });
      save();
      return HttpResponse.json({ id }, { status: 201 });
    }),

    http.put(`${base}/ledger-accounts/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.ledger.find((item) => item.ledgerAccountId === Number(params['id']));
      if (!row) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as LedgerAccountRequest;
      const name = body.accountName?.trim() ?? '';
      if (!name) {
        return validation({ accountName: ['Enter a name of up to 100 characters.'] });
      }
      if (row.supervisionState === 'PENDING') {
        const type = LEDGER_TYPES.find((item) => item.id === body.ledgerAccountTypeId) ?? LEDGER_TYPES[0];
        Object.assign(row, {
          accountName: name,
          ledgerAccountTypeId: type.id,
          ledgerAccountTypeCode: type.code,
          modifiedByUserId: who(request),
        });
        save();
        return new HttpResponse(null, { status: 204 });
      }
      if (body.ledgerAccountTypeId !== row.ledgerAccountTypeId || body.currencyId !== row.currencyId) {
        return problem(409, 'ledger.field-locked');
      }
      if (name === row.accountName) {
        return new HttpResponse(null, { status: 204 });
      }
      if (row.pendingChange) {
        return problem(409, 'change.pending-exists');
      }
      row.pendingChange = {
        changeRequestId: 900 + row.ledgerAccountId,
        proposedName: name,
        requestedByUserId: who(request) ?? 0,
        requestedOn: new Date().toISOString(),
      };
      save();
      return HttpResponse.json({ changeRequestId: row.pendingChange.changeRequestId }, { status: 202 });
    }),

    http.get(`${base}/ledger-accounts/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.ledger.find((item) => item.ledgerAccountId === Number(params['id']));
      return row ? HttpResponse.json(row) : problem(404, 'not-found');
    }),

    http.post(`${base}/ledger-accounts/:id/approve`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.ledger.find((item) => item.ledgerAccountId === Number(params['id']));
      if (!row) {
        return problem(404, 'not-found');
      }
      const me = who(request);
      if (row.pendingChange) {
        if (row.pendingChange.requestedByUserId === me) {
          return problem(409, 'supervision.self-approval');
        }
        row.accountName = row.pendingChange.proposedName;
        row.pendingChange = null;
      } else if (row.supervisionState === 'PENDING') {
        if (row.createdByUserId === me || row.modifiedByUserId === me) {
          return problem(409, 'supervision.self-approval');
        }
        Object.assign(row, {
          supervisionState: 'APPROVED',
          supervisedByUserId: me,
          supervisedOn: new Date().toISOString(),
        });
      } else {
        return problem(409, 'supervision.not-pending');
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/ledger-accounts/:id/reject`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const index = state.ledger.findIndex((item) => item.ledgerAccountId === Number(params['id']));
      const row = state.ledger[index];
      if (!row) {
        return problem(404, 'not-found');
      }
      if (row.pendingChange) {
        row.pendingChange = null;
      } else if (row.supervisionState === 'PENDING' && row.supervisedByUserId === null) {
        state.ledger.splice(index, 1);
      } else {
        return problem(409, 'supervision.reject-not-allowed');
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/change-requests`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const status = new URL(request.url).searchParams.get('status');
      return HttpResponse.json(state.changes.filter((row) => !status || row.status === status));
    }),

    http.get(`${base}/change-requests/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.changes.find((item) => item.changeRequestId === Number(params['id']));
      return row ? HttpResponse.json(row) : problem(404, 'not-found');
    }),

    http.post(`${base}/change-requests/:id/approve`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.changes.find((item) => item.changeRequestId === Number(params['id']));
      if (!row || row.status !== 'PENDING') {
        return problem(409, 'change.not-pending');
      }
      if (row.requestedByUserId === who(request)) {
        return problem(409, 'supervision.self-approval');
      }
      const refused = changeAppliers.map((apply) => apply(row)).find((outcome) => outcome !== null);
      if (refused) {
        return problem(409, refused);
      }
      Object.assign(row, { status: 'APPROVED', ...decided(request) });
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/change-requests/:id/reject`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const row = state.changes.find((item) => item.changeRequestId === Number(params['id']));
      if (!row || row.status !== 'PENDING') {
        return problem(409, 'change.not-pending');
      }
      const body = (await request.json()) as { reason?: string };
      Object.assign(row, { status: 'REJECTED', decisionNote: body.reason ?? null, ...decided(request) });
      save();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

/** A ledger account by id, for the product mocks' control account. */
export function ledgerById(id: number | null | undefined): LedgerAccountView | undefined {
  return state.ledger.find((row) => row.ledgerAccountId === id);
}

/**
 * Applies an approved change to another mock (security registers one for role groups and assignments). Returns a
 * problem type to refuse the approval, or null.
 */
export const changeAppliers: ((change: ChangeRequestView) => string | null)[] = [];

/** Records a change request waiting for approval, as the API does for security changes (HTTP 202). */
export function addChange(
  change: Pick<ChangeRequestView, 'entityType' | 'entityId' | 'changeType' | 'before' | 'proposed'>,
  requestedByUserId: number,
  requestedByName: string,
): number {
  const changeRequestId = Math.max(700, ...state.changes.map((row) => row.changeRequestId)) + 1;
  state.changes.push({
    ...change,
    changeRequestId,
    status: 'PENDING',
    requestedByUserId,
    requestedByName,
    requestedOn: new Date().toISOString(),
    decidedByUserId: null,
    decidedOn: null,
    decisionNote: null,
  });
  save();
  return changeRequestId;
}

/** The pending change for a record, if any. */
export function pendingChange(entityType: string, entityId: string): ChangeRequestView | undefined {
  return state.changes.find(
    (row) => row.status === 'PENDING' && row.entityType === entityType && row.entityId === entityId,
  );
}
