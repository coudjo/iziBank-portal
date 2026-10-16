import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import type { CreateIndividualRequest, PartyDetail } from '../../core/api/api-types';
import { ageOn, isIsoDate, todayIso } from '../../core/formats/dates';
import { normalizeIdNumber } from '../../core/formats/masking';

/** Identification types an individual can hold (API LookupCodes.IdentificationDocumentTypes.Individual). */
export const INDIVIDUAL_ID_TYPES = ['GHANA_CARD', 'PASSPORT', 'DRIVERS_LICENCE', 'VOTER_ID'] as const;

/** Format hints only (frontend plan D5): enforcement waits for the compliance decision. */
export const ID_HINTS: Readonly<Record<string, string>> = {
  GHANA_CARD: 'For example GHA-123456789-0',
  PASSPORT: 'For example G1234567',
  DRIVERS_LICENCE: 'As printed on the licence',
  VOTER_ID: 'As printed on the voter ID card',
};

export const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'];

export const SOURCES_OF_FUNDS = [
  'Salary',
  'Business income',
  'Farming',
  'Trading',
  'Remittances',
  'Savings',
  'Pension',
  'Other',
];

/** Fields whose change sends an approved customer back for approval and resets KYC (API A4-06, UX 5.2). */
export const CONTROLLED_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'identificationTypeId',
  'identificationNumber',
] as const;

export const STEP_FIELDS = {
  identity: [
    'title',
    'firstName',
    'lastName',
    'genderId',
    'dateOfBirth',
    'nationality',
    'identificationTypeId',
    'identificationNumber',
  ],
  contact: ['mobile', 'phone', 'emailAddress', 'address1', 'address2'],
  funds: ['sourceOfFunds', 'occupationOrSector', 'isPoliticallyExposed'],
} as const;

export type IndividualStep = keyof typeof STEP_FIELDS;
export const STEPS: readonly IndividualStep[] = ['identity', 'contact', 'funds'];

/** Field messages, in the UX's wording style: say what to do. */
export const FIELD_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  firstName: { required: 'Enter the first name.' },
  lastName: { required: 'Enter the last name.' },
  genderId: { required: 'Choose a gender.' },
  dateOfBirth: {
    required: 'Enter the date of birth.',
    date: 'Enter a real date, for example 27/03/1985.',
    future: 'The date of birth cannot be in the future.',
  },
  nationality: { required: 'Choose the nationality.', option: 'Choose a nationality from the list.' },
  identificationTypeId: { required: 'Choose the ID type.' },
  identificationNumber: { required: 'Enter the ID number.' },
  mobile: { required: 'Enter the mobile number.' },
  address1: { required: 'Enter the first line of the address.' },
  sourceOfFunds: { required: 'Enter the source of funds.' },
  occupationOrSector: { required: 'Enter the occupation or sector.' },
};

export function minimumAgeMessage(years: number): string {
  return `The customer must be at least ${years} years old.`;
}

export function createIndividualForm(minimumAge: number, today: () => string = todayIso) {
  return new FormGroup({
    identity: new FormGroup({
      title: new FormControl<string | null>(null, Validators.maxLength(10)),
      firstName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(60)],
      }),
      lastName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(60)],
      }),
      genderId: new FormControl<number | null>(null, Validators.required),
      dateOfBirth: new FormControl<string | null>(null, [Validators.required, birthDate(minimumAge, today)]),
      nationality: new FormControl<string | null>('Ghanaian', [
        Validators.required,
        Validators.maxLength(50),
      ]),
      identificationTypeId: new FormControl<number | null>(null, Validators.required),
      identificationNumber: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(30)],
      }),
    }),
    contact: new FormGroup({
      mobile: new FormControl<string | null>(null, Validators.required),
      phone: new FormControl<string | null>(null),
      emailAddress: new FormControl('', {
        nonNullable: true,
        validators: [Validators.email, Validators.maxLength(100)],
      }),
      address1: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(200)],
      }),
      address2: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    }),
    funds: new FormGroup({
      sourceOfFunds: new FormControl<string | null>(null, [Validators.required, Validators.maxLength(200)]),
      occupationOrSector: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(100)],
      }),
      isPoliticallyExposed: new FormControl(false, { nonNullable: true }),
    }),
  });
}

export type IndividualForm = ReturnType<typeof createIndividualForm>;

/** Not in the future, and at least the minimum age (UX 6.2 failure paths: the message states the age). */
function birthDate(minimumAge: number, today: () => string): ValidatorFn {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const value = control.value;
    if (!value || !isIsoDate(value)) {
      return null;
    }
    const now = today();
    if (value > now) {
      return { future: true };
    }
    return ageOn(value, now) < minimumAge ? { minimumAge: minimumAgeMessage(minimumAge) } : null;
  };
}

const blank = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
};

export function toRequest(form: IndividualForm): CreateIndividualRequest {
  const { identity, contact, funds } = form.getRawValue();
  return {
    title: blank(identity.title),
    firstName: identity.firstName.trim(),
    lastName: identity.lastName.trim(),
    genderId: identity.genderId,
    dateOfBirth: identity.dateOfBirth,
    nationality: blank(identity.nationality),
    identificationTypeId: identity.identificationTypeId,
    identificationNumber: normalizeIdNumber(identity.identificationNumber),
    identificationIssuedOn: null,
    identificationExpiresOn: null,
    mobile: contact.mobile,
    phone: contact.phone,
    emailAddress: blank(contact.emailAddress),
    address1: contact.address1.trim(),
    address2: blank(contact.address2),
    sourceOfFunds: blank(funds.sourceOfFunds),
    occupationOrSector: funds.occupationOrSector.trim(),
    isPoliticallyExposed: funds.isPoliticallyExposed,
  };
}

export function fromParty(form: IndividualForm, party: PartyDetail): void {
  const person = party.individual;
  form.reset({
    identity: {
      title: person?.title ?? null,
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      genderId: person?.genderId ?? null,
      dateOfBirth: person?.dateOfBirth ?? null,
      nationality: person?.nationality ?? null,
      identificationTypeId: person?.identificationTypeId ?? null,
      identificationNumber: person?.identificationNumber ?? '',
    },
    contact: {
      mobile: party.mobile,
      phone: party.phone,
      emailAddress: party.emailAddress ?? '',
      address1: party.address1 ?? '',
      address2: party.address2 ?? '',
    },
    funds: {
      sourceOfFunds: party.sourceOfFunds,
      occupationOrSector: party.occupationOrSector ?? '',
      isPoliticallyExposed: party.isPoliticallyExposed,
    },
  });
}

/** True when a save would change a controlled field (names, date of birth, ID type or number). */
export function changesControlledField(form: IndividualForm, party: PartyDetail): boolean {
  const request = toRequest(form);
  const person = party.individual;
  return (
    request.firstName !== (person?.firstName ?? '') ||
    request.lastName !== (person?.lastName ?? '') ||
    request.dateOfBirth !== (person?.dateOfBirth ?? null) ||
    request.identificationTypeId !== (person?.identificationTypeId ?? null) ||
    request.identificationNumber !== normalizeIdNumber(person?.identificationNumber)
  );
}

/** The step that holds an API field name. */
export function stepOf(field: string): IndividualStep | null {
  return STEPS.find((step) => (STEP_FIELDS[step] as readonly string[]).includes(field)) ?? null;
}
