import { http, HttpResponse } from 'msw';
import type {
  CreateIndividualRequest,
  KycChecklistItem,
  PartyDetail,
  PartyOverview,
  PartySearchRow,
} from '../app/core/api/api-types';

/**
 * Mock customers (never real people) for development and end-to-end tests, following api/openapi.json.
 * Kept in this tab's sessionStorage with the rest of the mock state, so a reload behaves like the real API.
 */
const KEY = 'ib-mock-parties';

export const GENDERS = [
  { id: 1, code: 'MALE', name: 'Male', isActive: true, isCoded: true },
  { id: 2, code: 'FEMALE', name: 'Female', isActive: true, isCoded: true },
];

export const ID_TYPES = [
  { id: 1, code: 'GHANA_CARD', name: 'Ghana Card', isActive: true, isCoded: true },
  { id: 2, code: 'PASSPORT', name: 'Passport', isActive: true, isCoded: true },
  { id: 3, code: 'DRIVERS_LICENCE', name: "Driver's licence", isActive: true, isCoded: true },
  { id: 4, code: 'VOTER_ID', name: 'Voter ID', isActive: true, isCoded: true },
  {
    id: 5,
    code: 'CERTIFICATE_OF_INCORPORATION',
    name: 'Certificate of incorporation',
    isActive: true,
    isCoded: true,
  },
];

export const CREDIT_OFFICERS = [
  {
    creditOfficerId: 1,
    staffUserId: 6,
    staffCode: 'CO1',
    fullName: 'Kojo Antwi',
    branchId: 1,
    branchCode: '001',
    isDisabled: false,
  },
];

interface MockParty {
  detail: PartyDetail;
  creditOfficerId: number | null;
  hasPhoto: boolean;
  hasDocumentImage: boolean;
  nextOfKin: number;
  hasSignature: boolean;
}

interface PartyState {
  parties: MockParty[];
  next: number;
  /** Test hooks. */
  overviewFailure?: string | null;
  dropNextCreate?: boolean;
}

function individual(
  partyId: number,
  first: string,
  last: string,
  extra: Partial<PartyDetail> & { idNumber: string; mobile: string },
  facts: Partial<MockParty> = {},
): MockParty {
  const { idNumber, ...detail } = extra;
  return {
    creditOfficerId: null,
    hasPhoto: false,
    hasDocumentImage: false,
    nextOfKin: 0,
    hasSignature: false,
    ...facts,
    detail: {
      partyId,
      partyNumber: String(partyId).padStart(10, '0'),
      displayName: `${first} ${last}`,
      partyTypeCode: 'INDIVIDUAL',
      kycStatusCode: 'PENDING',
      effectiveKycStatusCode: 'PENDING',
      supervisionState: 'PENDING',
      phone: null,
      emailAddress: null,
      address1: 'Adum, Kumasi',
      address2: null,
      sourceOfFunds: 'Trading',
      occupationOrSector: 'Trader',
      isPoliticallyExposed: false,
      createdOn: '2026-10-01T09:00:00Z',
      createdByUserId: 2,
      modifiedByUserId: null,
      supervisedByUserId: null,
      business: null,
      group: null,
      individual: {
        title: null,
        firstName: first,
        lastName: last,
        genderId: 2,
        genderCode: 'FEMALE',
        dateOfBirth: '1985-03-27',
        nationality: 'Ghanaian',
        identificationTypeId: 1,
        identificationTypeCode: 'GHANA_CARD',
        identificationNumber: idNumber,
      },
      ...detail,
    },
  };
}

function seed(): PartyState {
  return {
    next: 105,
    parties: [
      individual(
        101,
        'Akosua',
        'Darko',
        {
          idNumber: 'GHA-700000001-1',
          mobile: '+233244000101',
          kycStatusCode: 'VERIFIED',
          effectiveKycStatusCode: 'VERIFIED',
          supervisionState: 'APPROVED',
          supervisedByUserId: 3,
          createdOn: '2026-09-02T10:15:00Z',
        },
        { hasPhoto: true, hasDocumentImage: true, nextOfKin: 1, hasSignature: true, creditOfficerId: 1 },
      ),
      individual(102, 'Yaw', 'Ofori', {
        idNumber: 'GHA-700000002-2',
        mobile: '+233244000102',
        createdOn: '2026-10-10T14:00:00Z',
        individual: undefined,
      }),
      individual(
        103,
        'Esi',
        'Quaye',
        {
          idNumber: 'G7000003',
          mobile: '+233244000103',
          isPoliticallyExposed: true,
          createdOn: '2026-10-12T08:30:00Z',
        },
        { hasPhoto: true },
      ),
      {
        creditOfficerId: null,
        hasPhoto: false,
        hasDocumentImage: false,
        nextOfKin: 0,
        hasSignature: false,
        detail: {
          partyId: 104,
          partyNumber: '0000000104',
          displayName: 'Darko Farms Limited',
          partyTypeCode: 'BUSINESS',
          kycStatusCode: 'PENDING',
          effectiveKycStatusCode: 'PENDING',
          supervisionState: 'PENDING',
          mobile: '+233302000104',
          phone: null,
          emailAddress: 'office@darkofarms.example',
          address1: 'Techiman',
          address2: null,
          sourceOfFunds: 'Farming',
          occupationOrSector: 'Agriculture',
          isPoliticallyExposed: false,
          createdOn: '2026-10-05T11:00:00Z',
          createdByUserId: 2,
          modifiedByUserId: null,
          supervisedByUserId: null,
          individual: null,
          business: null,
          group: null,
        },
      },
    ].map((party) => fixIndividual(party)),
  };
}

