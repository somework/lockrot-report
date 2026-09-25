/**
 * The counts the Advisories tab reads out loud (PD-ADV-1..3, DESIGN.md §5): how many advisories on
 * how many packages, how many of them sit on a package installed for production, how each is fixed
 * (the advisory's own `fixed_by` and `fixed_on_branch`, never compared or ranked), and how long ago
 * each was reported. Display only — every number is a count or a date difference over fields the
 * document already carries; nothing here judges what a reader should do about them.
 */

import type { Advisory, Finding, Severity } from "../model/types";
import { SEVERITIES } from "../model/types";
import { fixShapeOf, type AdvisoryWithFinding, type FixShape } from "./advisories";
import { severityRank } from "./severity";

const MS_PER_JULIAN_YEAR = 365.25 * 24 * 3600 * 1000;

/** Years between an advisory's `reported_at` and `now`, never negative; `null` when undated or
 *  unparseable. */
export function reportedYears(advisory: Advisory, now: Date): number | null {
  if (!advisory.reportedAt) return null;
  const at = new Date(advisory.reportedAt).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now.getTime() - at) / MS_PER_JULIAN_YEAR);
}

export interface SeverityCount {
  readonly severity: Severity;
  readonly count: number;
}

export interface AdvisoryTally {
  readonly total: number;
  /** Distinct package names, in the order the advisories list them. */
  readonly packages: readonly string[];
  /** Advisories on a package installed for production (`Finding.dev` false). */
  readonly production: number;
  /** Advisories on a package installed only for development. */
  readonly dev: number;
  /** Advisories per fix shape. */
  readonly shapes: Readonly<Record<FixShape, number>>;
  /** The distinct `fixed_by` values, verbatim, in list order. */
  readonly fixes: readonly string[];
  /** Per severity bucket, most severe first; buckets with no advisory are left out. */
  readonly severities: readonly SeverityCount[];
  /** Years since the earliest and the latest `reported_at`; `null` when none is dated. */
  readonly oldestYears: number | null;
  readonly newestYears: number | null;
}

/** Counts over a list of advisory/finding pairs — the whole tab, or one fix-shape group. */
export function tallyAdvisories(pairs: readonly AdvisoryWithFinding[], now: Date): AdvisoryTally {
  const packages: string[] = [];
  const fixes: string[] = [];
  const shapes: Record<FixShape, number> = { branch: 0, move: 0, none: 0 };
  const bySeverity = new Map<Severity, number>();
  let production = 0;
  let oldest: number | null = null;
  let newest: number | null = null;

  for (const { advisory, finding } of pairs) {
    if (!packages.includes(finding.package)) packages.push(finding.package);
    if (advisory.fixedBy && !fixes.includes(advisory.fixedBy)) fixes.push(advisory.fixedBy);
    shapes[fixShapeOf(advisory)] += 1;
    bySeverity.set(advisory.severity, (bySeverity.get(advisory.severity) ?? 0) + 1);
    if (!finding.dev) production += 1;
    const years = reportedYears(advisory, now);
    if (years !== null) {
      oldest = oldest === null ? years : Math.max(oldest, years);
      newest = newest === null ? years : Math.min(newest, years);
    }
  }

  const severities = SEVERITIES.flatMap((severity) => {
    const count = bySeverity.get(severity) ?? 0;
    return count > 0 ? [{ severity, count }] : [];
  });

  return {
    total: pairs.length,
    packages,
    production,
    dev: pairs.length - production,
    shapes,
    fixes,
    severities,
    oldestYears: oldest,
    newestYears: newest,
  };
}

/** The most severe advisory a finding carries, or null when it carries none — the tone its chip
 *  takes on a Findings or All-packages row. */
export function worstAdvisory(finding: Finding): Advisory | null {
  let worst: Advisory | null = null;
  for (const advisory of finding.advisories) {
    if (worst === null || severityRank(advisory.severity) < severityRank(worst.severity)) worst = advisory;
  }
  return worst;
}

/** What a row's advisory chip says on hover: the severities, then each fix as the advisories name
 *  it — "1 high, 1 medium · fixed only by 11.5.0, on another branch". Counts and quoted versions. */
export function advisoryChipTitle(finding: Finding): string {
  const pairs = finding.advisories.map((advisory) => ({ advisory, finding }));
  const tally = tallyAdvisories(pairs, new Date(0));
  const severities = tally.severities.map((s) => `${s.count} ${s.severity}`).join(", ");
  const parts: string[] = [];
  const branchFixes = fixesOfShape(pairs, "branch");
  const moveFixes = fixesOfShape(pairs, "move");
  if (branchFixes.length > 0) parts.push(`fixed by ${branchFixes.join(", ")} on your branch`);
  if (moveFixes.length > 0) parts.push(`fixed only by ${moveFixes.join(", ")}, on another branch`);
  if (tally.shapes.none > 0)
    parts.push(
      tally.shapes.none === tally.total ? "no fix listed" : `${tally.shapes.none} with no fix listed`,
    );
  return [severities, ...parts].join(" · ");
}

/** The distinct `fixed_by` values of the pairs of one fix shape, verbatim, in list order. */
export function fixesOfShape(pairs: readonly AdvisoryWithFinding[], shape: FixShape): readonly string[] {
  const out: string[] = [];
  for (const { advisory } of pairs) {
    if (fixShapeOf(advisory) !== shape || !advisory.fixedBy) continue;
    if (!out.includes(advisory.fixedBy)) out.push(advisory.fixedBy);
  }
  return out;
}

export interface ReportedAxis {
  /** The axis' right edge, in years: one year at least, else the oldest age rounded up. */
  readonly max: number;
  /** Tick positions in years, 0 first, `max` last. */
  readonly ticks: readonly number[];
}

/** One shared axis for every row's "reported … ago" bar: 0 to a whole number of years that holds
 *  the oldest advisory, a tick each year up to five, else 0, the middle and the end. `null` when no
 *  advisory is dated, so there is nothing to draw. */
export function reportedAxis(oldestYears: number | null): ReportedAxis | null {
  if (oldestYears === null) return null;
  const max = Math.max(1, Math.ceil(oldestYears - 1e-9));
  if (max === 1) return { max, ticks: [0, 0.5, 1] };
  if (max <= 5) return { max, ticks: Array.from({ length: max + 1 }, (_, i) => i) };
  const mid = Math.round(max / 2);
  return { max, ticks: [0, mid, max] };
}

/** A tick's caption: "0", "6 mo", "1y", "3y". */
export function tickLabel(years: number): string {
  if (years === 0) return "0";
  if (years < 1) return `${Math.round(years * 12)} mo`;
  return `${years}y`;
}
