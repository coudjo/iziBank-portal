import { passwordRules } from './password-rules';

describe('passwordRules', () => {
  const unmet = (candidate: string) =>
    passwordRules(candidate, 'TELLER01', 'Old-Pass1')
      .filter((rule) => !rule.met)
      .map((rule) => rule.id);

  it('matches the API rules', () => {
    expect(unmet('Abcdefg1')).toEqual([]);
    expect(unmet('abc1')).toEqual(['length', 'upper']);
    expect(unmet('Teller01')).toEqual(['staff-code']);
    expect(unmet('Old-Pass1')).toEqual(['current']);
  });
});
