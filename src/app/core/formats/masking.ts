/** Last four characters visible, the same rule as the API (`****1234`). */
export function maskTail(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.length <= 4 ? '*'.repeat(value.length) : `****${value.slice(-4)}`;
}

/** Identification numbers are trimmed and upper-cased, with inner spaces removed (frontend plan 6.7). */
export function normalizeIdNumber(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}
