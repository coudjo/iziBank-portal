import type { ProductRateView } from '../../core/api/api-types';
import { addDays } from '../../core/formats/dates';

export { addDays };

/** A rate the user is about to add (API A5-02). Amounts null mean an open band; `to` null means open-ended. */
export interface RateDraft {
  rateTypeCode: string;
  minimumAmount: number | null;
  maximumAmount: number | null;
  from: string;
  to: string | null;
}

const bandsOverlap = (a: RateBand, b: RateBand) =>
  (a.minimumAmount ?? -Infinity) <= (b.maximumAmount ?? Infinity) &&
  (b.minimumAmount ?? -Infinity) <= (a.maximumAmount ?? Infinity);

const datesOverlap = (aFrom: string, aTo: string | null, bFrom: string, bTo: string | null) =>
  aFrom <= (bTo ?? '9999-12-31') && bFrom <= (aTo ?? '9999-12-31');

interface RateBand {
  minimumAmount: number | null;
  maximumAmount: number | null;
}

/**
 * The open-ended rate that adding `draft` will close the day before it starts (same type and exactly the same
 * band, starting earlier), as UX 6.9 step 3 asks the form to show. Null when nothing is closed.
 */
export function rateClosedBy(
  rows: readonly ProductRateView[],
  draft: RateDraft,
): { rate: ProductRateView; closesOn: string } | null {
  const candidates = rows
    .filter(
      (row) =>
        row.rateTypeCode === draft.rateTypeCode &&
        row.effectiveTo === null &&
        row.effectiveFrom < draft.from &&
        row.minimumAmount === draft.minimumAmount &&
        row.maximumAmount === draft.maximumAmount,
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const rate = candidates[0];
  return rate ? { rate, closesOn: addDays(draft.from, -1) } : null;
}

/** The rate `draft` would overlap after the automatic close, or null. The API refuses overlaps (`product.rate-overlap`). */
export function overlappingRate(rows: readonly ProductRateView[], draft: RateDraft): ProductRateView | null {
  const closed = rateClosedBy(rows, draft);
  return (
    rows.find((row) => {
      if (row.rateTypeCode !== draft.rateTypeCode || !bandsOverlap(row, draft)) {
        return false;
      }
      const to = closed?.rate === row ? closed.closesOn : row.effectiveTo;
      return datesOverlap(row.effectiveFrom, to, draft.from, draft.to);
    }) ?? null
  );
}

/** The earliest date a rate may be closed on: yesterday, or its start when that is later (API A5-b). */
export function earliestClose(row: ProductRateView, today: string): string {
  const yesterday = addDays(today, -1);
  return row.effectiveFrom > yesterday ? row.effectiveFrom : yesterday;
}

/** Rates grouped by type for the timeline (credit before debit), each group in start order. */
export function timeline(
  rows: readonly ProductRateView[],
): { rateTypeCode: string; rows: ProductRateView[] }[] {
  const groups = new Map<string, ProductRateView[]>();
  for (const row of [...rows].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
    groups.set(row.rateTypeCode, [...(groups.get(row.rateTypeCode) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rateTypeCode, items]) => ({ rateTypeCode, rows: items }));
}
