import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import type { PartyDetail } from '../../core/api/api-types';
import { isIsoDate, todayIso } from '../../core/formats/dates';
import { normalizeIdNumber } from '../../core/formats/masking';

/** Business onboarding (UX 6.3): step 1 the business, step 2 contact and funds. */
export const BUSINESS_STEPS = ['business', 'contact'] as const;
export type BusinessStep = (typeof BUSINESS_STEPS)[number];

export const BUSINESS_FIELDS: Readonly<Record<BusinessStep, readonly string[]>> = {
  business: [
    'businessName',
    'registrationNumber',
    'businessCategoryId',
    'taxIdentificationNumber',
    'incorporationDate',
  ],
  contact: ['mobile', 'phone', 'emailAddress', 'address1', 'address2', 'sourceOfFunds', 'occupationOrSector'],
};

export const BUSINESS_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  businessName: { required: 'Enter the business name.' },
  registrationNumber: { required: 'Enter the registration number.' },
  businessCategoryId: { required: 'Choose the legal form.' },
  incorporationDate: { future: 'The incorporation date cannot be in the future.' },
  mobile: { contactNumber: 'Enter a mobile or phone number.' },
  address1: { required: 'Enter the first line of the address.' },
  sourceOfFunds: { required: 'Enter the source of funds.' },
};

/** Fields that send an approved business back for approval (API A4-06). */
export const BUSINESS_CONTROLLED = ['businessName', 'registrationNumber', 'taxIdentificationNumber'] as const;

export function notInFuture(today: () => string = todayIso): ValidatorFn {
  return (control: AbstractControl<string | null>): ValidationErrors | null =>
    control.value && isIsoDate(control.value) && control.value > today() ? { future: true } : null;
}

/** A business needs a mobile or a phone number (API PartyCommon.ValidateContact, requireNumber). */
function oneNumber(group: AbstractControl): ValidationErrors | null {
  const mobile = group.get('mobile');
  const phone = group.get('phone');
  const missing = !mobile?.value && !phone?.value;
  if (mobile) {
    const others = { ...(mobile.errors ?? {}) };
    delete others['contactNumber'];
    mobile.setErrors(
      missing ? { ...others, contactNumber: true } : Object.keys(others).length ? others : null,
      {
        emitEvent: false,
      },
    );
  }
  return null;
}

export function createBusinessForm() {
  return new FormGroup({
    business: new FormGroup({
      businessName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(150)],
      }),
      registrationNumber: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(40)],
      }),
      businessCategoryId: new FormControl<number | null>(null, Validators.required),
      taxIdentificationNumber: new FormControl('', {
        nonNullable: true,
        validators: Validators.maxLength(30),
      }),
      incorporationDate: new FormControl<string | null>(null, notInFuture()),
    }),
    contact: new FormGroup(
      {
        mobile: new FormControl<string | null>(null),
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
        sourceOfFunds: new FormControl<string | null>(null, [Validators.required, Validators.maxLength(200)]),
        occupationOrSector: new FormControl('', { nonNullable: true, validators: Validators.maxLength(100) }),
      },
      { validators: oneNumber },
    ),
  });
}

export type BusinessForm = ReturnType<typeof createBusinessForm>;

const blank = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
};

export function businessRequest(form: BusinessForm) {
  const { business, contact } = form.getRawValue();
  return {
    businessName: business.businessName.trim(),
    registrationNumber: normalizeIdNumber(business.registrationNumber),
    taxIdentificationNumber: blank(business.taxIdentificationNumber)
      ? normalizeIdNumber(business.taxIdentificationNumber)
      : null,
    incorporationDate: business.incorporationDate,
    businessCategoryId: business.businessCategoryId,
    mobile: contact.mobile,
    phone: contact.phone,
    emailAddress: blank(contact.emailAddress),
    address1: blank(contact.address1),
    address2: blank(contact.address2),
    sourceOfFunds: blank(contact.sourceOfFunds),
    occupationOrSector: blank(contact.occupationOrSector),
    isPoliticallyExposed: false,
    document: null,
    beneficialOwners: null,
  };
}

export function businessFromParty(form: BusinessForm, party: PartyDetail): void {
  const business = party.business;
  form.reset({
    business: {
      businessName: business?.businessName ?? party.displayName,
      registrationNumber: business?.registrationNumber ?? '',
      businessCategoryId: business?.businessCategoryId ?? null,
      taxIdentificationNumber: business?.taxIdentificationNumber ?? '',
      incorporationDate: business?.incorporationDate ?? null,
    },
    contact: {
      mobile: party.mobile,
      phone: party.phone,
      emailAddress: party.emailAddress ?? '',
      address1: party.address1 ?? '',
      address2: party.address2 ?? '',
      sourceOfFunds: party.sourceOfFunds,
      occupationOrSector: party.occupationOrSector ?? '',
    },
  });
}

export function businessChangesControlled(form: BusinessForm, party: PartyDetail): boolean {
  const request = businessRequest(form);
  const business = party.business;
  return (
    request.businessName !== (business?.businessName ?? '') ||
    request.registrationNumber !== normalizeIdNumber(business?.registrationNumber) ||
    (request.taxIdentificationNumber ?? '') !== normalizeIdNumber(business?.taxIdentificationNumber)
  );
}

export function businessStepOf(field: string): BusinessStep | null {
  return BUSINESS_STEPS.find((step) => BUSINESS_FIELDS[step].includes(field)) ?? null;
}
