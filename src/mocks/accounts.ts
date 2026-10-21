import { http, HttpResponse } from 'msw';
import type {
  AccountBalanceView,
  AccountClassificationView,
  AccountListRow,
  AccountView,
  ClassificationOption,
  CurrencyView,
  FreezeActionView,
  OpenAccountRequest,
  PartyAccountRow,
  ProductChange,
  ProductRateRequest,
  ProductRateView,
  ProductRequest,
  ProductView,
} from '../app/core/api/api-types';
import { todayIso } from '../app/core/formats/dates';
import { addDays, earliestClose, overlappingRate, rateClosedBy } from '../app/features/products/rate-rules';
import { ledgerById } from './approvals';
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

export const PRODUCT_TYPES = [
  { id: 1, code: 'SAVINGS', name: 'Savings', isActive: true, isCoded: true },
  { id: 2, code: 'CURRENT', name: 'Current', isActive: true, isCoded: true },
  { id: 3, code: 'FIXED_DEPOSIT', name: 'Fixed deposit', isActive: true, isCoded: true },
  { id: 4, code: 'LOAN', name: 'Loan', isActive: true, isCoded: true },
];

export const RATE_TYPES = [
  { id: 1, code: 'CREDIT', name: 'Credit', isActive: true, isCoded: true },
  { id: 2, code: 'DEBIT', name: 'Debit', isActive: true, isCoded: true },
];

export const CURRENCIES: CurrencyView[] = [
  { currencyId: 1, currencyCode: 'GHS', currencyName: 'Ghana cedi', exchangeRate: 1, isLocalCurrency: true },
  {
    currencyId: 2,
    currencyCode: 'USD',
    currencyName: 'US dollar',
    exchangeRate: 15.5,
    isLocalCurrency: false,
  },
];

