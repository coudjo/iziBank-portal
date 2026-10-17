import { http, HttpResponse } from 'msw';
import type {
  AccountBalanceView,
  AccountClassificationView,
  AccountListRow,
  AccountView,
  ClassificationOption,
  FreezeActionView,
  OpenAccountRequest,
  PartyAccountRow,
  ProductView,
} from '../app/core/api/api-types';
import { find, problem, validation } from './parties';

/**
 * Mock products and accounts (never real data) following api/openapi.json (API A5). Balances are zero: there are no
 * transactions in Phase A. Kept in this tab's sessionStorage like the rest of the mock state.
 */
const KEY = 'ib-mock-accounts';

export const OPERATING_MODES = [
  { id: 1, code: 'SINGLE', name: 'Single', isActive: true, isCoded: true },
  { id: 2, code: 'EITHER_TO_SIGN', name: 'Either to sign', isActive: true, isCoded: true },
  { id: 3, code: 'ALL_TO_SIGN', name: 'All to sign', isActive: true, isCoded: true },
];

export const HOLDER_ROLES = [
  { id: 1, code: 'PRIMARY', name: 'Primary', isActive: true, isCoded: true },
  { id: 2, code: 'JOINT', name: 'Joint', isActive: true, isCoded: true },
  { id: 3, code: 'SIGNATORY', name: 'Signatory', isActive: true, isCoded: true },
  { id: 4, code: 'BENEFICIAL_OWNER', name: 'Beneficial owner', isActive: true, isCoded: true },
];

export const CLOSE_REASONS = [
  { id: 1, code: 'CUSTOMER_REQUEST', name: 'Customer request', isActive: true, isCoded: true },
  { id: 2, code: 'DECEASED', name: 'Deceased', isActive: true, isCoded: true },
  { id: 3, code: 'FRAUD', name: 'Fraud', isActive: true, isCoded: true },
  { id: 6, code: 'OPENED_IN_ERROR', name: 'Opened in error', isActive: true, isCoded: true },
  { id: 7, code: 'OTHER', name: 'Other', isActive: true, isCoded: true },
];

const DIRECT_TYPES = ['SAVINGS', 'CURRENT'];

interface MockHold {
  id: number;
  action: string;
  amount: number | null;
  remarks: string | null;
  createdByUserId: number | null;
  createdOn: string;
}

interface MockAccount {
  view: AccountView;
  holds: MockHold[];
  classifications: AccountClassificationView[];
}

interface AccountState {
  products: ProductView[];
  accounts: MockAccount[];
  catalog: ClassificationOption[];
  next: number;
  sequence: number;
}

function product(
  productId: number,
  code: string,
  name: string,
  type: string,
  prefix: string,
  extra: Partial<ProductView> = {},
): ProductView {
  return {
    productId,
    branchId: 1,
    branchCode: '001',
    productCode: code,
    productName: name,
    productTypeId: { SAVINGS: 1, CURRENT: 2, FIXED_DEPOSIT: 3, LOAN: 4 }[type] ?? 1,
    productTypeCode: type,
    accountPrefix: prefix,
    currencyId: 1,
    currencyCode: 'GHS',
    ledgerControlAccountId: 501,
    ledgerControlAccountCode: '2010-01',
    ledgerControlAccountName: 'Customer savings',
    creditInterestRate: 3,
    debitInterestRate: null,
    minimumBalance: 50,
    accountsPerCustomer: null,
    isChequeBookAllowed: false,
    isFreezed: false,
    isActive: true,
    supervisionState: 'APPROVED',
    createdByUserId: 1,
    createdOn: '2026-09-01T08:00:00Z',
    modifiedByUserId: null,
    supervisedByUserId: 3,
    supervisedOn: '2026-09-01T09:00:00Z',
    pendingChange: null,
    ...extra,
  };
}

const ZERO: Omit<AccountBalanceView, 'minimumBalance'> = {
  openingBalance: 0,
  clearBalance: 0,
  freezedAmount: 0,
  unsupervisedCredit: 0,
  unsupervisedDebit: 0,
  overdrawLimit: 0,
  availableBalance: 0,
  totalBalance: 0,
  currencyCode: 'GHS',
  lastCreditTransactionDate: null,
  lastDebitTransactionDate: null,
};

