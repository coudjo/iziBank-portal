import { http, HttpResponse } from 'msw';
import type { BranchView, BusinessDayView, HolidayView, LookupRow } from '../app/core/api/api-types';
import {
  CLOSE_REASONS,
  CURRENCIES,
  HOLDER_ROLES,
  OPERATING_MODES,
  PRODUCT_TYPES,
  RATE_TYPES,
  productsExist,
} from './accounts';
import { LEDGER_TYPES } from './approvals';
import { BRANCHES, MOCK_USERS } from './data';
import {
  BUSINESS_CATEGORIES,
  CREDIT_OFFICERS,
  GENDERS,
  ID_TYPES,
  MEMBER_ROLES,
  problem,
  validation,
} from './parties';

/**
 * Mock reference data (API A3-01, A3-02, A2-03, A4-11): institution profile, branches, currencies, holidays,
 * business days, every lookup list, and credit officers. Shared arrays from the other mocks are changed in place,
 * so a lookup edited here shows up wherever that list is used. Never real data.
 */
const KEY = 'ib-mock-reference';

const row = (id: number, code: string, name: string): LookupRow => ({
  id,
  code,
  name,
  isActive: true,
  isCoded: true,
});

/** Every lookup list the API exposes (LookupAdmin.Sets), in the same order. */
const LOOKUPS: Record<string, { table: string; rows: LookupRow[] }> = {
  'regulatory-categories': {
    table: 'RegulatoryCategoryType',
    rows: [
      row(1, 'MICROFINANCE_BANK', 'Microfinance bank'),
      row(2, 'SAVINGS_AND_LOANS', 'Savings and loans'),
      row(3, 'COMMUNITY_BANK', 'Rural and community bank'),
      row(4, 'CREDIT_UNION', 'Credit union'),
      row(5, 'LAST_MILE_PROVIDER', 'Last mile provider'),
    ],
  },
  'business-day-statuses': {
    table: 'BusinessDayStatusType',
    rows: [
      row(1, 'OPEN', 'Open'),
      row(2, 'CLOSED', 'Closed'),
      row(3, 'EOD_IN_PROGRESS', 'End of day running'),
    ],
  },
  'logout-reasons': {
    table: 'LogoutReasonType',
    rows: [
      row(1, 'USER_INITIATED', 'Signed out'),
      row(2, 'IDLE_TIMEOUT', 'Idle timeout'),
      row(3, 'MAX_SESSION_EXCEEDED', 'Maximum session length'),
      row(4, 'SUPERSEDED_BY_NEW_LOGIN', 'Signed in elsewhere'),
      row(5, 'FORCED_BY_ADMIN', 'Forced by an administrator'),
      row(6, 'SECRET_KEY_CHANGED', 'Password changed'),
      row(7, 'ACCOUNT_DISABLED', 'Staff member disabled'),
    ],
  },
  'party-types': {
    table: 'PartyType',
    rows: [row(1, 'INDIVIDUAL', 'Individual'), row(2, 'BUSINESS', 'Business'), row(3, 'GROUP', 'Group')],
  },
  'kyc-statuses': {
    table: 'KYCStatusType',
    rows: [
      row(1, 'PENDING', 'Pending'),
      row(2, 'VERIFIED', 'Verified'),
      row(3, 'REJECTED', 'Rejected'),
      row(4, 'EXPIRED', 'Expired'),
    ],
  },
  genders: { table: 'GenderType', rows: GENDERS },
  'identification-document-types': { table: 'IdentificationDocumentType', rows: ID_TYPES },
  'business-categories': { table: 'BusinessCategoryType', rows: BUSINESS_CATEGORIES },
  'group-member-roles': { table: 'GroupMemberRoleType', rows: MEMBER_ROLES },
  'product-types': { table: 'ProductType', rows: PRODUCT_TYPES },
  'rate-types': { table: 'RateType', rows: RATE_TYPES },
  'operating-modes': { table: 'OperatingModeType', rows: OPERATING_MODES },
  'operating-instructions': {
    table: 'OperatingInstructionType',
    rows: [row(1, 'ANY_ONE', 'Any one to sign'), row(2, 'ALL_JOINTLY', 'All jointly')],
  },
  'account-holder-roles': { table: 'AccountHolderRoleType', rows: HOLDER_ROLES },
  'close-reasons': { table: 'CloseReasonType', rows: CLOSE_REASONS },
  'freeze-release-actions': {
    table: 'FreezeReleaseActionType',
    rows: [
      row(1, 'HOLD_AMOUNT', 'Hold amount'),
      row(2, 'RELEASE_AMOUNT', 'Release amount'),
      row(3, 'FREEZE', 'Freeze'),
      row(4, 'UNFREEZE', 'Unfreeze'),
    ],
  },
  'ledger-account-types': { table: 'LedgerAccountType', rows: LEDGER_TYPES },
};

