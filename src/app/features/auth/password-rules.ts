export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

/** The API's rules (plan section 4) shown as a live checklist. The API checks them again. */
export function passwordRules(
  candidate: string,
  staffCode: string,
  current: string,
  minLength = 8,
): PasswordRule[] {
  return [
    { id: 'length', label: `At least ${minLength} characters`, met: candidate.length >= minLength },
    { id: 'upper', label: 'A capital letter', met: /\p{Lu}/u.test(candidate) },
    { id: 'lower', label: 'A small letter', met: /\p{Ll}/u.test(candidate) },
    { id: 'digit', label: 'A number', met: /\p{Nd}/u.test(candidate) },
    {
      id: 'staff-code',
      label: 'Not your staff code',
      met: candidate.length > 0 && candidate.toUpperCase() !== staffCode.toUpperCase(),
    },
    {
      id: 'current',
      label: 'Different from your current password',
      met: candidate.length > 0 && candidate !== current,
    },
  ];
}
