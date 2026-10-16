import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { PartyDetail } from '../../core/api/api-types';
import { notInFuture } from './business-form';

/** Group onboarding (UX 6.4): step 1 the group, step 2 the chairperson (an individual customer). */
export const GROUP_STEPS = ['group', 'chairperson'] as const;
export type GroupStep = (typeof GROUP_STEPS)[number];

export const GROUP_FIELDS: Readonly<Record<GroupStep, readonly string[]>> = {
  group: ['groupName', 'formationDate', 'meetingFrequency', 'mobile', 'address1'],
  chairperson: [],
};

export const GROUP_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  groupName: { required: 'Enter the group name.' },
  formationDate: { future: 'The formation date cannot be in the future.' },
};

export const MEETING_FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly'];

/** Fields that send an approved group back for approval (API A4-06). */
export function groupChangesControlled(form: GroupForm, party: PartyDetail): boolean {
  return form.controls.group.controls.groupName.value.trim() !== (party.group?.groupName ?? '');
}

export function createGroupForm() {
  return new FormGroup({
    group: new FormGroup({
      groupName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(100)],
      }),
      formationDate: new FormControl<string | null>(null, notInFuture()),
      meetingFrequency: new FormControl<string | null>(null, Validators.maxLength(30)),
      mobile: new FormControl<string | null>(null),
      address1: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    }),
    chairperson: new FormGroup({}),
  });
}

export type GroupForm = ReturnType<typeof createGroupForm>;

const blank = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
};

export function groupDetails(form: GroupForm) {
  const group = form.controls.group.getRawValue();
  return {
    groupName: group.groupName.trim(),
    formationDate: group.formationDate,
    meetingFrequency: blank(group.meetingFrequency),
    mobile: group.mobile,
    phone: null,
    emailAddress: null,
    address1: blank(group.address1),
    address2: null,
  };
}

export function groupFromParty(form: GroupForm, party: PartyDetail): void {
  form.controls.group.reset({
    groupName: party.group?.groupName ?? party.displayName,
    formationDate: party.group?.formationDate ?? null,
    meetingFrequency: party.group?.meetingFrequency ?? null,
    mobile: party.mobile,
    address1: party.address1 ?? '',
  });
}

export function groupStepOf(field: string): GroupStep | null {
  if (field === 'members') {
    return 'chairperson';
  }
  return GROUP_FIELDS.group.includes(field) ? 'group' : null;
}
