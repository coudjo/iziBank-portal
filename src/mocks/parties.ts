import { http, HttpResponse } from 'msw';
import { organisationHandlers } from './organisations';
import type {
  BeneficialOwnerView,
  CreateBusinessRequest,
  CreateIndividualRequest,
  GroupMemberView,
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
  { id: 6, code: 'TIN_CERTIFICATE', name: 'TIN certificate', isActive: true, isCoded: true },
];

export const BUSINESS_CATEGORIES = [
  { id: 1, code: 'SOLE_PROPRIETORSHIP', name: 'Sole proprietorship', isActive: true, isCoded: true },
  { id: 2, code: 'PARTNERSHIP', name: 'Partnership', isActive: true, isCoded: true },
  { id: 3, code: 'LIMITED_COMPANY', name: 'Limited company', isActive: true, isCoded: true },
  { id: 4, code: 'NGO', name: 'NGO', isActive: true, isCoded: true },
  { id: 5, code: 'OTHER', name: 'Other', isActive: true, isCoded: true },
];

export const MEMBER_ROLES = [
  { id: 1, code: 'CHAIRPERSON', name: 'Chairperson', isActive: true, isCoded: true },
  { id: 2, code: 'SECRETARY', name: 'Secretary', isActive: true, isCoded: true },
  { id: 3, code: 'TREASURER', name: 'Treasurer', isActive: true, isCoded: true },
  { id: 4, code: 'MEMBER', name: 'Member', isActive: true, isCoded: true },
];

/** Minimum active members for a group's KYC (API KycOptions, placeholder). */
const MINIMUM_MEMBERS = 5;

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
  owners?: { ownerPartyId: number; ownershipPercentage: number }[];
  members?: GroupMemberView[];
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
    next: 106,
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
          business: {
            businessName: 'Darko Farms Limited',
            registrationNumber: 'CS123456789',
            taxIdentificationNumber: 'C0001234567',
            incorporationDate: '2015-04-01',
            businessCategoryId: 3,
            businessCategoryCode: 'LIMITED_COMPANY',
            beneficialOwners: [],
          },
          group: null,
        },
        owners: [{ ownerPartyId: 101, ownershipPercentage: 60 }],
      },
      {
        creditOfficerId: 1,
        hasPhoto: false,
        hasDocumentImage: false,
        nextOfKin: 0,
        hasSignature: false,
        detail: {
          partyId: 105,
          partyNumber: '0000000105',
          displayName: 'Nkabom Women Susu Group',
          partyTypeCode: 'GROUP',
          kycStatusCode: 'PENDING',
          effectiveKycStatusCode: 'PENDING',
          supervisionState: 'PENDING',
          mobile: null,
          phone: null,
          emailAddress: null,
          address1: 'Kejetia market',
          address2: null,
          sourceOfFunds: null,
          occupationOrSector: null,
          isPoliticallyExposed: false,
          createdOn: '2026-10-08T09:30:00Z',
          createdByUserId: 6,
          modifiedByUserId: null,
          supervisedByUserId: null,
          individual: null,
          business: null,
          group: {
            groupName: 'Nkabom Women Susu Group',
            formationDate: '2020-06-01',
            meetingFrequency: 'Weekly',
            chairpersonPartyId: null,
            chairpersonPartyNumber: null,
            chairpersonName: null,
            activeMemberCount: 0,
          },
        },
        members: [
          {
            groupMemberId: 1,
            memberPartyId: 101,
            partyNumber: '0000000101',
            displayName: 'Akosua Darko',
            groupMemberRoleId: 1,
            roleCode: 'CHAIRPERSON',
            joinedOn: '2020-06-01',
            leftOn: null,
            isChairperson: true,
          },
        ],
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

export function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best effort.
  }
}

/** Shared with the organisation handlers. */
export const store = {
  parties: () => state.parties,
  nextId: () => state.next++,
  /** True once: the next create is saved but its response is lost (test hook). */
  takeDrop: () => {
    const drop = state.dropNextCreate === true;
    state.dropNextCreate = false;
    return drop;
  },
};

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

