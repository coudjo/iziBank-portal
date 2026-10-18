/** Wording for product and chart-of-accounts codes (UX section 8 terms: approve, chart of accounts). */
export const PRODUCT_TYPE_LABELS: Readonly<Record<string, string>> = {
  SAVINGS: 'Savings',
  CURRENT: 'Current',
  FIXED_DEPOSIT: 'Fixed deposit',
  LOAN: 'Loan',
};

export const RATE_TYPE_LABELS: Readonly<Record<string, string>> = {
  CREDIT: 'Credit interest (paid to the customer)',
  DEBIT: 'Debit interest (charged to the customer)',
};

export const RATE_STATUS_LABELS: Readonly<Record<string, string>> = {
  SCHEDULED: 'Scheduled',
  CURRENT: 'Current',
  ENDED: 'Ended',
};

/** API plan 6.8: deposit products need a liability control account, loans an asset one. */
export function controlAccountType(productTypeCode: string | null | undefined): 'ASSET' | 'LIABILITY' {
  return productTypeCode === 'LOAN' ? 'ASSET' : 'LIABILITY';
}

export const labelOf = (labels: Readonly<Record<string, string>>, code: string | null | undefined): string =>
  code ? (labels[code] ?? code) : '—';

/** The API's supervision states as approval chip codes. */
export const approvalChip = (state: string): string => (state === 'PENDING' ? 'PENDING' : 'APPROVED');
