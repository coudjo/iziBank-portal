import type { StaffSummary } from '../../core/api/api-types';
import { PasswordRule, passwordRules } from '../auth/password-rules';

/** Why a session ended (API lookup LogoutReasonType), in staff wording. */
export const LOGOUT_REASON_LABELS: Readonly<Record<string, string>> = {
  USER_INITIATED: 'Signed out',
  IDLE_TIMEOUT: 'Timed out after inactivity',
  MAX_SESSION_EXCEEDED: 'Reached the 12-hour limit',
  SUPERSEDED_BY_NEW_LOGIN: 'Signed in somewhere else',
  FORCED_BY_ADMIN: 'Signed out by an administrator',
  SECRET_KEY_CHANGED: 'Password changed',
  ACCOUNT_DISABLED: 'Staff member disabled',
};

/** The API's password rule codes (`auth.secret-key-rules`) as sentences. */
export const PASSWORD_RULE_MESSAGES: Readonly<Record<string, string>> = {
  'min-length': 'Use at least 8 characters.',
  upper: 'Include a capital letter.',
  lower: 'Include a small letter.',
  digit: 'Include a number.',
  'same-as-staff-code': 'The password cannot be the staff code.',
  'same-as-current': 'Choose a password different from the current one.',
};

/** Rule codes from a 400 response, in words. Other messages pass through. */
export function passwordMessages(errors: readonly string[]): string {
  return errors.map((code) => PASSWORD_RULE_MESSAGES[code] ?? code).join(' ');
}

/** The live checklist for a password an administrator sets for someone else. */
export function initialPasswordRules(candidate: string, staffCode: string): PasswordRule[] {
  return passwordRules(candidate, staffCode, '')
    .filter((rule) => rule.id !== 'current')
    .map((rule) => (rule.id === 'staff-code' ? { ...rule, label: 'Not the staff code' } : rule));
}

/** One status per staff member for the chip: disabled wins over a pending password change. */
export function staffStatus(staff: Pick<StaffSummary, 'isDisabled' | 'mustChangeSecretKey'>): string {
  return staff.isDisabled ? 'DISABLED' : staff.mustChangeSecretKey ? 'MUST_CHANGE' : 'ACTIVE';
}
