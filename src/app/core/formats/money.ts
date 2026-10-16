const SYMBOLS: Readonly<Record<string, string>> = { GHS: 'GH₵' };

/** `GH₵ 1,234.50` (frontend plan 6.7). Display with the `ib-num` class for tabular figures and right alignment. */
export function formatMoney(amount: number, currency = 'GHS'): string {
  const number = new Intl.NumberFormat('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${SYMBOLS[currency] ?? currency} ${number}`;
}
