import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Phone numbers (frontend plan 6.7, T9). `024 123 4567` and `+233 24 123 4567` normalise to the same E.164 value.
 * Ghana is the default country for numbers typed without a country code.
 */
export type PhoneResult = { kind: 'empty' } | { kind: 'valid'; e164: string } | { kind: 'invalid' };

export function normalizePhone(text: string | null | undefined): PhoneResult {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) {
    return { kind: 'empty' };
  }
  const parsed = parsePhoneNumberFromString(trimmed, 'GH');
  return parsed?.isValid() ? { kind: 'valid', e164: parsed.number } : { kind: 'invalid' };
}

/** Ghana numbers in national format (024 123 4567), others in international format. */
export function displayPhone(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = parsePhoneNumberFromString(value, 'GH');
  if (!parsed) {
    return value;
  }
  return parsed.country === 'GH' ? parsed.formatNational() : parsed.formatInternational();
}

/**
 * A search term that is a valid phone number is sent as E.164, because customers' mobiles are stored that way.
 * Anything else (names, customer numbers, ID numbers) is sent as typed.
 */
export function searchTerm(text: string): string {
  const trimmed = text.trim();
  if (!/^[+\d][\d\s-]{6,}$/.test(trimmed)) {
    return trimmed;
  }
  const phone = normalizePhone(trimmed);
  return phone.kind === 'valid' ? phone.e164 : trimmed;
}