/** The second seeded customer keeps the default individual details. */
function fixIndividual(party: MockParty): MockParty {
  if (party.detail.partyTypeCode === 'INDIVIDUAL' && !party.detail.individual) {
    party.detail.individual = {
      title: 'Mr',
      firstName: 'Yaw',
      lastName: 'Ofori',
      genderId: 1,
      genderCode: 'MALE',
      dateOfBirth: '1979-11-02',
      nationality: 'Ghanaian',
      identificationTypeId: 1,
      identificationTypeCode: 'GHANA_CARD',
      identificationNumber: 'GHA-700000002-2',
    };
  }
  return party;
}

function load(): PartyState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      return JSON.parse(raw) as PartyState;
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

/** Test hook: the next overview requests fail with this problem type (null: stop failing). */
export function setOverviewFailure(type: string | null): void {
  state.overviewFailure = type;
  save();
}

/** Test hook: the next create is saved but its response is lost, like a dropped connection. */
export function dropNextCreate(): void {
  state.dropNextCreate = true;
  save();
}

/** Test hook: back to the seeded customers. */
export function resetParties(): void {
  state = seed();
  save();
}

const problem = (status: number, type: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json(
    { type, title: type, status, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const mask = (value: string | null | undefined) =>
  !value ? null : value.length <= 4 ? '*'.repeat(value.length) : `****${value.slice(-4)}`;

const normalizeId = (value: string) => value.replace(/\s+/g, '').toUpperCase();

function checklist(party: MockParty): KycChecklistItem[] {
  const detail = party.detail;
  if (detail.partyTypeCode !== 'INDIVIDUAL') {
    return [
      {
        code: 'CREATION_FIELDS',
        label: 'Business, contact and funds details',
        done: true,
        requiredForKyc: true,
      },
      {
        code: 'ID_DOCUMENT_IMAGE',
        label: 'Business document with an image',
        done: false,
        requiredForKyc: true,
      },
      { code: 'TIN', label: 'Tax identification number', done: false, requiredForKyc: true },
      {
        code: 'BENEFICIAL_OWNERS',
        label: 'At least one beneficial owner',
        done: false,
        requiredForKyc: true,
      },
    ];
  }
  return [
    { code: 'CREATION_FIELDS', label: 'Identity, contact and ID details', done: true, requiredForKyc: true },
    { code: 'PHOTO', label: 'Approved photo', done: party.hasPhoto, requiredForKyc: true },
    {
      code: 'ID_DOCUMENT_IMAGE',
      label: 'Identification document with an image',
      done: party.hasDocumentImage,
      requiredForKyc: true,
    },
    {
      code: 'NEXT_OF_KIN',
      label: 'At least one next of kin',
      done: party.nextOfKin > 0,
      requiredForKyc: true,
    },
    { code: 'SOURCE_OF_FUNDS', label: 'Source of funds', done: !!detail.sourceOfFunds, requiredForKyc: true },
    {
      code: 'OCCUPATION',
      label: 'Occupation or sector',
      done: !!detail.occupationOrSector,
      requiredForKyc: true,
    },
    {
      code: 'SIGNATURE',
      label: 'Approved specimen signature (needed to open accounts)',
      done: party.hasSignature,
      requiredForKyc: false,
    },
  ];
}

function row(party: MockParty): PartySearchRow {
  const detail = party.detail;
  const ready = detail.supervisionState !== 'PENDING' && detail.effectiveKycStatusCode === 'VERIFIED';
  const person = detail.partyTypeCode === 'INDIVIDUAL';
  return {
    partyId: detail.partyId,
    partyNumber: detail.partyNumber,
    displayName: detail.displayName,
    partyTypeCode: detail.partyTypeCode,
    mobile: detail.mobile,
    identificationNumberMasked: mask(detail.individual?.identificationNumber),
    effectiveKycStatusCode: detail.effectiveKycStatusCode ?? 'PENDING',
    supervisionState: detail.supervisionState,
    creditOfficerName:
      CREDIT_OFFICERS.find((officer) => officer.creditOfficerId === party.creditOfficerId)?.fullName ?? null,
    createdOn: detail.createdOn,
    hasEffectiveSignature: party.hasSignature,
    canBePrimaryHolder: ready,
    canBeJointHolder: ready && person && party.hasSignature,
    canBeSignatory: ready && person && party.hasSignature,
  };
}

function matches(party: MockParty, term: string): boolean {
  const detail = party.detail;
  const lower = term.toLowerCase();
  return (
    detail.partyNumber.startsWith(term) ||
    detail.displayName.toLowerCase().includes(lower) ||
    detail.mobile === term ||
    (detail.individual?.identificationNumber ?? '') === normalizeId(term)
  );
}

interface SearchBody {
  q?: string | null;
  partyType?: string | null;
  kycStatus?: string | null;
  supervision?: string | null;
  creditOfficerId?: number | null;
  oldestFirst?: boolean;
  page?: number;
  pageSize?: number;
}

function validate(body: CreateIndividualRequest): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const required: [keyof CreateIndividualRequest, string][] = [
    ['firstName', 'Enter the first name (up to 60 characters).'],
    ['lastName', 'Enter the last name (up to 60 characters).'],
    ['dateOfBirth', 'Enter the date of birth.'],
    ['genderId', 'Choose a gender.'],
    ['nationality', 'Enter the nationality.'],
    ['identificationTypeId', 'Choose the ID type.'],
    ['identificationNumber', 'Enter the ID number.'],
    ['mobile', 'Enter a mobile number of 9 to 15 digits, for example 0241234567.'],
    ['address1', 'Enter the address.'],
    ['sourceOfFunds', 'Enter the source of funds.'],
    ['occupationOrSector', 'Enter the occupation or sector.'],
  ];
  for (const [field, message] of required) {
    if (body[field] === null || body[field] === undefined || body[field] === '') {
      errors[field] = [message];
    }
  }
  // Mirrors the API's minimum age rule (KycOptions:MinimumAgeYears, default 18).
  if (body.dateOfBirth && body.dateOfBirth > '2008-10-15') {
    errors['dateOfBirth'] = ['The customer must be at least 18 years old.'];
  }
  if (body.address1 === 'SERVER-ERROR') {
    errors['address1'] = ['The address could not be accepted.'];
  }
  return errors;
}

function apply(party: MockParty, body: CreateIndividualRequest): void {
  const genderCode = GENDERS.find((gender) => gender.id === body.genderId)?.code ?? null;
  const idType = ID_TYPES.find((type) => type.id === body.identificationTypeId)?.code ?? null;
  Object.assign(party.detail, {
    displayName: `${body.firstName} ${body.lastName}`,
    mobile: body.mobile,
    phone: body.phone,
    emailAddress: body.emailAddress,
    address1: body.address1,
    address2: body.address2,
    sourceOfFunds: body.sourceOfFunds,
    occupationOrSector: body.occupationOrSector,
    isPoliticallyExposed: body.isPoliticallyExposed ?? false,
    individual: {
      title: body.title,
      firstName: body.firstName!,
      lastName: body.lastName!,
      genderId: body.genderId,
      genderCode,
      dateOfBirth: body.dateOfBirth,
      nationality: body.nationality,
      identificationTypeId: body.identificationTypeId,
      identificationTypeCode: idType,
      identificationNumber: normalizeId(body.identificationNumber ?? ''),
    },
  });
}

function duplicate(body: CreateIndividualRequest, exceptId: number | null): MockParty | undefined {
  const number = normalizeId(body.identificationNumber ?? '');
  return state.parties.find(
    (party) =>
      party.detail.partyId !== exceptId &&
      party.detail.individual?.identificationTypeId === body.identificationTypeId &&
      party.detail.individual?.identificationNumber === number,
  );
}

/** Handlers; `signedIn` returns a problem response when there is no session. */
export function partyHandlers(base: string, signedIn: (request: Request) => Response | null) {
  const find = (id: string | readonly string[] | undefined) =>
    state.parties.find((party) => party.detail.partyId === Number(id));

  return [
    http.get(`${base}/lookups/genders`, ({ request }) => signedIn(request) ?? HttpResponse.json(GENDERS)),
    http.get(
      `${base}/lookups/identification-document-types`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(ID_TYPES),
    ),
    http.get(
      `${base}/credit-officers`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(CREDIT_OFFICERS),
    ),

    http.post(`${base}/parties/search`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as SearchBody;
      const term = body.q?.trim() ?? '';
      let rows = state.parties.filter(
        (party) =>
          (!term || matches(party, term)) &&
          (!body.partyType || party.detail.partyTypeCode === body.partyType.toUpperCase()) &&
          (!body.kycStatus || party.detail.kycStatusCode === body.kycStatus.toUpperCase()) &&
          (!body.supervision || party.detail.supervisionState === body.supervision.toUpperCase()) &&
          (!body.creditOfficerId || party.creditOfficerId === body.creditOfficerId),
      );
      rows = [...rows].sort((a, b) =>
        body.oldestFirst
          ? a.detail.createdOn.localeCompare(b.detail.createdOn)
          : b.detail.createdOn.localeCompare(a.detail.createdOn),
      );
      const page = Math.max(1, body.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, body.pageSize ?? 25));
      return HttpResponse.json({
        items: rows.slice((page - 1) * pageSize, page * pageSize).map(row),
        page,
        pageSize,
        totalCount: rows.length,
      });
    }),

    http.get(`${base}/parties/:id/overview`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      if (state.overviewFailure) {
        return problem(500, state.overviewFailure);
      }
      const party = find(params['id']);
      if (!party) {
        return problem(404, 'not-found');
      }
      const items = checklist(party);
      const overview: PartyOverview = {
        party: party.detail,
        checklist: {
          partyId: party.detail.partyId,
          partyTypeCode: party.detail.partyTypeCode,
          storedStatus: party.detail.kycStatusCode,
          effectiveStatus: party.detail.effectiveKycStatusCode ?? 'PENDING',
          supervisionState: party.detail.supervisionState,
          isComplete: items.every((item) => item.done || !item.requiredForKyc),
          items,
        },
        photo: {
          hasPhoto: party.hasPhoto,
          supervisionState: party.hasPhoto ? 'APPROVED' : null,
          capturedOn: null,
          capturedByUserId: null,
          supervisedByUserId: null,
        },
        signature:
          party.detail.partyTypeCode === 'INDIVIDUAL'
            ? { hasEffective: party.hasSignature, effective: null, pending: null }
            : null,
        documentCount: party.detail.partyTypeCode === 'INDIVIDUAL' ? 1 : 0,
        nextOfKinCount: party.nextOfKin,
        creditOfficerName:
          CREDIT_OFFICERS.find((officer) => officer.creditOfficerId === party.creditOfficerId)?.fullName ??
          null,
        activeGroup: null,
        accounts: [],
      };
      return HttpResponse.json(overview);
    }),

    http.get(`${base}/parties/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id']);
      return party ? HttpResponse.json(party.detail) : problem(404, 'not-found');
    }),

    http.post(`${base}/parties/individuals`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as CreateIndividualRequest;
      const errors = validate(body);
      if (Object.keys(errors).length > 0) {
        return HttpResponse.json(
          { type: 'validation', title: 'validation', status: 400, errors },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }
      const existing = duplicate(body, null);
      if (existing) {
        return problem(409, 'party.duplicate-identification', {
          existingPartyNumber: existing.detail.partyNumber,
        });
      }
      const partyId = state.next++;
      const party = individual(partyId, body.firstName!, body.lastName!, {
        idNumber: '',
        mobile: body.mobile ?? '',
        createdOn: new Date().toISOString(),
      });
      apply(party, body);
      state.parties.push(party);
      const drop = state.dropNextCreate === true;
      state.dropNextCreate = false;
      save();
      return drop
        ? HttpResponse.error()
        : HttpResponse.json({ partyId, partyNumber: party.detail.partyNumber }, { status: 201 });
    }),

    http.put(`${base}/parties/:id/individual`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id']);
      if (!party) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as CreateIndividualRequest;
      const errors = validate(body);
      if (Object.keys(errors).length > 0) {
        return HttpResponse.json(
          { type: 'validation', title: 'validation', status: 400, errors },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }
      const existing = duplicate(body, party.detail.partyId);
      if (existing) {
        return problem(409, 'party.duplicate-identification', {
          existingPartyNumber: existing.detail.partyNumber,
        });
      }
      const before = party.detail.individual;
      apply(party, body);
      const controlled =
        before?.firstName !== body.firstName ||
        before?.lastName !== body.lastName ||
        before?.dateOfBirth !== body.dateOfBirth ||
        before?.identificationTypeId !== body.identificationTypeId ||
        before?.identificationNumber !== normalizeId(body.identificationNumber ?? '');
      if (controlled) {
        Object.assign(party.detail, {
          kycStatusCode: 'PENDING',
          effectiveKycStatusCode: 'PENDING',
          supervisionState: 'PENDING',
          supervisedByUserId: null,
        });
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
