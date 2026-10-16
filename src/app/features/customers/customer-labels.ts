/** Wording for customer codes (UX section 8 terms: customer, approve, awaiting approval). */
export const PARTY_TYPE_LABELS: Readonly<Record<string, string>> = {
  INDIVIDUAL: 'Individual',
  BUSINESS: 'Business',
  GROUP: 'Group',
};

export function partyTypeLabel(code: string): string {
  return PARTY_TYPE_LABELS[code] ?? code;
}

/** The API's party supervision states as approval chip codes. */
export function approvalCode(supervisionState: string): string {
  return supervisionState === 'PENDING' ? 'PENDING' : 'APPROVED';
}

/** Which record tab completes a checklist item (UX 6.2 step 4). */
export const CHECKLIST_TABS: Readonly<Record<string, string>> = {
  CREATION_FIELDS: 'details',
  SOURCE_OF_FUNDS: 'details',
  OCCUPATION: 'details',
  TIN: 'details',
  PHOTO: 'documents',
  ID_DOCUMENT_IMAGE: 'documents',
  SIGNATURE: 'documents',
  NEXT_OF_KIN: 'next-of-kin',
  BENEFICIAL_OWNERS: 'owners',
  MAJOR_OWNERS_VERIFIED: 'owners',
  CHAIRPERSON: 'members',
  MEMBERS_VERIFIED: 'members',
};
