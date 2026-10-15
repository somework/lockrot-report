/**
 * The arithmetic behind the summary band: how big the flagged share of the lock is, and how the
 * waffle's one square per package is laid out. Display only: every number here is a count or a
 * difference of two numbers the document already carries.
 */

/** One run of same-priority squares, in the order the waffle draws them. */
export interface WaffleRun {
  readonly priority: string;
  readonly count: number;
}

/**
 * How many squares tall the waffle is, for a strip `columns` squares wide at most. The square size
 * never changes (a 4-package lock and a 900-package one compare at the same scale), so a bigger
 * lock grows taller instead. A small lock stays a short strip — ten squares a row until it reaches
 * the five-row block every mid-sized lock is — so four packages draw four squares in a line, not a
 * one-square-wide column, and never more rows than there are packages.
 */
const WAFFLE_MIN_ROWS = 5;
const WAFFLE_SMALL_ROW = 10;

export function waffleRows(total: number, columns: number): number {
  if (total <= 0) return 1;
  const fitted = Math.ceil(total / Math.max(1, columns));
  const small = Math.min(WAFFLE_MIN_ROWS, Math.ceil(total / WAFFLE_SMALL_ROW));

  return Math.min(total, Math.max(fitted, small));
}

/**
 * The flagged share of the lock as a whole percentage: "25%". A share that rounds to either end
 * says which side of it it is on, so one flagged package in 400 never reads "0%" and one clean
 * package in 400 never reads "100%".
 */
export function sharePhrase(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  if (part >= total) return "100%";
  const pct = Math.round((part / total) * 100);
  if (pct === 0) return "under 1%";
  if (pct === 100) return "over 99%";

  return `${pct}%`;
}