interface Institution {
  institutionName: string;
  licenseNumber: string | null;
  regulatoryCategoryId: number | null;
  incorporationDate: string | null;
  headOfficeAddress: string | null;
}

interface ReferenceState {
  institution: Institution;
  branchExtras: Record<
    number,
    { operatingLicenseNo: string | null; clearingDays: number | null; isActive: boolean }
  >;
  addedBranches: { branchId: number; branchCode: string; branchName: string }[];
  holidays: HolidayView[];
  days: Record<number, BusinessDayView[]>;
  /** Lookup rows added or changed here, replayed onto the shared arrays on load. */
  lookups: Record<string, LookupRow[]>;
  currencies: typeof CURRENCIES;
  officers: typeof CREDIT_OFFICERS;
}

function day(id: number, workingDate: string, status: string): BusinessDayView {
  return {
    businessDayStatusId: id,
    workingDate,
    status,
    startedOn: `${workingDate}T07:30:00Z`,
    endedOn: status === 'CLOSED' ? `${workingDate}T18:10:00Z` : null,
    openedByUserId: 3,
    closedByUserId: status === 'CLOSED' ? 3 : null,
  };
}

function seed(): ReferenceState {
  return {
    institution: {
      institutionName: 'iziBank Savings and Loans',
      licenseNumber: null,
      regulatoryCategoryId: 2,
      incorporationDate: null,
      headOfficeAddress: null,
    },
    branchExtras: {
      1: { operatingLicenseNo: 'BOG-SL-0001', clearingDays: 2, isActive: true },
      2: { operatingLicenseNo: null, clearingDays: 2, isActive: true },
    },
    addedBranches: [],
    holidays: [
      { holidayId: 1, holidayDate: '2026-01-01', remarks: "New Year's Day" },
      { holidayId: 2, holidayDate: '2026-03-06', remarks: 'Independence Day' },
      { holidayId: 3, holidayDate: '2026-05-01', remarks: 'May Day' },
      { holidayId: 4, holidayDate: '2026-07-01', remarks: 'Republic Day' },
      { holidayId: 5, holidayDate: '2026-09-21', remarks: 'Kwame Nkrumah Memorial Day' },
      { holidayId: 6, holidayDate: '2026-12-04', remarks: "Farmers' Day" },
      { holidayId: 7, holidayDate: '2026-12-25', remarks: 'Christmas Day' },
      { holidayId: 8, holidayDate: '2026-12-26', remarks: 'Boxing Day' },
    ],
    days: {
      1: [day(1, '2026-10-12', 'CLOSED'), day(2, '2026-10-13', 'CLOSED'), day(3, '2026-10-14', 'OPEN')],
    },
    lookups: {},
    currencies: CURRENCIES.map((item) => ({ ...item })),
    officers: CREDIT_OFFICERS.map((item) => ({ ...item })),
  };
}

function load(): ReferenceState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as ReferenceState;
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

/** Puts this state into the arrays the other mocks read. */
function sync(): void {
  for (const added of state.addedBranches) {
    if (!BRANCHES.some((branch) => branch.branchId === added.branchId)) {
      BRANCHES.push(added);
    }
  }
  for (const [slug, rows] of Object.entries(state.lookups)) {
    const target = LOOKUPS[slug]?.rows;
    if (target) {
      target.splice(0, target.length, ...rows.map((item) => ({ ...item })));
    }
  }
  CURRENCIES.splice(0, CURRENCIES.length, ...state.currencies.map((item) => ({ ...item })));
  CREDIT_OFFICERS.splice(0, CREDIT_OFFICERS.length, ...state.officers.map((item) => ({ ...item })));
}
sync();

function remember(): void {
  state.currencies = CURRENCIES.map((item) => ({ ...item }));
  state.officers = CREDIT_OFFICERS.map((item) => ({ ...item }));
  save();
}

/** The latest business day of a branch, for `GET /business-day/current`. */
export function latestDay(branchId: number): BusinessDayView | null {
  const days = state.days[branchId] ?? [];
  return days.length > 0 ? days[days.length - 1] : null;
}