function account(
  accountId: number,
  number: string,
  name: string,
  item: ProductView,
  holders: AccountView['holders'],
  extra: Partial<AccountView> = {},
): MockAccount {
  return {
    holds: [],
    classifications: [],
    view: {
      accountId,
      accountNumber: number,
      accountName: name,
      branchId: 1,
      branchCode: '001',
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      productTypeCode: item.productTypeCode,
      currencyCode: 'GHS',
      dateOpened: '2026-09-10',
      operatingModeCode: 'SINGLE',
      status: 'ACTIVE',
      supervisionState: 'APPROVED',
      isDormant: false,
      closedOn: null,
      closeReasonCode: null,
      openedByUserId: 2,
      createdOn: '2026-09-10T10:00:00Z',
      modifiedByUserId: null,
      supervisedByUserId: 1,
      supervisedOn: '2026-09-10T12:00:00Z',
      holders,
      balance: { ...ZERO, minimumBalance: item.minimumBalance },
      condition: {
        isFreezed: false,
        doNotAllowCredit: false,
        doNotAllowDebit: false,
        creditLimit: null,
        debitLimit: null,
        superviseAllTransactions: false,
        doNotApplyTransactionCharges: false,
      },
      reminders: [],
      ...extra,
    },
  };
}

const AKOSUA = {
  partyId: 101,
  partyNumber: '0000000101',
  displayName: 'Akosua Darko',
  partyTypeCode: 'INDIVIDUAL',
};

function seed(): AccountState {
  const savings = product(1, 'SAV01', 'Regular savings', 'SAVINGS', '10');
  const current = product(2, 'CUR01', 'Business current', 'CURRENT', '20', { minimumBalance: 100 });
  const loan = product(3, 'LN01', 'Salary loan', 'LOAN', '30', {
    minimumBalance: null,
    creditInterestRate: null,
  });
  const frozen = product(4, 'SAV02', 'Junior savings', 'SAVINGS', '11', { isFreezed: true });
  return {
    next: 205,
    sequence: 10,
    products: [savings, current, loan, frozen],
    catalog: [
      {
        accountClassificationId: 1,
        classificationCode: 'RISK',
        classificationName: 'Risk rating',
        subClassifications: [
          { accountSubClassificationId: 1, subClassificationCode: 'LOW', subClassificationName: 'Low' },
          { accountSubClassificationId: 2, subClassificationCode: 'HIGH', subClassificationName: 'High' },
        ],
      },
      {
        accountClassificationId: 2,
        classificationCode: 'SECTOR',
        classificationName: 'Sector',
        subClassifications: [
          { accountSubClassificationId: 3, subClassificationCode: 'TRADE', subClassificationName: 'Trade' },
          {
            accountSubClassificationId: 4,
            subClassificationCode: 'AGRIC',
            subClassificationName: 'Agriculture',
          },
        ],
      },
    ],
    accounts: [
      account(201, '1000000000001', 'Akosua Darko', savings, [{ ...AKOSUA, roleCode: 'PRIMARY' }]),
      account(202, '1000000000002', 'Akosua Darko', savings, [{ ...AKOSUA, roleCode: 'PRIMARY' }], {
        dateOpened: '2026-09-20',
        createdOn: '2026-09-20T10:00:00Z',
        isDormant: true,
        status: 'DORMANT',
      }),
      account(203, '2000000000003', 'Akosua Darko', current, [{ ...AKOSUA, roleCode: 'PRIMARY' }], {
        dateOpened: '2026-10-14',
        createdOn: '2026-10-14T09:30:00Z',
        status: 'PENDING_SUPERVISION',
        supervisionState: 'PENDING',
        supervisedByUserId: null,
        supervisedOn: null,
      }),
    ],
  };
}

function load(): AccountState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as AccountState;
    }
  } catch {
    // Fresh state below.
  }
  return seed();
}

let state = load();

function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

/** Test hook: back to the seeded accounts. */
export function resetAccounts(): void {
  state = seed();
  save();
}

/** API 6.10: the derived status, first match in this order. */
function status(view: AccountView): string {
  return view.supervisionState === 'PENDING'
    ? 'PENDING_SUPERVISION'
    : view.closedOn
      ? 'CLOSED'
      : view.condition.isFreezed
        ? 'FROZEN'
        : view.isDormant
          ? 'DORMANT'
          : 'ACTIVE';
}

