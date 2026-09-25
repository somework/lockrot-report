/**
 * Date and count formatting with no DOM and no clock in it — wherever "now" matters it is a
 * parameter, never read internally, so the same input always gives the same output.
 *
 * Ported from legacy `lib.js`'s `day`/`ageText`/`plural`/`fixed` (lib.md §§4,6,7,9), plus
 * `countPhrase()`, new here for DESIGN.md M21: the legacy count line never singularised ("1 of 1
 * flagged packages"); the rewrite says "package" when the count is exactly one.
 *
 * `lib.js`'s `years()` is not ported as its own export: it was dead code even in the legacy page
 * (critic.md D2 — exported but never called directly, only reached through `ageText`, and even
 * `report.js`'s own `years()` wrapper around it was never called). Its logic lives inline in
 * `ageText` below instead of as public API nothing uses.
 */

/** Milliseconds in a Julian year (365.25 days) — the divisor `ageText` measures age against. */
const MS_PER_JULIAN_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * The `YYYY-MM-DD` prefix of an ISO-8601 timestamp, or an em dash when there is none. Ported from
 * legacy `day()` (`lib.js:67`). No parsing or validation happens at all: a malformed or non-ISO
 * string is sliced the same way, whatever its first ten characters are.
 */
export function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "—";
}

/**
 * Years between `iso` and `now`, fractional and negative for a future `iso`; `null` when undated.
 * Not exported — see this file's header comment. Ported from legacy `years()` (`lib.js:70-73`).
 */
function years(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  return (now.getTime() - new Date(iso).getTime()) / MS_PER_JULIAN_YEAR;
}

/**
 * How long ago, in the units a reader can hold: whole months under a year, tenths of a year over
 * it. Ported from legacy `ageText()` (`lib.js:76-82`). The months branch floors at "1 mo ago" —
 * never "0 mo ago" — for a release from today, or even one dated in the future; the years branch
 * has no equivalent floor.
 */
export function ageText(iso: string | null | undefined, now: Date): string {
  const y = years(iso, now);
  if (y === null) return "undated";
  return yearsAgo(y);
}

/**
 * The page's one age unit: whole months under a year (never fewer than one), tenths of a year from
 * one on. `yearsAgo` is its terse form ("7 mo ago", "3.6 y ago"), for the facts row and the
 * reference sections; `yearsPhrase` spells the same figure out ("7 months", "3.6 years") for a
 * sentence. Both round alike, so a panel that quotes one age twice quotes the same number in the
 * same unit (an evaluator read "2 mo ago" beside "8 weeks ago" as two different ages).
 */
function monthsUnderAYear(years: number): number | null {
  return years < 1 ? Math.max(1, Math.round(years * 12)) : null;
}

/** "7 mo ago", "3.6 y ago" — see `monthsUnderAYear`. */
export function yearsAgo(years: number): string {
  const months = monthsUnderAYear(years);
  return months !== null ? `${months} mo ago` : `${years.toFixed(1)} y ago`;
}

/** "1 month", "7 months", "3.6 years" — see `monthsUnderAYear`. */
export function yearsPhrase(years: number): string {
  const months = monthsUnderAYear(years);
  if (months !== null) return months === 1 ? "1 month" : `${months} months`;
  return `${years.toFixed(1)} years`;
}

/** `one` when `n` is exactly `1`, `many` otherwise — the word `plural()` prefixes with the count.
 *  Its own export: a caller that draws the count separately from the noun (`PriorityLedger`'s own
 *  `<span className="ledger-figure">`, styled apart from the eyebrow text around it) still needs the
 *  same singular/plural choice `plural()` makes, without also getting the count folded into the same
 *  string. */
export function pluralNoun(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** `"N {one}"` when `n` is exactly `1`, `"N {many}"` otherwise. Ported from legacy `plural()` (`lib.js:84-86`). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${pluralNoun(n, one, many)}`;
}

/**
 * A number from the document formatted to `digits` decimals, or `null` when the value is not a
 * finite number. Ported from legacy `fixed()` (`lib.js:103-105`). The finite-number check runs
 * before any coercion, deliberately: `Number(null)` is a finite zero, and printing `"0.0"` for a
 * value the document does not have would misrepresent it.
 */
export function fixed(value: unknown, digits: number): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : null;
}

/**
 * `"N of M {noun}"`, the noun singularised when `n` is exactly `1` — `countPhrase(1, 1, "flagged
 * package", "flagged packages")` reads "1 of 1 flagged package". DESIGN.md M21: the legacy page's
 * count line and badges never singularised ("1 of 1 flagged packages"); this is the fix.
 */
export function countPhrase(n: number, of: number, noun1: string, nounN: string): string {
  return `${n} of ${of} ${n === 1 ? noun1 : nounN}`;
}
