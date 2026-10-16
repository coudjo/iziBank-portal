import { parsePercent } from './owners.tab';

describe('parsePercent', () => {
  it('accepts up to two decimals, with a point or a comma', () => {
    expect(parsePercent('40')).toBe(40);
    expect(parsePercent('12.5')).toBe(12.5);
    expect(parsePercent('12,25')).toBe(12.25);
    expect(parsePercent(' 100 ')).toBe(100);
  });

  it('refuses anything else', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('12.345')).toBeNull();
    expect(parsePercent('-5')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
  });
});