function refresh(item: MockAccount): void {
  const balance = item.view.balance;
  balance.availableBalance =
    balance.clearBalance - balance.freezedAmount - balance.unsupervisedDebit + balance.overdrawLimit;
  balance.totalBalance = balance.clearBalance + balance.unsupervisedCredit - balance.unsupervisedDebit;
  item.view.status = status(item.view);
}

function findAccount(id: unknown): MockAccount | undefined {
  return state.accounts.find((item) => item.view.accountId === Number(id));
}

function listRow(item: MockAccount): AccountListRow {
  const view = item.view;
  const primary = view.holders.find((holder) => holder.roleCode === 'PRIMARY');
  return {
    accountId: view.accountId,
    accountNumber: view.accountNumber,
    accountName: view.accountName,
    branchCode: view.branchCode,
    productCode: view.productCode,
    productName: view.productName,
    primaryHolderNumber: primary?.partyNumber ?? null,
    primaryHolderName: primary?.displayName ?? null,
    status: view.status,
    dateOpened: view.dateOpened,
    createdOn: view.createdOn,
  };
}

/** The customer overview's "Accounts held" (API A5-08). */
export function accountsHeldBy(partyId: number): PartyAccountRow[] {
  return state.accounts.flatMap((item) =>
    item.view.holders
      .filter((holder) => holder.partyId === partyId)
      .map((holder) => ({
        accountId: item.view.accountId,
        accountNumber: item.view.accountNumber,
        accountName: item.view.accountName,
        productName: item.view.productName,
        roleCode: holder.roleCode,
        status: item.view.status,
      })),
  );
}

function page<T>(rows: T[], pageNumber: number, pageSize: number) {
  const current = Math.max(1, pageNumber);
  const size = Math.min(100, Math.max(1, pageSize));
  return {
    items: rows.slice((current - 1) * size, current * size),
    page: current,
    pageSize: size,
    totalCount: rows.length,
  };
}

function search(term: string, branchId: number | null, productId: number | null, wanted: string | null) {
  const lower = term.toLowerCase();
  return state.accounts
    .filter(
      (item) =>
        (!term ||
          item.view.accountNumber.startsWith(term) ||
          item.view.holders.some(
            (holder) =>
              holder.partyNumber.startsWith(term) || holder.displayName.toLowerCase().startsWith(lower),
          )) &&
        (!branchId || item.view.branchId === branchId) &&
        (!productId || item.view.productId === productId) &&
        (!wanted || item.view.status === wanted.toUpperCase()),
    )
    .sort((a, b) =>
      term
        ? a.view.accountNumber.localeCompare(b.view.accountNumber)
        : b.view.createdOn.localeCompare(a.view.createdOn),
    )
    .map(listRow);
}

/** Problem for a change to an account: closed, or (when it must be approved) still waiting. */
function blocked(item: MockAccount, requireApproved: boolean) {
  if (item.view.closedOn) {
    return problem(409, 'account.closed');
  }
  return requireApproved && item.view.supervisionState === 'PENDING'
    ? problem(409, 'supervision.pending')
    : null;
}

function ready(partyId: number): {
  ok: boolean;
  signed: boolean;
  number: string;
  type: string;
  name: string;
} {
  const party = find(partyId);
  const detail = party?.detail;
  return {
    ok: !!detail && detail.supervisionState !== 'PENDING' && detail.effectiveKycStatusCode === 'VERIFIED',
    signed: party?.hasSignature ?? false,
    number: detail?.partyNumber ?? String(partyId),
    type: detail?.partyTypeCode ?? 'INDIVIDUAL',
    name: detail?.displayName ?? '',
  };
}

