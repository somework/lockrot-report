/**
 * The arithmetic behind the summary band (ui/ledger/): how the flagged packages split by priority,
 * which verdicts explain them, how big the flagged share of the lock is, and how the waffle's one
 * square per package is laid out. Display only: every number here is a count or a difference of
 * two numbers the document already carries — no new verdict, no threshold of its own.
 */

import type { Finding, LibyearsBlock } from "../model/types";
import { VERDICTS } from "../model/types";
import { fixed } from "./format";

/** The four priorities a finding can carry that a reader filters on; `none` is a package with no
 *  rot verdict at all and never gets a chip or a square of its own. */
export const RANKED_PRIORITIES = ["critical", "high", "medium", "low"] as const;

/** One run of same-priority squares, in the order the waffle draws them. */
export interface WaffleRun {
  readonly priority: string;
  readonly count: number;
}

/**
 * The flagged findings as runs of squares, most urgent first: the four known priorities in order,
 * then any priority a newer lockrot added, in the order its first finding appears. A run with no
 * finding in it is left out, so the waffle never draws a zero-width run.
 */
export function waffleRuns(flagged: readonly Pick<Finding, "priority">[]): readonly WaffleRun[] {
  const counts = new Map<string, number>();
  for (const finding of flagged) counts.set(finding.priority, (counts.get(finding.priority) ?? 0) + 1);
  const known = RANKED_PRIORITIES.filter((p) => counts.has(p));
  const rest = [...counts.keys()].filter((p) => !(RANKED_PRIORITIES as readonly string[]).includes(p));

  return [...known, ...rest].map((priority) => ({ priority, count: counts.get(priority) ?? 0 }));
}

/**
 * How many squares tall the waffle is, for a strip `columns` squares wide at most. The square size
 * never changes (a 4-package lock and a 900-package one compare at the same scale), so a bigger
 * lock grows taller instead. A small lock stays a short strip — ten squares a row until it reaches
 * the five-row block every mid-sized lock is — so four packages draw four squares in a line, not a
 * one-square-wide column, and never more rows than there are packages.
 */
export const WAFFLE_MIN_ROWS = 5;
export const WAFFLE_SMALL_ROW = 10;

export function waffleRows(total: number, columns: number): number {
  if (total <= 0) return 1;
  const fitted = Math.ceil(total / Math.max(1, columns));
  const small = Math.min(WAFFLE_MIN_ROWS, Math.ceil(total / WAFFLE_SMALL_ROW));

  return Math.min(total, Math.max(fitted, small));
}

/**
 * The flagged packages behind each verdict, split by priority in the waffle's own order (most
 * urgent first): what lets a verdict's bar be drawn in the same priority tones as the chips and
 * squares above it, so one colour means one thing across the whole band. Counts only — every
 * finding keeps the priority the document gave it.
 */
export function priorityRunsByVerdict(
  flagged: readonly Pick<Finding, "verdict" | "priority">[],
): ReadonlyMap<string, readonly WaffleRun[]> {
  const byVerdict = new Map<string, Pick<Finding, "priority">[]>();
  for (const finding of flagged) {
    byVerdict.set(finding.verdict, [...(byVerdict.get(finding.verdict) ?? []), finding]);
  }

  return new Map([...byVerdict].map(([verdict, findings]) => [verdict, waffleRuns(findings)]));
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

export interface VerdictCount {
  readonly verdict: string;
  readonly count: number;
}

/**
 * The verdict counts, split in two: the verdicts the run flags, most common first (ties keep the
 * document's own verdict order), and the rest — `ok`, `finished`, `unknown`, and any verdict a
 * newer lockrot added but does not flag — in verdict order. A verdict with no package is dropped
 * from both, as the verdict ledger always did.
 */
export function rankVerdicts(
  counts: Readonly<Record<string, number>>,
  flaggedVerdicts: readonly string[],
): { flagged: readonly VerdictCount[]; quiet: readonly VerdictCount[] } {
  const known = VERDICTS as readonly string[];
  const order = [...known, ...Object.keys(counts).filter((v) => !known.includes(v))];
  const present = order
    .map((verdict) => ({ verdict, count: counts[verdict] ?? 0 }))
    .filter((entry) => entry.count > 0);
  const isFlagged = (entry: VerdictCount) => flaggedVerdicts.includes(entry.verdict);
  const flagged = present
    .filter(isFlagged)
    .sort((a, b) => b.count - a.count || order.indexOf(a.verdict) - order.indexOf(b.verdict));

  return { flagged, quiet: present.filter((entry) => !isFlagged(entry)) };
}

/**
 * The libyears total split into the part the project's own requirements carry and the part the
 * packages they pull in carry: `null` when the run measured nothing or never said the direct part.
 * The transitive part is the difference of the two sums the document gives, floored at zero for a
 * document whose rounding puts the direct sum a hair above the total.
 */
export function libyearsSplit(
  block: LibyearsBlock | null,
): { total: number; direct: number; transitive: number } | null {
  if (!block || !block.measured || block.total === null || block.directRequirements === null) return null;
  const total = block.total;
  const direct = Math.min(block.directRequirements, total);

  return { total, direct, transitive: Math.max(0, total - direct) };
}

/**
 * The phone fold's one-line peek at what it holds, as its three parts: "6 reasons", "2 advisories",
 * "263.6 libyears" (the caller joins them with " · "). Each is a count the fold itself shows in
 * full; a part with nothing to count says so briefly rather than vanishing, so the line always has
 * the same three slots — in the words the unfolded band uses for the same case: "no packages" for
 * an empty lock ("No packages in this lock"), "libyears not reported" for a run with no libyears
 * block ("This run did not report libyears."), "no libyears to measure" when the block had nothing to
 * measure ("Nothing to measure."), "not measured" when it had packages but measured none.
 */
export function foldPeek(parts: {
  packages: number;
  reasons: number;
  advisories: number;
  advisoryCheckIncomplete: boolean;
  libyears: LibyearsBlock | null;
}): readonly [string, string, string] {
  const reasons =
    parts.reasons > 0
      ? `${parts.reasons} ${parts.reasons === 1 ? "reason" : "reasons"}`
      : parts.packages === 0
        ? "no packages"
        : "nothing flagged";
  const advisories =
    parts.advisories > 0
      ? `${parts.advisories} ${parts.advisories === 1 ? "advisory" : "advisories"}`
      : parts.advisoryCheckIncomplete
        ? "advisory check incomplete"
        : "no advisories";
  const libyears = parts.libyears && parts.libyears.measured ? fixed(parts.libyears.total, 1) : null;
  const libyearsPart =
    libyears !== null
      ? `${libyears} libyears`
      : parts.libyears === null
        ? "libyears not reported"
        : parts.libyears.unmeasured.every(([, count]) => count === 0)
          ? "no libyears to measure"
          : "libyears not measured";

  return [reasons, advisories, libyearsPart];
}
