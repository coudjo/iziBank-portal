import { lookupName, nextWorkingDay, skippedDays, whyNotOpen } from './reference-rules';

const holidays = [
  { holidayDate: '2026-12-25', remarks: 'Christmas Day' },
  { holidayDate: '2026-12-28', remarks: null },
];

describe('business day rules (UX 6.11, API BusinessDayRules)', () => {
  it('proposes the next working day after the last one, skipping weekends and holidays', () => {
    expect(nextWorkingDay({ workingDate: '2026-10-14' }, '2026-10-21', holidays)).toBe('2026-10-15');
    expect(nextWorkingDay({ workingDate: '2026-10-16' }, '2026-10-21', holidays)).toBe('2026-10-19');
    expect(nextWorkingDay({ workingDate: '2026-12-24' }, '2026-12-24', holidays)).toBe('2026-12-29');
    expect(nextWorkingDay(null, '2026-10-17', holidays)).toBe('2026-10-19');
  });

  it('says why the days in between were skipped', () => {
    expect(skippedDays({ workingDate: '2026-12-24' }, '2026-12-29', holidays)).toEqual([
      '25/12/2026: holiday (Christmas Day)',
      '26/12/2026: Saturday',
      '27/12/2026: Sunday',
      '28/12/2026: holiday',
    ]);
  });

  it('explains a date the API would refuse, in the order the API checks', () => {
    const closed = { workingDate: '2026-10-14', status: 'CLOSED' };
    expect(whyNotOpen('2026-10-15', { ...closed, status: 'OPEN' }, holidays)).toContain('still open');
    expect(whyNotOpen('2026-10-14', closed, holidays)).toContain('after the last business day, 14/10/2026');
    expect(whyNotOpen('2026-10-17', closed, holidays)).toBe('17/10/2026 is a Saturday, not a working day.');
    expect(whyNotOpen('2026-12-25', closed, holidays)).toBe('25/12/2026 is a holiday (Christmas Day).');
    expect(whyNotOpen('2026-10-15', closed, holidays)).toBeNull();
  });

  it('names lookup lists in staff wording', () => {
    expect(lookupName('party-types')).toBe('Customer types');
    expect(lookupName('something-new')).toBe('Something new');
  });
});