function open(body: OpenAccountRequest, who: number | null) {
  const errors: Record<string, string[]> = {};
  const item = state.products.find((row) => row.productId === body.productId);
  if (!item) {
    errors['productId'] = ['Choose a product.'];
  }
  const holders = (body.holders ?? []).map((holder) => ({
    partyId: holder.partyId ?? 0,
    role: HOLDER_ROLES.find((role) => role.id === holder.accountHolderRoleId)?.code ?? '',
  }));
  const primaries = holders.filter((holder) => holder.role === 'PRIMARY');
  if (primaries.length !== 1) {
    errors['holders'] = ['Choose exactly one primary holder.'];
  }
  if (Object.keys(errors).length > 0) {
    return validation(errors);
  }
  if (
    !item!.isActive ||
    item!.isFreezed ||
    item!.supervisionState === 'PENDING' ||
    !DIRECT_TYPES.includes(item!.productTypeCode)
  ) {
    return problem(409, 'account.product-not-openable');
  }
  const primary = ready(primaries[0].partyId);
  const joints = holders.filter((holder) => holder.role === 'JOINT');
  const signatories = holders.filter((holder) => holder.role === 'SIGNATORY');
  const mode = OPERATING_MODES.find((row) => row.id === body.operatingModeId)?.code ?? null;
  const signing = mode === 'EITHER_TO_SIGN' || mode === 'ALL_TO_SIGN';
  if (primary.type === 'INDIVIDUAL' && joints.length === 0) {
    if (mode && mode !== 'SINGLE') {
      return validation({ operatingModeId: ['An account with one holder uses the single operating mode.'] });
    }
  } else if (!signing) {
    return validation({ operatingModeId: ['Choose either to sign or all to sign.'] });
  }
  if (primary.type !== 'INDIVIDUAL' && signatories.length === 0) {
    return validation({
      holders: [
        primary.type === 'GROUP'
          ? 'A group account needs at least one signatory.'
          : 'A business account needs at least one signatory.',
      ],
    });
  }
  const notReady = holders.map((holder) => ready(holder.partyId)).filter((holder) => !holder.ok);
  if (notReady.length > 0) {
    return problem(409, 'account.holder-not-ready', {
      partyNumbers: notReady.map((holder) => holder.number),
    });
  }
  const signers = [...(primary.type === 'INDIVIDUAL' ? primaries : []), ...joints, ...signatories].map(
    (holder) => ready(holder.partyId),
  );
  const unsigned = signers.filter((holder) => !holder.signed);
  if (unsigned.length > 0) {
    return problem(409, 'account.signature-missing', {
      partyNumbers: unsigned.map((holder) => holder.number),
    });
  }

  const accountId = state.next++;
  const number = `${item!.accountPrefix}${String(++state.sequence).padStart(13 - item!.accountPrefix.length, '0')}`;
  const defaultName =
    primary.type === 'INDIVIDUAL' && joints.length > 0
      ? [primary, ...joints.map((holder) => ready(holder.partyId))].map((holder) => holder.name).join(' & ')
      : primary.name;
  const created = account(
    accountId,
    number,
    body.accountName?.trim() || defaultName,
    item!,
    holders.map((holder) => {
      const facts = ready(holder.partyId);
      return {
        partyId: holder.partyId,
        partyNumber: facts.number,
        displayName: facts.name,
        partyTypeCode: facts.type,
        roleCode: holder.role,
      };
    }),
    {
      dateOpened: '2026-10-14',
      createdOn: new Date().toISOString(),
      operatingModeCode: mode ?? 'SINGLE',
      status: 'PENDING_SUPERVISION',
      supervisionState: 'PENDING',
      supervisedByUserId: null,
      supervisedOn: null,
      openedByUserId: who,
    },
  );
  state.accounts.push(created);
  save();
  return HttpResponse.json(
    {
      accountId,
      accountNumber: number,
      accountName: created.view.accountName,
      status: 'PENDING_SUPERVISION',
    },
    { status: 201 },
  );
}

