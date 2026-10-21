import { activitySummary, dayRange, fieldChanges, fieldLabel } from './audit-rules';

describe('audit viewer rules (UX 6.12)', () => {
  it('summarises an activity row in words', () => {
    expect(
      activitySummary({ eventCode: 'ACCOUNT_OPEN', entityType: 'Account', entityId: '2000000000003' }),
    ).toBe('Opened the account · Account 2000000000003');
    expect(activitySummary({ eventCode: 'LOGIN', entityType: null, entityId: null })).toBe('Signed in');
    expect(activitySummary({ eventCode: 'NEW_CODE', entityType: 'Widget', entityId: null })).toBe(
      'new code · Widget',
    );
  });

  it('turns field names into words, keeping acronyms', () => {
    expect(fieldLabel('CreditInterestRate')).toBe('Credit interest rate');
    expect(fieldLabel('KYCStatusId')).toBe('KYC status id');
  });

  it('lists old and new values per field, and never shows a secret', () => {
    expect(
      fieldChanges({
        oldValueJson: JSON.stringify({ ProductName: 'Savings', IsActive: true, SecretKeyHash: '[redacted]' }),
        newValueJson: JSON.stringify({
          ProductName: 'Regular savings',
          IsActive: true,
          SecretKeyHash: '[redacted]',
        }),
      }),
    ).toEqual([
      { field: 'Product name', before: 'Savings', after: 'Regular savings', hidden: false },
      { field: 'Secret key hash', before: 'Hidden', after: 'Hidden', hidden: true },
    ]);
    expect(
      fieldChanges({ oldValueJson: null, newValueJson: JSON.stringify({ IsSupervised: false }) }),
    ).toEqual([{ field: 'Is supervised', before: '—', after: 'No', hidden: false }]);
  });

  it('sends a day range as whole days', () => {
    expect(dayRange('2026-10-01', '2026-10-21')).toEqual({
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-21T23:59:59.999Z',
    });
    expect(dayRange(null, null)).toEqual({ from: null, to: null });
  });
});
