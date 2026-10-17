import { http, HttpResponse } from 'msw';
import type { ChangeRequestView, LedgerAccountView } from '../app/core/api/api-types';
import { problem } from './parties';

/** Mock chart-of-accounts items and security change requests awaiting approval (F8). Never real data. */
const KEY = 'ib-mock-approvals';

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
    ledgerAccountTypeId: 1,
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
      const items = state.ledger.filter((row) => !wanted || row.supervisionState === wanted);
      return HttpResponse.json({ items, page: 1, pageSize: 100, totalCount: items.length });
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