export function accountHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  const lookup = (path: string, rows: { id: number; code: string; name: string }[]) =>
    http.get(`${base}/lookups/${path}`, ({ request }) => signedIn(request) ?? HttpResponse.json(rows));

  return [
    lookup('operating-modes', OPERATING_MODES),
    lookup('account-holder-roles', HOLDER_ROLES),
    lookup('close-reasons', CLOSE_REASONS),

    http.get(`${base}/products`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const openable = params.get('openable') === 'true';
      const rows = state.products.filter(
        (row) =>
          !openable ||
          (row.isActive &&
            !row.isFreezed &&
            row.supervisionState !== 'PENDING' &&
            DIRECT_TYPES.includes(row.productTypeCode)),
      );
      return HttpResponse.json(
        page(rows, Number(params.get('page') ?? 1), Number(params.get('pageSize') ?? 25)),
      );
    }),

    http.get(`${base}/accounts`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const rows = search(
        '',
        params.get('branchId') ? Number(params.get('branchId')) : null,
        params.get('productId') ? Number(params.get('productId')) : null,
        params.get('status'),
      );
      return HttpResponse.json(
        page(rows, Number(params.get('page') ?? 1), Number(params.get('pageSize') ?? 25)),
      );
    }),

    http.post(`${base}/accounts/search`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as {
        q?: string | null;
        branchId?: number | null;
        productId?: number | null;
        status?: string | null;
        page?: number | null;
        pageSize?: number | null;
      };
      const rows = search(
        body.q?.trim() ?? '',
        body.branchId ?? null,
        body.productId ?? null,
        body.status ?? null,
      );
      return HttpResponse.json(page(rows, body.page ?? 1, body.pageSize ?? 25));
    }),

    http.post(
      `${base}/accounts`,
      async ({ request }) =>
        signedIn(request) ?? open((await request.json()) as OpenAccountRequest, who(request)),
    ),

    http.get(`${base}/accounts/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      return item ? HttpResponse.json(item.view) : problem(404, 'not-found');
    }),

    http.get(`${base}/accounts/:id/balance`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      return item ? HttpResponse.json(item.view.balance) : problem(404, 'not-found');
    }),

    http.post(`${base}/accounts/:id/supervise`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      if (item.view.supervisionState !== 'PENDING') {
        return problem(409, 'supervision.not-pending');
      }
      if (item.view.openedByUserId === who(request)) {
        return problem(409, 'supervision.self-approval');
      }
      Object.assign(item.view, {
        supervisionState: 'APPROVED',
        supervisedByUserId: who(request),
        supervisedOn: new Date().toISOString(),
      });
      refresh(item);
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/accounts/:id/reject`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      if (item.view.supervisionState !== 'PENDING') {
        return problem(409, 'supervision.not-pending');
      }
      state.accounts = state.accounts.filter((row) => row !== item);
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/accounts/:id/freeze-actions`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const rows: FreezeActionView[] = [...item.holds].reverse().map((hold) => ({
        freezeReleaseId: hold.id,
        action: hold.action,
        amount: hold.amount,
        remarks: hold.remarks,
        createdByUserId: hold.createdByUserId,
        createdOn: hold.createdOn,
      }));
      return HttpResponse.json(rows);
    }),

    http.post(`${base}/accounts/:id/freeze-actions`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, true);
      if (stop) {
        return stop;
      }
      const body = (await request.json()) as {
        action?: string;
        amount?: number | null;
        remarks?: string | null;
      };
      const action = body.action ?? '';
      const balance = item.view.balance;
      const amount = body.amount ?? null;
      if (action === 'HOLD_AMOUNT' || action === 'RELEASE_AMOUNT') {
        if (!amount || amount <= 0) {
          return validation({ amount: ['Enter an amount greater than zero.'] });
        }
        if (action === 'RELEASE_AMOUNT' && amount > balance.freezedAmount) {
          return validation({ amount: ['You cannot release more than is held.'] });
        }
        balance.freezedAmount += action === 'HOLD_AMOUNT' ? amount : -amount;
      } else if (action === 'FREEZE_ACCOUNT') {
        if (item.view.condition.isFreezed) {
          return problem(409, 'account.already-frozen');
        }
        item.view.condition.isFreezed = true;
      } else if (action === 'UNFREEZE_ACCOUNT') {
        if (!item.view.condition.isFreezed) {
          return problem(409, 'account.not-frozen');
        }
        item.view.condition.isFreezed = false;
      } else {
        return validation({ action: ['Choose hold, release, freeze or unfreeze.'] });
      }
      const id = item.holds.length + 1;
      item.holds.push({
        id,
        action,
        amount,
        remarks: body.remarks ?? null,
        createdByUserId: who(request),
        createdOn: new Date().toISOString(),
      });
      refresh(item);
      save();
      return HttpResponse.json(
        { freezeReleaseId: id, isFreezed: item.view.condition.isFreezed, balance },
        { status: 201 },
      );
    }),

    http.get(`${base}/accounts/:id/close-check`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const balance = item.view.balance;
      const checks = [
        { code: 'ZERO_BALANCE', passed: balance.clearBalance === 0 },
        { code: 'NO_HOLDS', passed: balance.freezedAmount === 0 },
        {
          code: 'NO_PENDING_ITEMS',
          passed: balance.unsupervisedCredit === 0 && balance.unsupervisedDebit === 0,
        },
      ];
      return HttpResponse.json({ canClose: checks.every((check) => check.passed), checks });
    }),

    http.post(`${base}/accounts/:id/close`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, true);
      if (stop) {
        return stop;
      }
      const body = (await request.json()) as { closeReasonId?: number | null };
      const reason = CLOSE_REASONS.find((row) => row.id === body.closeReasonId);
      if (!reason) {
        return validation({ closeReasonId: ['Choose why the account is closing.'] });
      }
      const balance = item.view.balance;
      const failed = [
        balance.clearBalance !== 0 ? 'ZERO_BALANCE' : null,
        balance.freezedAmount !== 0 ? 'NO_HOLDS' : null,
        balance.unsupervisedCredit !== 0 || balance.unsupervisedDebit !== 0 ? 'NO_PENDING_ITEMS' : null,
      ].filter((code) => code !== null);
      if (failed.length > 0) {
        return problem(409, 'account.close-blocked', { failedChecks: failed });
      }
      Object.assign(item.view, { closedOn: new Date().toISOString(), closeReasonCode: reason.code });
      refresh(item);
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    ...(['mark', 'reactivate'] as const).map((step) =>
      http.post(`${base}/accounts/:id/dormancy/${step}`, ({ request, params }) => {
        const denied = signedIn(request);
        if (denied) {
          return denied;
        }
        const item = findAccount(params['id']);
        if (!item) {
          return problem(404, 'not-found');
        }
        const stop = blocked(item, true);
        if (stop) {
          return stop;
        }
        const dormant = step === 'mark';
        if (item.view.isDormant === dormant) {
          return problem(409, dormant ? 'account.already-dormant' : 'account.not-dormant');
        }
        item.view.isDormant = dormant;
        refresh(item);
        save();
        return new HttpResponse(null, { status: 204 });
      }),
    ),

    http.get(
      `${base}/account-classifications`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(state.catalog),
    ),

    http.get(`${base}/accounts/:id/classifications`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      return item ? HttpResponse.json(item.classifications) : problem(404, 'not-found');
    }),

    http.post(`${base}/accounts/:id/classifications`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, false);
      if (stop) {
        return stop;
      }
      const body = (await request.json()) as {
        accountClassificationId?: number | null;
        accountSubClassificationId?: number | null;
      };
      const option = state.catalog.find(
        (row) => row.accountClassificationId === body.accountClassificationId,
      );
      if (!option) {
        return validation({ accountClassificationId: ['Choose a classification from the list.'] });
      }
      const sub = body.accountSubClassificationId
        ? option.subClassifications.find(
            (row) => row.accountSubClassificationId === body.accountSubClassificationId,
          )
        : null;
      if (body.accountSubClassificationId && !sub) {
        return validation({
          accountSubClassificationId: ['Choose a sub-classification of the chosen classification.'],
        });
      }
      if (
        item.classifications.some((row) => row.accountClassificationId === option.accountClassificationId)
      ) {
        return problem(409, 'account.classification-exists');
      }
      const id = Math.max(0, ...item.classifications.map((row) => row.assignmentId)) + 1;
      item.classifications.push({
        assignmentId: id,
        accountClassificationId: option.accountClassificationId,
        classificationCode: option.classificationCode,
        classificationName: option.classificationName,
        accountSubClassificationId: sub?.accountSubClassificationId ?? null,
        subClassificationCode: sub?.subClassificationCode ?? null,
        subClassificationName: sub?.subClassificationName ?? null,
      });
      save();
      return HttpResponse.json({ id }, { status: 201 });
    }),

    http.delete(`${base}/accounts/:id/classifications/:assignmentId`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, false);
      if (stop) {
        return stop;
      }
      item.classifications = item.classifications.filter(
        (row) => row.assignmentId !== Number(params['assignmentId']),
      );
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/accounts/:id/reminders`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, false);
      if (stop) {
        return stop;
      }
      const body = (await request.json()) as { reminderText?: string | null };
      const text = body.reminderText?.trim() ?? '';
      if (text.length === 0 || text.length > 200) {
        return validation({ reminderText: ['Enter a reminder of up to 200 characters.'] });
      }
      const id = Math.max(0, ...item.view.reminders.map((row) => row.accountReminderId)) + 1;
      item.view.reminders.push({
        accountReminderId: id,
        reminderText: text,
        createdOn: new Date().toISOString(),
      });
      save();
      return HttpResponse.json({ id }, { status: 201 });
    }),

    http.delete(`${base}/accounts/:id/reminders/:reminderId`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findAccount(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const stop = blocked(item, false);
      if (stop) {
        return stop;
      }
      item.view.reminders = item.view.reminders.filter(
        (row) => row.accountReminderId !== Number(params['reminderId']),
      );
      save();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