/** Test hook: set the latest business day of a branch (null: none). */
export function setLatestDay(branchId: number, workingDate: string | null, status = 'OPEN'): void {
  if (workingDate === null) {
    state.days[branchId] = [];
  } else {
    const days = (state.days[branchId] ?? []).filter((item) => item.workingDate < workingDate);
    days.push(day(nextId(), workingDate, status));
    state.days[branchId] = days;
  }
  save();
}

/** Test hook: back to the seeded reference data. */
export function resetReference(): void {
  state = seed();
  save();
  sync();
}

function nextId(): number {
  return (
    Math.max(
      0,
      ...Object.values(state.days)
        .flat()
        .map((item) => item.businessDayStatusId),
    ) + 1
  );
}

function branchView(branch: { branchId: number; branchCode: string; branchName: string }): BranchView {
  const extra = state.branchExtras[branch.branchId] ?? {
    operatingLicenseNo: null,
    clearingDays: null,
    isActive: true,
  };
  return { ...branch, ...extra };
}

/** API BusinessDayRules: Saturday and Sunday (Calendar:WeekendDays) and defined holidays are not working days. */
function isWorkingDay(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !state.holidays.some((holiday) => holiday.holidayDate === date);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function referenceHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  const branchOf = (request: Request) => Number(request.headers.get('X-Branch-Id') ?? 1);

  return [
    http.get(`${base}/institution-profile`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const profile = state.institution;
      const category = LOOKUPS['regulatory-categories'].rows.find(
        (item) => item.id === profile.regulatoryCategoryId,
      );
      return HttpResponse.json({
        ...profile,
        regulatoryCategoryCode: category?.code ?? null,
        isComplete: !!(
          profile.licenseNumber &&
          profile.regulatoryCategoryId &&
          profile.incorporationDate &&
          profile.headOfficeAddress
        ),
      });
    }),

    http.put(`${base}/institution-profile`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as Institution;
      const errors: Record<string, string[]> = {};
      const name = (body.institutionName ?? '').trim();
      if (!name || name.length > 150) {
        errors['institutionName'] = ['Enter a name of up to 150 characters.'];
      }
      if ((body.licenseNumber ?? '').length > 30) {
        errors['licenseNumber'] = ['Keep the licence number to 30 characters.'];
      }
      if ((body.headOfficeAddress ?? '').length > 300) {
        errors['headOfficeAddress'] = ['Keep the address to 300 characters.'];
      }
      if (body.incorporationDate && body.incorporationDate > new Date().toISOString().slice(0, 10)) {
        errors['incorporationDate'] = ['The incorporation date cannot be in the future.'];
      }
      if (
        body.regulatoryCategoryId !== null &&
        !LOOKUPS['regulatory-categories'].rows.some(
          (item) => item.id === body.regulatoryCategoryId && item.isActive,
        )
      ) {
        errors['regulatoryCategoryId'] = ['Choose a regulatory category from the list.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      state.institution = {
        institutionName: name,
        licenseNumber: body.licenseNumber?.trim() || null,
        regulatoryCategoryId: body.regulatoryCategoryId ?? null,
        incorporationDate: body.incorporationDate ?? null,
        headOfficeAddress: body.headOfficeAddress?.trim() || null,
      };
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/branches`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const all = new URL(request.url).searchParams.get('includeInactive') === 'true';
      return HttpResponse.json(BRANCHES.map(branchView).filter((branch) => all || branch.isActive));
    }),

    http.post(`${base}/branches`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as Partial<BranchView>;
      const code = (body.branchCode ?? '').trim().toUpperCase();
      const errors = branchErrors(body);
      if (!/^[A-Z0-9]{1,10}$/.test(code)) {
        errors['branchCode'] = ['Use 1 to 10 capital letters or digits.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      if (BRANCHES.some((branch) => branch.branchCode === code)) {
        return problem(409, 'reference.code-taken');
      }
      const branchId = Math.max(...BRANCHES.map((branch) => branch.branchId)) + 1;
      const added = { branchId, branchCode: code, branchName: (body.branchName ?? '').trim() };
      state.addedBranches.push(added);
      state.branchExtras[branchId] = {
        operatingLicenseNo: body.operatingLicenseNo?.trim() || null,
        clearingDays: body.clearingDays ?? null,
        isActive: body.isActive ?? true,
      };
      save();
      sync();
      return HttpResponse.json({ id: branchId }, { status: 201 });
    }),

    http.put(`${base}/branches/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const branch = BRANCHES.find((item) => item.branchId === Number(params['id']));
      if (!branch) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as Partial<BranchView>;
      if (body.branchCode && body.branchCode.trim().toUpperCase() !== branch.branchCode) {
        return problem(400, 'reference.code-immutable');
      }
      const errors = branchErrors(body);
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      branch.branchName = (body.branchName ?? '').trim();
      const added = state.addedBranches.find((item) => item.branchId === branch.branchId);
      if (added) {
        added.branchName = branch.branchName;
      }
      state.branchExtras[branch.branchId] = {
        operatingLicenseNo: body.operatingLicenseNo?.trim() || null,
        clearingDays: body.clearingDays ?? null,
        isActive: body.isActive ?? true,
      };
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(
      `${base}/currencies`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(sortedCurrencies()),
    ),

    http.post(`${base}/currencies`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as {
        currencyCode?: string;
        currencyName?: string;
        exchangeRate?: number | null;
        isLocalCurrency?: boolean;
      };
      const code = (body.currencyCode ?? '').trim().toUpperCase();
      const errors = currencyErrors(body);
      if (!/^[A-Z]{3}$/.test(code)) {
        errors['currencyCode'] = ['Use the three-letter ISO code, for example USD.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      if (CURRENCIES.some((item) => item.currencyCode === code)) {
        return problem(409, 'reference.code-taken');
      }
      if (body.isLocalCurrency && productsExist()) {
        return problem(409, 'currency.local-in-use');
      }
      const currencyId = Math.max(...CURRENCIES.map((item) => item.currencyId)) + 1;
      if (body.isLocalCurrency) {
        CURRENCIES.forEach((item) => (item.isLocalCurrency = false));
      }
      CURRENCIES.push({
        currencyId,
        currencyCode: code,
        currencyName: (body.currencyName ?? '').trim(),
        exchangeRate: body.isLocalCurrency ? 1 : (body.exchangeRate ?? null),
        isLocalCurrency: body.isLocalCurrency ?? false,
      });
      remember();
      return HttpResponse.json({ id: currencyId }, { status: 201 });
    }),

    http.put(`${base}/currencies/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const currency = CURRENCIES.find((item) => item.currencyId === Number(params['id']));
      if (!currency) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as {
        currencyCode?: string;
        currencyName?: string;
        exchangeRate?: number | null;
        isLocalCurrency?: boolean;
      };
      if (body.currencyCode && body.currencyCode.trim().toUpperCase() !== currency.currencyCode) {
        return problem(400, 'reference.code-immutable');
      }
      const errors = currencyErrors(body);
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      if (currency.isLocalCurrency && !body.isLocalCurrency) {
        return problem(409, 'currency.local-required');
      }
      if (body.isLocalCurrency && !currency.isLocalCurrency && productsExist()) {
        return problem(409, 'currency.local-in-use');
      }
      if (body.isLocalCurrency && !currency.isLocalCurrency) {
        CURRENCIES.forEach((item) => (item.isLocalCurrency = false));
      }
      Object.assign(currency, {
        currencyName: (body.currencyName ?? '').trim(),
        exchangeRate: body.isLocalCurrency ? 1 : (body.exchangeRate ?? null),
        isLocalCurrency: body.isLocalCurrency ?? false,
      });
      remember();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/holidays`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const year = new URL(request.url).searchParams.get('year');
      return HttpResponse.json(
        state.holidays
          .filter((holiday) => !year || holiday.holidayDate.startsWith(`${year}-`))
          .sort((a, b) => (a.holidayDate < b.holidayDate ? -1 : 1)),
      );
    }),

    http.post(`${base}/holidays`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as { holidayDate?: string | null; remarks?: string | null };
      const errors: Record<string, string[]> = {};
      if (!body.holidayDate || !ISO.test(body.holidayDate)) {
        errors['holidayDate'] = ['Enter the date of the holiday.'];
      }
      if ((body.remarks ?? '').length > 100) {
        errors['remarks'] = ['Keep the remarks to 100 characters.'];
      }
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      const date = body.holidayDate!;
      if (state.holidays.some((holiday) => holiday.holidayDate === date)) {
        return problem(409, 'holiday.exists');
      }
      if (Object.values(state.days).some((days) => days.some((item) => item.workingDate === date))) {
        return problem(409, 'holiday.business-day-exists');
      }
      const holidayId = Math.max(0, ...state.holidays.map((holiday) => holiday.holidayId)) + 1;
      state.holidays.push({ holidayId, holidayDate: date, remarks: body.remarks?.trim() || null });
      save();
      return HttpResponse.json({ id: holidayId }, { status: 201 });
    }),

    http.delete(`${base}/holidays/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const holiday = state.holidays.find((item) => item.holidayId === Number(params['id']));
      if (!holiday) {
        return problem(404, 'not-found');
      }
      if (
        Object.values(state.days).some((days) =>
          days.some((item) => item.workingDate === holiday.holidayDate),
        )
      ) {
        return problem(409, 'holiday.business-day-exists');
      }
      state.holidays = state.holidays.filter((item) => item !== holiday);
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/branches/:id/business-days`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const branchId = Number(params['id']);
      if (!BRANCHES.some((branch) => branch.branchId === branchId)) {
        return problem(404, 'not-found');
      }
      const url = new URL(request.url);
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
      const size = Math.max(1, Number(url.searchParams.get('pageSize') ?? 25));
      const rows = [...(state.days[branchId] ?? [])].reverse();
      return HttpResponse.json({
        items: rows.slice((page - 1) * size, page * size),
        page,
        pageSize: size,
        totalCount: rows.length,
      });
    }),

    http.post(`${base}/branches/:id/business-days/open`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const branchId = Number(params['id']);
      if (!BRANCHES.some((branch) => branch.branchId === branchId)) {
        return problem(404, 'not-found');
      }
      if (branchOf(request) !== branchId) {
        return problem(409, 'record.other-branch');
      }
      const body = (await request.json()) as { workingDate?: string | null };
      if (!body.workingDate || !ISO.test(body.workingDate)) {
        return validation({ workingDate: ['Enter the working date to open.'] });
      }
      const latest = latestDay(branchId);
      if (latest && latest.status !== 'CLOSED') {
        return problem(409, 'business-day.previous-open');
      }
      if (latest && body.workingDate <= latest.workingDate) {
        return problem(409, 'business-day.date-not-after');
      }
      if (!isWorkingDay(body.workingDate)) {
        return problem(409, 'business-day.non-working-day');
      }
      const opened = {
        ...day(nextId(), body.workingDate, 'OPEN'),
        startedOn: new Date().toISOString(),
        openedByUserId: who(request),
      };
      state.days[branchId] = [...(state.days[branchId] ?? []), opened];
      save();
      return HttpResponse.json({ id: opened.businessDayStatusId }, { status: 201 });
    }),

    http.post(`${base}/branches/:id/business-days/:date/close`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const branchId = Number(params['id']);
      if (!BRANCHES.some((branch) => branch.branchId === branchId)) {
        return problem(404, 'not-found');
      }
      if (branchOf(request) !== branchId) {
        return problem(409, 'record.other-branch');
      }
      const target = (state.days[branchId] ?? []).find((item) => item.workingDate === params['date']);
      if (!target || target.status !== 'OPEN') {
        return problem(409, 'business-day.not-open');
      }
      Object.assign(target, {
        status: 'CLOSED',
        endedOn: new Date().toISOString(),
        closedByUserId: who(request),
      });
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(
      `${base}/lookups`,
      ({ request }) =>
        signedIn(request) ??
        HttpResponse.json(Object.entries(LOOKUPS).map(([slug, set]) => ({ slug, tableName: set.table }))),
    ),

    http.get(`${base}/lookups/:type`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const set = LOOKUPS[String(params['type'])];
      if (!set) {
        return problem(404, 'not-found');
      }
      const all = new URL(request.url).searchParams.get('includeInactive') === 'true';
      return HttpResponse.json(set.rows.filter((item) => all || item.isActive));
    }),

    http.post(`${base}/lookups/:type`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const slug = String(params['type']);
      const set = LOOKUPS[slug];
      if (!set) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as { code?: string; name?: string };
      const code = (body.code ?? '').trim().toUpperCase();
      const errors = lookupErrors(code, body.name);
      if (errors) {
        return validation(errors);
      }
      if (set.rows.some((item) => item.code === code)) {
        return problem(409, 'lookup.code-taken');
      }
      const id = Math.max(0, ...set.rows.map((item) => item.id)) + 1;
      set.rows.push({ id, code, name: (body.name ?? '').trim(), isActive: true, isCoded: false });
      state.lookups[slug] = set.rows.map((item) => ({ ...item }));
      save();
      return HttpResponse.json({ id }, { status: 201 });
    }),

    http.put(`${base}/lookups/:type/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const slug = String(params['type']);
      const target = LOOKUPS[slug]?.rows.find((item) => item.id === Number(params['id']));
      if (!target) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as { code?: string; name?: string; isActive?: boolean };
      if ((body.code ?? '').trim().toUpperCase() !== target.code) {
        return problem(400, 'lookup.code-immutable');
      }
      const errors = lookupErrors(target.code, body.name);
      if (errors) {
        return validation(errors);
      }
      if (target.isCoded && body.isActive === false) {
        return problem(409, 'lookup.coded-row');
      }
      target.name = (body.name ?? '').trim();
      target.isActive = body.isActive ?? true;
      state.lookups[slug] = LOOKUPS[slug].rows.map((item) => ({ ...item }));
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/credit-officers`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const params = new URL(request.url).searchParams;
      const branchId = Number(params.get('branchId') ?? 0);
      const all = params.get('includeDisabled') === 'true';
      return HttpResponse.json(
        CREDIT_OFFICERS.filter(
          (officer) => (!branchId || officer.branchId === branchId) && (all || !officer.isDisabled),
        ),
      );
    }),

    http.post(`${base}/credit-officers`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as { staffUserId?: number };
      const user = MOCK_USERS.find((item) => item.staffUserId === body.staffUserId);
      if (!user) {
        return validation({ staffUserId: ['Choose a staff member.'] });
      }
      const existing = CREDIT_OFFICERS.find((officer) => officer.staffUserId === user.staffUserId);
      if (existing && !existing.isDisabled) {
        return problem(409, 'credit-officer.exists');
      }
      if (existing) {
        existing.isDisabled = false;
        remember();
        return HttpResponse.json({ id: existing.creditOfficerId }, { status: 201 });
      }
      const creditOfficerId = Math.max(0, ...CREDIT_OFFICERS.map((officer) => officer.creditOfficerId)) + 1;
      const branch = BRANCHES[0];
      CREDIT_OFFICERS.push({
        creditOfficerId,
        staffUserId: user.staffUserId,
        staffCode: user.staffCode,
        fullName: user.fullName,
        branchId: branch.branchId,
        branchCode: branch.branchCode,
        isDisabled: false,
      });
      remember();
      return HttpResponse.json({ id: creditOfficerId }, { status: 201 });
    }),

    http.put(`${base}/credit-officers/:id`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const officer = CREDIT_OFFICERS.find((item) => item.creditOfficerId === Number(params['id']));
      if (!officer) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as { isDisabled?: boolean };
      if (!body.isDisabled && !officer.isDisabled) {
        return problem(409, 'credit-officer.exists');
      }
      officer.isDisabled = body.isDisabled ?? false;
      remember();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

function sortedCurrencies() {
  return [...CURRENCIES].sort(
    (a, b) =>
      Number(b.isLocalCurrency) - Number(a.isLocalCurrency) || (a.currencyCode < b.currencyCode ? -1 : 1),
  );
}

function branchErrors(body: Partial<BranchView>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const name = (body.branchName ?? '').trim();
  if (!name || name.length > 100) {
    errors['branchName'] = ['Enter a name of up to 100 characters.'];
  }
  if ((body.operatingLicenseNo ?? '').length > 30) {
    errors['operatingLicenseNo'] = ['Keep the licence number to 30 characters.'];
  }
  if (
    body.clearingDays !== null &&
    body.clearingDays !== undefined &&
    (body.clearingDays < 0 || body.clearingDays > 30)
  ) {
    errors['clearingDays'] = ['Enter a number of days from 0 to 30.'];
  }
  return errors;
}

function currencyErrors(body: {
  currencyName?: string;
  exchangeRate?: number | null;
  isLocalCurrency?: boolean;
}) {
  const errors: Record<string, string[]> = {};
  const name = (body.currencyName ?? '').trim();
  if (!name || name.length > 50) {
    errors['currencyName'] = ['Enter a name of up to 50 characters.'];
  }
  if (
    !body.isLocalCurrency &&
    body.exchangeRate !== null &&
    body.exchangeRate !== undefined &&
    body.exchangeRate <= 0
  ) {
    errors['exchangeRate'] = ['Enter a rate greater than zero.'];
  }
  return errors;
}

function lookupErrors(code: string, name: string | undefined): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!/^[A-Z0-9_]{1,30}$/.test(code)) {
    errors['code'] = ['Use 1 to 30 capital letters, digits or underscores.'];
  }
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.length > 100) {
    errors['name'] = ['Enter a name of up to 100 characters.'];
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
