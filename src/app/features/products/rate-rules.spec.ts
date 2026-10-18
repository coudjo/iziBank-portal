import type { ProductRateView } from '../../core/api/api-types';
import { addDays, earliestClose, overlappingRate, rateClosedBy, timeline } from './rate-rules';

const rate = (id: number, extra: Partial<ProductRateView>): ProductRateView => ({
  productInterestRateId: id,
  rateTypeId: 1,
  rateTypeCode: 'CREDIT',
  minimumAmount: null,
  maximumAmount: null,
  interestRate: 5,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  status: 'CURRENT',
  isStarted: true,
  ...extra,
});

describe('product rate timeline (UX 6.9 step 3, API A5-02)', () => {
  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('shows which open rate a new rate closes, the day before it starts', () => {
    const rows = [rate(1, {})];
    const draft = {
      rateTypeCode: 'CREDIT',
      minimumAmount: null,
      maximumAmount: null,
      from: '2026-11-01',
      to: null,
    };
    expect(rateClosedBy(rows, draft)).toEqual({ rate: rows[0], closesOn: '2026-10-31' });
    expect(overlappingRate(rows, draft)).toBeNull();
  });

  it('explains overlaps with another band or a closed period instead of closing them', () => {
    const rows = [rate(1, { minimumAmount: 0, maximumAmount: 1000 }), rate(2, { rateTypeCode: 'DEBIT' })];
    const draft = {
      rateTypeCode: 'CREDIT',
      minimumAmount: 500,
      maximumAmount: 5000,
      from: '2026-11-01',
      to: null,
    };
    expect(rateClosedBy(rows, draft)).toBeNull();
    expect(overlappingRate(rows, draft)?.productInterestRateId).toBe(1);
    expect(overlappingRate(rows, { ...draft, minimumAmount: 1000.01 })).toBeNull();
  });

  it('allows closing no earlier than yesterday or the start date', () => {
    expect(earliestClose(rate(1, { effectiveFrom: '2026-01-01' }), '2026-10-17')).toBe('2026-10-16');
    expect(earliestClose(rate(1, { effectiveFrom: '2026-10-17' }), '2026-10-17')).toBe('2026-10-17');
  });

  it('groups rates by type in start order', () => {
    const groups = timeline([
      rate(1, { effectiveFrom: '2026-05-01' }),
      rate(2, { rateTypeCode: 'DEBIT' }),
      rate(3, { effectiveFrom: '2026-01-01' }),
    ]);
    expect(groups.map((group) => group.rateTypeCode)).toEqual(['CREDIT', 'DEBIT']);
    expect(groups[0].rows.map((row) => row.productInterestRateId)).toEqual([3, 1]);
  });
});
