import { WORKING_DATE_REFRESH_MS, dueForRefresh, formatWorkingDate, stateOf } from './working-date-rules';

describe('working date rules', () => {
  it('shows the date as dd/mm/yyyy', () => {
    expect(formatWorkingDate('2026-10-12')).toBe('12/10/2026');
    expect(formatWorkingDate('not a date')).toBe('not a date');
  });

  it('refreshes only after 5 minutes and only if the user did something since the last load', () => {
    const loaded = 1_000_000;
    expect(dueForRefresh(loaded + WORKING_DATE_REFRESH_MS - 1, loaded, loaded + 10)).toBe(false);
    expect(dueForRefresh(loaded + WORKING_DATE_REFRESH_MS, loaded, loaded - 10)).toBe(false);
    expect(dueForRefresh(loaded + WORKING_DATE_REFRESH_MS, loaded, loaded + 10)).toBe(true);
  });

  it('maps the API answer to what the top bar shows', () => {
    expect(stateOf(null)).toBe('unknown');
    expect(stateOf({ isOpen: true, status: 'OPEN' })).toBe('open');
    expect(stateOf({ isOpen: false, status: 'CLOSED' })).toBe('not-open');
    expect(stateOf({ isOpen: false, status: null })).toBe('not-open');
    expect(stateOf({ isOpen: false, status: 'EOD_IN_PROGRESS' })).toBe('end-of-day');
  });
});
