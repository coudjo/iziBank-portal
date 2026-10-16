import { ageOn, formatDate, formatTimestamp, isIsoDate, parseDisplayDate, todayIso } from './dates';
import { maskTail, normalizeIdNumber } from './masking';
import { formatMoney } from './money';
import { displayPhone, normalizePhone, searchTerm } from './phone';

describe('phone', () => {
  it('normalises local and international Ghana numbers to the same E.164 value', () => {
    expect(normalizePhone('024 123 4567')).toEqual({ kind: 'valid', e164: '+233241234567' });
    expect(normalizePhone('+233 24 123 4567')).toEqual({ kind: 'valid', e164: '+233241234567' });
    expect(normalizePhone('0241234567')).toEqual({ kind: 'valid', e164: '+233241234567' });
  });

  it('accepts international numbers and rejects nonsense', () => {
    expect(normalizePhone('+44 20 7946 0958')).toEqual({ kind: 'valid', e164: '+442079460958' });
    expect(normalizePhone('12345')).toEqual({ kind: 'invalid' });
    expect(normalizePhone('  ')).toEqual({ kind: 'empty' });
  });

  it('shows Ghana numbers in national format', () => {
    expect(displayPhone('+233241234567')).toBe('024 123 4567');
    expect(displayPhone('+442079460958')).toBe('+44 20 7946 0958');
  });

  it('sends phone-like search terms as E.164 and leaves the rest alone', () => {
    expect(searchTerm('024 123 4567')).toBe('+233241234567');
    expect(searchTerm('Ama Mensah')).toBe('Ama Mensah');
    expect(searchTerm('0000000042')).toBe('0000000042');
    expect(searchTerm('GHA-123456789-0')).toBe('GHA-123456789-0');
  });
});

describe('dates', () => {
  it('moves between display and ISO strings without Date objects', () => {
    expect(formatDate('1985-03-27')).toBe('27/03/1985');
    expect(parseDisplayDate('27/03/1985')).toBe('1985-03-27');
    expect(parseDisplayDate('7-3-1985')).toBe('1985-03-07');
    expect(parseDisplayDate('31/02/2020')).toBeNull();
    expect(parseDisplayDate('1985-03-27')).toBeNull();
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
  });

  it('counts age like the API, with 29 February birthdays on 1 March', () => {
    expect(ageOn('2008-10-15', '2026-10-15')).toBe(18);
    expect(ageOn('2008-10-16', '2026-10-15')).toBe(17);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('formats local dates and UTC timestamps', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatTimestamp('2026-10-14T09:30:12.123Z')).toBe('14/10/2026 09:30');
  });
});

describe('money and masking', () => {
  it('shows cedis with two decimals', () => {
    expect(formatMoney(1234.5)).toBe('GH₵ 1,234.50');
  });

  it('masks all but the last four characters', () => {
    expect(maskTail('GHA-123456789-0')).toBe('****89-0');
    expect(maskTail('123')).toBe('***');
    expect(normalizeIdNumber(' gha 1234 ')).toBe('GHA1234');
  });
});
