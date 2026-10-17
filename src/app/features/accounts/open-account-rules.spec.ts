import type { HolderChoice, HolderRole } from './holder-picker.component';
import { ineligibility } from './holder-picker.component';
import { shapeOf } from './open-account-rules';

const holder = (
  partyId: number,
  role: HolderRole,
  type = 'INDIVIDUAL',
  name = `Person ${partyId}`,
): HolderChoice => ({
  partyId,
  partyNumber: String(partyId),
  displayName: name,
  partyTypeCode: type,
  role,
});

describe('account opening shape (UX 6.7 step 4)', () => {
  it('an individual alone uses the single mode, hidden, and is named after the holder', () => {
    const shape = shapeOf([holder(1, 'PRIMARY', 'INDIVIDUAL', 'Ama Mensah')], null, true);
    expect(shape.needsSigningMode).toBe(false);
    expect(shape.problems).toEqual([]);
    expect(shape.defaultName).toBe('Ama Mensah');
  });

  it('joint holders need either or all to sign and join the names', () => {
    const holders = [
      holder(1, 'PRIMARY', 'INDIVIDUAL', 'Ama Mensah'),
      holder(2, 'JOINT', 'INDIVIDUAL', 'Kofi Mensah'),
    ];
    expect(shapeOf(holders, null, true).problems).toEqual(['Choose either to sign or all to sign.']);
    const shape = shapeOf(holders, 'ALL_TO_SIGN', true);
    expect(shape.problems).toEqual([]);
    expect(shape.defaultName).toBe('Ama Mensah & Kofi Mensah');
  });

  it('a business needs a signatory and a signing mode', () => {
    expect(shapeOf([holder(1, 'PRIMARY', 'BUSINESS')], 'EITHER_TO_SIGN', true).problems).toEqual([
      'Add at least one signatory for the business.',
    ]);
    expect(
      shapeOf([holder(1, 'PRIMARY', 'BUSINESS'), holder(2, 'SIGNATORY')], 'EITHER_TO_SIGN', true).problems,
    ).toEqual([]);
  });

  it('asks for the product and the primary holder first', () => {
    expect(shapeOf([], null, false).problems).toEqual(['Choose a product.', 'Choose the primary holder.']);
  });
});

describe('holder eligibility (UX 6.7 step 3)', () => {
  const row = (extra: Record<string, unknown>) =>
    ({
      partyId: 1,
      partyNumber: '1',
      displayName: 'Ama',
      partyTypeCode: 'INDIVIDUAL',
      mobile: null,
      identificationNumberMasked: null,
      effectiveKycStatusCode: 'VERIFIED',
      supervisionState: 'APPROVED',
      creditOfficerName: null,
      createdOn: '2026-10-01T00:00:00Z',
      hasEffectiveSignature: true,
      canBePrimaryHolder: true,
      canBeJointHolder: true,
      canBeSignatory: true,
      ...extra,
    }) as Parameters<typeof ineligibility>[0];

  it('blocks customers awaiting approval or not verified, with the reason', () => {
    expect(ineligibility(row({ supervisionState: 'PENDING' }), 'PRIMARY')).toBe('Awaiting approval');
    expect(ineligibility(row({ effectiveKycStatusCode: 'PENDING' }), 'PRIMARY')).toBe('Not KYC verified');
    expect(ineligibility(row({ effectiveKycStatusCode: 'REJECTED' }), 'JOINT')).toBe('KYC rejected');
  });

  it('asks for a specimen signature from everyone who signs, but not from a business', () => {
    expect(ineligibility(row({ hasEffectiveSignature: false }), 'SIGNATORY')).toBe(
      'Capture specimen signature first',
    );
    expect(ineligibility(row({ hasEffectiveSignature: false }), 'PRIMARY')).toBe(
      'Capture specimen signature first',
    );
    expect(
      ineligibility(row({ hasEffectiveSignature: false, partyTypeCode: 'BUSINESS' }), 'PRIMARY'),
    ).toBeNull();
    expect(ineligibility(row({ hasEffectiveSignature: false }), 'BENEFICIAL_OWNER')).toBeNull();
  });
});
