import type { HolderChoice } from './holder-picker.component';

export type SigningMode = 'EITHER_TO_SIGN' | 'ALL_TO_SIGN';

export interface OpenAccountShape {
  /** True when the user must choose either or all to sign; false means the single mode is used (and hidden). */
  needsSigningMode: boolean;
  /** The account name prefilled from the holders (UX 6.7 step 5). */
  defaultName: string;
  /** What still stops the account from opening, in the user's words. Empty when it can be submitted. */
  problems: string[];
}

/**
 * The shape rules of account opening as the form shows them (UX 6.7 step 4, API plan 6.9 rule 4). The API checks
 * them again; this is so the form can explain before the user presses Open account.
 */
export function shapeOf(
  holders: readonly HolderChoice[],
  mode: SigningMode | null,
  productChosen: boolean,
): OpenAccountShape {
  const primary = holders.find((holder) => holder.role === 'PRIMARY') ?? null;
  const joints = holders.filter((holder) => holder.role === 'JOINT');
  const signatories = holders.filter((holder) => holder.role === 'SIGNATORY');
  const problems: string[] = [];

  if (!productChosen) {
    problems.push('Choose a product.');
  }
  if (!primary) {
    problems.push('Choose the primary holder.');
    return { needsSigningMode: false, defaultName: '', problems };
  }

  const individual = primary.partyTypeCode === 'INDIVIDUAL';
  const needsSigningMode = !individual || joints.length > 0;
  if (!individual && signatories.length === 0) {
    problems.push(
      primary.partyTypeCode === 'GROUP'
        ? 'Add at least one signatory from the group’s active members.'
        : 'Add at least one signatory for the business.',
    );
  }
  if (needsSigningMode && mode === null) {
    problems.push('Choose either to sign or all to sign.');
  }

  const defaultName =
    individual && joints.length > 0
      ? [primary, ...joints].map((holder) => holder.displayName).join(' & ')
      : primary.displayName;
  return { needsSigningMode, defaultName: defaultName.slice(0, 150), problems };
}
