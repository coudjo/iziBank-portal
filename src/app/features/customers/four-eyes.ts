/** Four-eyes (ADR D3, UX 5.2): the person who created or last changed something cannot approve it. */
export const FOUR_EYES_MESSAGE =
  'A different supervisor must approve this, because you created or changed it.';

export function isOwnWork(me: number | null | undefined, ...authors: (number | null | undefined)[]): boolean {
  return me !== null && me !== undefined && authors.some((author) => author === me);
}