export const problem = (status: number, type: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json(
    { type, title: type, status, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

const mask = (value: string | null | undefined) =>
  !value ? null : value.length <= 4 ? '*'.repeat(value.length) : `****${value.slice(-4)}`;

export const normalizeId = (value: string) => value.replace(/\s+/g, '').toUpperCase();

function checklist(party: MockParty): KycChecklistItem[] {
  const detail = party.detail;
  if (detail.partyTypeCode === 'GROUP') {
    const active = (party.members ?? []).filter((member) => !member.leftOn);
    const unverified = active.filter(
      (member) => find(member.memberPartyId)?.detail.effectiveKycStatusCode !== 'VERIFIED',
    );
    return [
      {
        code: 'CHAIRPERSON',
        label: 'Chairperson',
        done: active.some((member) => member.isChairperson),
        requiredForKyc: true,
      },
      {
        code: 'MINIMUM_MEMBERS',
        label: `At least ${MINIMUM_MEMBERS} active members`,
        done: active.length >= MINIMUM_MEMBERS,
        requiredForKyc: true,
      },
      {
        code: 'MEMBERS_VERIFIED',
        label: 'Every active member is KYC verified',
        done: active.length > 0 && unverified.length === 0,
        requiredForKyc: true,
      },
    ];
  }
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
      {
        code: 'TIN',
        label: 'Tax identification number',
        done: !!detail.business?.taxIdentificationNumber,
        requiredForKyc: true,
      },
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

export function find(id: string | number | readonly string[] | undefined): MockParty | undefined {
  return state.parties.find((party) => party.detail.partyId === Number(id));
}

/** The detail as the API returns it, with the business owners and group summary filled in. */
export function view(party: MockParty): PartyDetail {
  const detail = party.detail;
  if (detail.business) {
    detail.business.beneficialOwners = ownerViews(party);
  }
  if (detail.group) {
    const active = (party.members ?? []).filter((member) => !member.leftOn);
    const chair = active.find((member) => member.isChairperson);
    Object.assign(detail.group, {
      chairpersonPartyId: chair?.memberPartyId ?? null,
      chairpersonPartyNumber: chair?.partyNumber ?? null,
      chairpersonName: chair?.displayName ?? null,
      activeMemberCount: active.length,
    });
  }
  return detail;
}

export function ownerViews(party: MockParty): BeneficialOwnerView[] {
  return (party.owners ?? []).map((owner) => {
    const person = find(owner.ownerPartyId)?.detail;
    return {
      ownerPartyId: owner.ownerPartyId,
      partyNumber: person?.partyNumber ?? '',
      displayName: person?.displayName ?? '',
      ownershipPercentage: owner.ownershipPercentage,
    };
  });
}

export const validation = (errors: Record<string, string[]>) =>
  HttpResponse.json(
    { type: 'validation', title: 'validation', status: 400, errors },
    { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
  );

export function blankParty(partyId: number, type: string, name: string): MockParty {
  return {
    creditOfficerId: null,
    hasPhoto: false,
    hasDocumentImage: false,
    nextOfKin: 0,
    hasSignature: false,
    detail: {
      partyId,
      partyNumber: String(partyId).padStart(10, '0'),
      displayName: name,
      partyTypeCode: type,
      kycStatusCode: 'PENDING',
      effectiveKycStatusCode: 'PENDING',
      supervisionState: 'PENDING',
      mobile: null,
      phone: null,
      emailAddress: null,
      address1: null,
      address2: null,
      sourceOfFunds: null,
      occupationOrSector: null,
      isPoliticallyExposed: false,
      createdOn: new Date().toISOString(),
      createdByUserId: 2,
      modifiedByUserId: null,
      supervisedByUserId: null,
      individual: null,
      business: null,
      group: null,
    },
  };
}

export function applyBusiness(party: MockParty, body: CreateBusinessRequest): void {
  Object.assign(party.detail, {
    displayName: body.businessName,
    mobile: body.mobile,
    phone: body.phone,
    emailAddress: body.emailAddress,
    address1: body.address1,
    address2: body.address2,
    sourceOfFunds: body.sourceOfFunds,
    occupationOrSector: body.occupationOrSector,
    business: {
      businessName: body.businessName ?? '',
      registrationNumber: normalizeId(body.registrationNumber ?? ''),
      taxIdentificationNumber: body.taxIdentificationNumber,
      incorporationDate: body.incorporationDate,
      businessCategoryId: body.businessCategoryId,
      businessCategoryCode:
        BUSINESS_CATEGORIES.find((row) => row.id === body.businessCategoryId)?.code ?? null,
      beneficialOwners: [],
    },
  });
}

export function businessErrors(body: CreateBusinessRequest): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (!body.businessName?.trim()) {
    errors['businessName'] = ['Enter the business name (up to 150 characters).'];
  }
  if (!body.registrationNumber?.trim()) {
    errors['registrationNumber'] = ['Enter the registration number (up to 40 characters).'];
  }
  if (!body.businessCategoryId) {
    errors['businessCategoryId'] = ['Choose the legal form from the list.'];
  }
  if (!body.mobile && !body.phone) {
    errors['mobile'] = ['Enter a mobile or phone number.'];
  }
  if (!body.address1?.trim()) {
    errors['address1'] = ['Enter the address (up to 200 characters).'];
  }
  if (!body.sourceOfFunds?.trim()) {
    errors['sourceOfFunds'] = ['Enter the source of funds (up to 200 characters).'];
  }
  return errors;
}

/** The group a person is an active member of, other than `exceptGroupId`. */
export function activeGroupOf(personId: number, exceptGroupId: number | null): MockParty | undefined {
  return state.parties.find(
    (party) =>
      party.detail.partyId !== exceptGroupId &&
      (party.members ?? []).some((member) => member.memberPartyId === personId && !member.leftOn),
  );
}

export const memberIds = { next: 100 };

export function addMember(
  group: MockParty,
  personId: number,
  roleId: number | null,
  joinedOn: string | null,
): Response | null {
  const person = find(personId);
  if (!person || person.detail.partyTypeCode !== 'INDIVIDUAL') {
    return validation({
      memberPartyId: [`Member ${person?.detail.partyNumber ?? personId} is not an individual.`],
    });
  }
  const role = MEMBER_ROLES.find((row) => row.id === roleId);
  if (!role) {
    return validation({
      groupMemberRoleId: [`Member ${person.detail.partyNumber}: choose a role from the list.`],
    });
  }
  const elsewhere = activeGroupOf(personId, group.detail.partyId);
  if (elsewhere) {
    return problem(409, 'group.member-in-other-group', {
      memberPartyNumber: person.detail.partyNumber,
      groupPartyNumber: elsewhere.detail.partyNumber,
    });
  }
  const members = (group.members ??= []);
  if (role.code === 'CHAIRPERSON' && members.some((member) => member.isChairperson && !member.leftOn)) {
    return problem(409, 'group.chairperson-exists');
  }
  members.push({
    groupMemberId: memberIds.next++,
    memberPartyId: personId,
    partyNumber: person.detail.partyNumber,
    displayName: person.detail.displayName,
    groupMemberRoleId: role.id,
    roleCode: role.code,
    joinedOn: joinedOn ?? new Date().toISOString().slice(0, 10),
    leftOn: null,
    isChairperson: role.code === 'CHAIRPERSON',
  });
  return null;
}

/** Handlers; `signedIn` returns a problem response when there is no session. */
export function partyHandlers(base: string, signedIn: (request: Request) => Response | null) {
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
    http.get(
      `${base}/lookups/business-categories`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(BUSINESS_CATEGORIES),
    ),
    http.get(
      `${base}/lookups/group-member-roles`,
      ({ request }) => signedIn(request) ?? HttpResponse.json(MEMBER_ROLES),
    ),
    ...organisationHandlers(base, signedIn),

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
      const party = find(params['id'] as string);
      if (!party) {
        return problem(404, 'not-found');
      }
      const items = checklist(party);
      const overview: PartyOverview = {
        party: view(party),
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
        activeGroup: ((group) =>
          group
            ? {
                partyId: group.detail.partyId,
                partyNumber: group.detail.partyNumber,
                displayName: group.detail.displayName,
                partyTypeCode: 'GROUP',
              }
            : null)(activeGroupOf(party.detail.partyId, null)),
        accounts: [],
      };
      return HttpResponse.json(overview);
    }),

    http.get(`${base}/parties/:id`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      return party ? HttpResponse.json(view(party)) : problem(404, 'not-found');
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
      const party = find(params['id'] as string);
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