/** A stored rate; status and isStarted are worked out from today's date when read. */
type MockRate = Omit<ProductRateView, 'status' | 'isStarted'> & { productId: number };

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
  rates: MockRate[];
  nextRate: number;
  nextProduct: number;
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
    ledgerControlAccountId: 504,
    ledgerControlAccountCode: '2010001',
    ledgerControlAccountName: 'Customer savings control',
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
    debitInterestRate: 24,
    ledgerControlAccountId: 505,
    ledgerControlAccountCode: '1300001',
    ledgerControlAccountName: 'Loans to customers',
  });
  const frozen = product(4, 'SAV02', 'Junior savings', 'SAVINGS', '11', { isFreezed: true });
  const deposit = product(5, 'FD01', 'Fixed deposit 12 months', 'FIXED_DEPOSIT', '40', {
    supervisionState: 'PENDING',
    createdByUserId: 99,
    createdOn: '2026-10-13T11:00:00Z',
    supervisedByUserId: null,
    supervisedOn: null,
    creditInterestRate: 18,
    minimumBalance: 1000,
  });
  const today = todayIso();
  const rate = (
    id: number,
    productId: number,
    type: string,
    interestRate: number,
    from: string,
    to: string | null,
  ) => ({
    productInterestRateId: id,
    productId,
    rateTypeId: type === 'CREDIT' ? 1 : 2,
    rateTypeCode: type,
    minimumAmount: null,
    maximumAmount: null,
    interestRate,
    effectiveFrom: from,
    effectiveTo: to,
  });
  return {
    next: 205,
    sequence: 10,
    nextProduct: 6,
    nextRate: 10,
    products: [savings, current, loan, frozen, deposit],
    rates: [
      rate(1, 1, 'CREDIT', 2.5, addDays(today, -120), addDays(today, -31)),
      rate(2, 1, 'CREDIT', 3, addDays(today, -30), null),
      rate(3, 3, 'DEBIT', 24, addDays(today, -60), null),
    ],
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
state.rates ??= seed().rates;
state.nextRate ??= 10;
state.nextProduct ??= 6;

function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

/** True once any product exists (the API then refuses to move the local currency). */
export function productsExist(): boolean {
  return state.products.length > 0;
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

function findProduct(id: unknown): ProductView | undefined {
  return state.products.find((row) => row.productId === Number(id));
}

function findRate(productId: unknown, rateId: unknown): MockRate | undefined {
  return state.rates.find(
    (row) => row.productId === Number(productId) && row.productInterestRateId === Number(rateId),
  );
}

function rateView(rate: MockRate): ProductRateView {
  const today = todayIso();
  return {
    productInterestRateId: rate.productInterestRateId,
    rateTypeId: rate.rateTypeId,
    rateTypeCode: rate.rateTypeCode,
    minimumAmount: rate.minimumAmount,
    maximumAmount: rate.maximumAmount,
    interestRate: rate.interestRate,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    isStarted: rate.effectiveFrom <= today,
    status:
      rate.effectiveFrom > today
        ? 'SCHEDULED'
        : rate.effectiveTo !== null && rate.effectiveTo < today
          ? 'ENDED'
          : 'CURRENT',
  };
}

function ratesOf(productId: number): ProductRateView[] {
  return state.rates
    .filter((row) => row.productId === productId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .map(rateView);
}

function control(ledgerAccountId: number | null): Partial<ProductView> {
  const ledger = ledgerById(ledgerAccountId);
  return {
    ledgerControlAccountId: ledger?.ledgerAccountId ?? null,
    ledgerControlAccountCode: ledger?.ledgerAccountCode ?? null,
    ledgerControlAccountName: ledger?.accountName ?? null,
  };
}

function changeOf(item: ProductView): ProductChange {
  return {
    productName: item.productName,
    ledgerControlAccountId: item.ledgerControlAccountId,
    creditInterestRate: item.creditInterestRate,
    debitInterestRate: item.debitInterestRate,
    minimumBalance: item.minimumBalance,
    accountsPerCustomer: item.accountsPerCustomer,
    isChequeBookAllowed: item.isChequeBookAllowed,
    isFreezed: item.isFreezed,
    isActive: item.isActive,
  };
}

function apply(item: ProductView, change: ProductChange): Partial<ProductView> {
  return { ...change, ...control(change.ledgerControlAccountId ?? item.ledgerControlAccountId) };
}

function productErrors(body: ProductRequest, creating: boolean): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (creating && !/^[A-Za-z0-9-]{1,10}$/.test(body.productCode?.trim() ?? '')) {
    errors['productCode'] = ['Use 1 to 10 capital letters, digits or dashes.'];
  }
  if (!body.productName?.trim()) {
    errors['productName'] = ['Enter a name of up to 100 characters.'];
  }
  if (!PRODUCT_TYPES.some((row) => row.id === body.productTypeId)) {
    errors['productTypeId'] = ['Choose a product type from the list.'];
  }
  if (!/^\d{1,6}$/.test(body.accountPrefix?.trim() ?? '')) {
    errors['accountPrefix'] = ['Use 1 to 6 digits.'];
  }
  if (!CURRENCIES.some((row) => row.currencyId === body.currencyId)) {
    errors['currencyId'] = ['Choose a currency from the list.'];
  }
  return Object.keys(errors).length > 0 ? errors : null;
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
              holder.partyNumber.startsWith(term) ||
              holder.displayName.toLowerCase().startsWith(lower) ||
              holder.displayName
                .toLowerCase()
                .split(' ')
                .some((word) => word.startsWith(lower)),
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
  return [
    http.get(`${base}/products`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const openable = params.get('openable') === 'true';
      const term = (params.get('search') ?? '').trim().toLowerCase();
      const wanted = params.get('supervisionState');
      const type = Number(params.get('productTypeId') ?? 0);
      const rows = state.products.filter(
        (row) =>
          (!openable ||
            (row.isActive &&
              !row.isFreezed &&
              row.supervisionState !== 'PENDING' &&
              DIRECT_TYPES.includes(row.productTypeCode))) &&
          (!term ||
            row.productCode.toLowerCase().includes(term) ||
            row.productName.toLowerCase().includes(term)) &&
          (!wanted || row.supervisionState === wanted) &&
          (!type || row.productTypeId === type),
      );
      return HttpResponse.json(
        page(rows, Number(params.get('page') ?? 1), Number(params.get('pageSize') ?? 25)),
      );
    }),

    http.get(`${base}/products/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      return item ? HttpResponse.json(item) : problem(404, 'not-found');
    }),

    http.post(`${base}/products`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as ProductRequest;
      const errors = productErrors(body, true);
      if (errors) {
        return validation(errors);
      }
      const code = body.productCode!.trim().toUpperCase();
      if (state.products.some((row) => row.productCode === code)) {
        return problem(409, 'product.code-taken');
      }
      const type = PRODUCT_TYPES.find((row) => row.id === body.productTypeId)!;
      const currency = CURRENCIES.find((row) => row.currencyId === body.currencyId)!;
      const id = state.nextProduct++;
      state.products.push(
        product(id, code, body.productName!.trim(), type.code, body.accountPrefix!.trim(), {
          currencyId: currency.currencyId,
          currencyCode: currency.currencyCode,
          ...control(body.ledgerControlAccountId ?? null),
          creditInterestRate: body.creditInterestRate ?? null,
          debitInterestRate: body.debitInterestRate ?? null,
          minimumBalance: body.minimumBalance ?? null,
          accountsPerCustomer: body.accountsPerCustomer ?? null,
          isChequeBookAllowed: body.isChequeBookAllowed ?? false,
          isFreezed: body.isFreezed ?? false,
          isActive: body.isActive ?? true,
          supervisionState: 'PENDING',
          createdByUserId: who(request),
          createdOn: new Date().toISOString(),
          supervisedByUserId: null,
          supervisedOn: null,
        }),
      );
      save();
      return HttpResponse.json({ id }, { status: 201 });
    }),

    http.put(`${base}/products/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as ProductRequest;
      if (body.productCode && body.productCode.trim().toUpperCase() !== item.productCode) {
        return problem(400, 'reference.code-immutable');
      }
      const errors = productErrors(body, false);
      if (errors) {
        return validation(errors);
      }
      const proposed: ProductChange = {
        productName: body.productName!.trim(),
        ledgerControlAccountId: body.ledgerControlAccountId ?? null,
        creditInterestRate: body.creditInterestRate ?? null,
        debitInterestRate: body.debitInterestRate ?? null,
        minimumBalance: body.minimumBalance ?? null,
        accountsPerCustomer: body.accountsPerCustomer ?? null,
        isChequeBookAllowed: body.isChequeBookAllowed ?? false,
        isFreezed: body.isFreezed ?? false,
        isActive: body.isActive ?? true,
      };
      if (item.supervisionState === 'PENDING') {
        const type = PRODUCT_TYPES.find((row) => row.id === body.productTypeId) ?? PRODUCT_TYPES[0];
        const currency = CURRENCIES.find((row) => row.currencyId === body.currencyId) ?? CURRENCIES[0];
        Object.assign(item, apply(item, proposed), {
          productTypeId: type.id,
          productTypeCode: type.code,
          accountPrefix: body.accountPrefix!.trim(),
          currencyId: currency.currencyId,
          currencyCode: currency.currencyCode,
          modifiedByUserId: who(request),
        });
        save();
        return new HttpResponse(null, { status: 204 });
      }
      if (
        body.productTypeId !== item.productTypeId ||
        body.accountPrefix?.trim() !== item.accountPrefix ||
        body.currencyId !== item.currencyId
      ) {
        return problem(409, 'product.field-locked');
      }
      const current = changeOf(item);
      const differs = (Object.keys(proposed) as (keyof ProductChange)[]).filter(
        (key) => proposed[key] !== current[key],
      );
      if (differs.length === 0) {
        return new HttpResponse(null, { status: 204 });
      }
      if (differs.every((key) => key === 'isFreezed' || key === 'isActive')) {
        Object.assign(item, {
          isFreezed: proposed.isFreezed,
          isActive: proposed.isActive,
          modifiedByUserId: who(request),
        });
        save();
        return new HttpResponse(null, { status: 204 });
      }
      if (item.pendingChange) {
        return problem(409, 'change.pending-exists');
      }
      const changeRequestId = 800 + item.productId;
      item.pendingChange = {
        changeRequestId,
        proposed,
        requestedByUserId: who(request) ?? 0,
        requestedOn: new Date().toISOString(),
      };
      save();
      return HttpResponse.json({ changeRequestId }, { status: 202 });
    }),

    http.post(`${base}/products/:id/supervise`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const me = who(request);
      if (item.pendingChange) {
        if (item.pendingChange.requestedByUserId === me) {
          return problem(409, 'supervision.self-approval');
        }
        Object.assign(item, apply(item, item.pendingChange.proposed), {
          pendingChange: null,
          supervisedByUserId: me,
          supervisedOn: new Date().toISOString(),
        });
      } else if (item.supervisionState === 'PENDING') {
        if (item.createdByUserId === me || item.modifiedByUserId === me) {
          return problem(409, 'supervision.self-approval');
        }
        Object.assign(item, {
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

    http.post(`${base}/products/:id/reject`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as { reason?: string };
      if (!body.reason?.trim()) {
        return validation({ reason: ['Enter the reason.'] });
      }
      if (item.pendingChange) {
        item.pendingChange = null;
      } else if (item.supervisionState === 'PENDING') {
        state.products = state.products.filter((row) => row !== item);
        state.rates = state.rates.filter((row) => row.productId !== item.productId);
      } else {
        return problem(409, 'supervision.not-pending');
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/products/:id/interest-rates`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      return item ? HttpResponse.json(ratesOf(item.productId)) : problem(404, 'not-found');
    }),

    http.post(`${base}/products/:id/interest-rates`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const item = findProduct(params['id']);
      if (!item) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as ProductRateRequest;
      const today = todayIso();
      const errors: Record<string, string[]> = {};
      const type = RATE_TYPES.find((row) => row.id === body.rateTypeId);
      if (!type) {
        errors['rateTypeId'] = ['Choose a rate type from the list.'];
      }
      if (
        body.interestRate === null ||
        body.interestRate === undefined ||
        body.interestRate < 0 ||
        body.interestRate > 100
      ) {
        errors['interestRate'] = ['Enter a rate from 0 to 100.'];
      }
      if (!body.effectiveFrom) {
        errors['effectiveFrom'] = ['Enter the start date.'];
      } else if (body.effectiveFrom < today) {
        errors['effectiveFrom'] = ['The start date cannot be in the past.'];
      }
      if (body.effectiveTo && body.effectiveFrom && body.effectiveTo < body.effectiveFrom) {
        errors['effectiveTo'] = ['The end date must be on or after the start date.'];
      }
      if (
        body.minimumAmount !== null &&
        body.minimumAmount !== undefined &&
        body.maximumAmount !== null &&
        body.maximumAmount !== undefined &&
        body.maximumAmount < body.minimumAmount
      ) {
        errors['maximumAmount'] = ['The highest amount must be at least the lowest amount.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      const rows = ratesOf(item.productId);
      const draft = {
        rateTypeCode: type!.code,
        minimumAmount: body.minimumAmount ?? null,
        maximumAmount: body.maximumAmount ?? null,
        from: body.effectiveFrom!,
        to: body.effectiveTo ?? null,
      };
      if (overlappingRate(rows, draft)) {
        return problem(409, 'product.rate-overlap');
      }
      const closed = rateClosedBy(rows, draft);
      if (closed) {
        const stored = state.rates.find(
          (row) => row.productInterestRateId === closed.rate.productInterestRateId,
        );
        if (stored) {
          stored.effectiveTo = closed.closesOn;
        }
      }
      const id = state.nextRate++;
      state.rates.push({
        productInterestRateId: id,
        productId: item.productId,
        rateTypeId: type!.id,
        rateTypeCode: type!.code,
        minimumAmount: draft.minimumAmount,
        maximumAmount: draft.maximumAmount,
        interestRate: body.interestRate!,
        effectiveFrom: draft.from,
        effectiveTo: draft.to,
      });
      save();
      return HttpResponse.json(
        {
          productInterestRateId: id,
          closedRateId: closed?.rate.productInterestRateId ?? null,
          closedOn: closed?.closesOn ?? null,
        },
        { status: 201 },
      );
    }),

    http.post(`${base}/products/:id/interest-rates/:rateId/close`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const rate = findRate(params['id'], params['rateId']);
      if (!rate) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as { effectiveTo?: string | null };
      const view = rateView(rate);
      const earliest = earliestClose(view, todayIso());
      if (!body.effectiveTo || body.effectiveTo < earliest) {
        return validation({ effectiveTo: [`Choose ${earliest} or later.`] });
      }
      if (rate.effectiveTo !== null && rate.effectiveTo < todayIso()) {
        return problem(409, 'product.rate-started');
      }
      rate.effectiveTo = body.effectiveTo;
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.delete(`${base}/products/:id/interest-rates/:rateId`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const rate = findRate(params['id'], params['rateId']);
      if (!rate) {
        return problem(404, 'not-found');
      }
      if (rateView(rate).isStarted) {
        return problem(409, 'product.rate-started');
      }
      state.rates = state.rates.filter((row) => row !== rate);
      save();
      return new HttpResponse(null, { status: 204 });
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
