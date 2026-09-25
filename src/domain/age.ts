/**
 * `ageScale`: the age-vs-threshold facts behind a Findings row's small scale (PD-ROWS-2/3,
 * DESIGN.md §5) — the colleague's "text, text, text, no scales" gap in the up-to-three signal
 * lines `views/FindingRow.tsx` used to draw. Pure, no DOM: reads a finding's own signals and the
 * run's own thresholds, same discipline as `domain/timeline.ts`.
 *
 * Exactly one of S8 (the installed branch stopped), S2 (no stable release) or S4 (no push) ever
 * supplies the years, in that priority: a branch-specific stall is the most precise fact a document
 * can carry, then the package's own release age, and only then the repository's activity as a
 * whole. A missing signal, a non-numeric `years`, or a threshold the run never recorded each return
 * `null` rather than guess — the row falls back to no scale at all, the same as it already falls
 * back to the evidence sentence when a finding carries no signal.
 */

import type { Finding } from "../model/types";
import type { Tone } from "./vocab";

export type AgeKind = "branch" | "release" | "push";

export interface AgeScale {
  readonly kind: AgeKind;
  /** Years since the fact this scale draws — S8/S2/S4's own `data.years`, unrounded. */
  readonly years: number;
  readonly warn: number;
  readonly high: number;
  /** The axis' right edge, shared by every row a list draws at once (`ageAxis`) rather than
   *  computed per row: bar lengths only compare across rows when they share one scale (PD-ROWS-3/4,
   *  DESIGN.md §5). `years` may exceed it; the row then draws its bar to the edge, cut. */
  readonly max: number;
  /**
   * True for a verdict whose own reason to flag is not age — `abandoned` (S1's own repository flag,
   * or S3's archived flag) and `pinned` (S6's branch snapshot) start the priority ladder
   * (`domain/priority.ts#PRIORITY_BASE`) without ever reading S2/S4/S8. Such a finding can still
   * carry one of those signals — a repository can be both archived and old — and the scale drawn
   * from it would otherwise read as the reason for a priority it did not set (PD-ROWS-3: an
   * abandoned, CRITICAL-from-S1 finding whose S2 years sit in the warn zone drew the same olive dot
   * as a row actually flagged for its age, contradicting the verdict beside it). The row still
   * draws the scale — the age fact is real and worth showing for context — but in a neutral tone,
   * and says so in its own label.
   */
  readonly contextOnly: boolean;
}

export type Thresholds = readonly (readonly [name: string, years: number])[];

interface Source {
  readonly kind: AgeKind;
  readonly years: number;
  readonly warnName: string;
  readonly highName: string;
}

/** A signal's `data.years`, or `null` when the signal is absent or its `years` is not a finite
 *  number — never coerced, so a string or missing value never silently reads as `0`. */
function yearsOf(finding: Finding, id: "S8" | "S2" | "S4"): number | null {
  const signal = finding.signals.find((s) => s.id === id);
  const years = signal?.data.years;
  return typeof years === "number" && Number.isFinite(years) ? years : null;
}

/** Which signal supplies the age, in the fixed S8 > S2 > S4 priority this module's own header
 *  comment explains. */
function pickSource(finding: Finding): Source | null {
  const branch = yearsOf(finding, "S8");
  if (branch !== null) {
    return { kind: "branch", years: branch, warnName: "release-warn-years", highName: "release-high-years" };
  }

  const release = yearsOf(finding, "S2");
  if (release !== null) {
    return {
      kind: "release",
      years: release,
      warnName: "release-warn-years",
      highName: "release-high-years",
    };
  }

  const push = yearsOf(finding, "S4");
  if (push !== null) {
    return { kind: "push", years: push, warnName: "push-warn-years", highName: "push-high-years" };
  }

  return null;
}

function thresholdYears(thresholds: Thresholds, name: string): number | null {
  for (const [n, years] of thresholds) {
    if (n === name) return years;
  }
  return null;
}

interface Resolved extends Source {
  readonly warn: number;
  readonly high: number;
}

/** `pickSource` plus the two thresholds it needs, resolved against the run's own `thresholds`
 *  array. `null` for exactly the reasons `ageScale` documents: no S8/S2/S4 with a numeric `years`,
 *  or a threshold the run never recorded. */
function resolveSource(finding: Finding, thresholds: Thresholds): Resolved | null {
  const source = pickSource(finding);
  if (source === null) return null;

  const warn = thresholdYears(thresholds, source.warnName);
  const high = thresholdYears(thresholds, source.highName);
  if (warn === null || high === null) return null;

  return { ...source, warn, high };
}

/** `abandoned` and `pinned` never reach the priority ladder through S2/S4/S8 (`domain/priority.ts`)
 *  — see `AgeScale.contextOnly`'s own comment for why a scale drawn for either still needs a
 *  neutral tone rather than the zone's. */
function isContextOnly(finding: Finding): boolean {
  return finding.verdict === "abandoned" || finding.verdict === "pinned";
}

/** The fewest years the shared axis ever spans, whatever the run's own `high` threshold says. */
const AXIS_FLOOR_YEARS = 10;

export interface AgeAxis {
  readonly warn: number;
  readonly high: number;
  /** The axis' right edge: `max(10, 2 × high)`. An age past it runs to the edge and says so. */
  readonly max: number;
}

/**
 * The one axis every Findings row's age bar is drawn against (PD-ROWS-4, DESIGN.md §5): the
 * thresholds `ageLegend` names, and a right edge fixed by the run's own `high` threshold rather than
 * by the oldest row on screen — so the column head can caption it once ("0 · 3y · 5y · 10y+") and a
 * filter never rescales every bar under the reader. `max(10, 2 × high)`: twice the point where an
 * age turns critical leaves room to see how far past it a package is, and 10 years is where
 * "very old" stops needing more resolution. A bar past the edge is drawn to it, marked as cut, with
 * its exact years beside it. `null` when the run recorded neither threshold pair.
 */
export function ageAxis(thresholds: Thresholds): AgeAxis | null {
  const legend = ageLegend(thresholds);
  if (legend === null) return null;
  return { ...legend, max: Math.max(AXIS_FLOOR_YEARS, 2 * legend.high) };
}

/**
 * Whether lockrot said it could not read this package's age: an S10 whose `data.blocks` names one of
 * the three age signals (S2, S4, S8). A row with no age bar says "age not read" then, and "no age
 * signal" otherwise — never a guess at why none of the three fired.
 */
export function ageNotRead(finding: Finding): boolean {
  const s10 = finding.signals.find((s) => s.id === "S10");
  const blocks = s10?.data.blocks;
  return Array.isArray(blocks) && blocks.some((id) => id === "S2" || id === "S4" || id === "S8");
}

export interface AgeLegend {
  readonly warn: number;
  readonly high: number;
}

/**
 * The thresholds the Findings list's axis is captioned with (PD-ROWS-3/4): the release pair when the run
 * recorded both of it — the pair `branch` and `release` rows, the two most common kinds, are
 * measured against — falling back to the push pair when only that one is complete. A run that sets
 * the two pairs to different values still gets a legend that matches at least one kind of row
 * rather than none; `null` when neither pair is complete, the same "never guess" fallback every row's
 * own scale already keeps.
 */
export function ageLegend(thresholds: Thresholds): AgeLegend | null {
  const release = releaseThresholds(thresholds);
  if (release !== null) return release;

  const pushWarn = thresholdYears(thresholds, "push-warn-years");
  const pushHigh = thresholdYears(thresholds, "push-high-years");
  if (pushWarn !== null && pushHigh !== null) return { warn: pushWarn, high: pushHigh };

  return null;
}

/**
 * The scale a Findings row draws beside its key-fact line, from `model.report.run.thresholds`
 * (the document's own key-order array; see `model/types.ts#RunSettings`) and `max`, the list's own
 * shared maximum (`ageAxis(…).max`, computed once by the view and passed to every row). `null` when
 * there is nothing safe to draw: no S8/S2/S4 signal with a numeric `years`, or the run never
 * recorded one of the two thresholds that signal's kind is measured against.
 */
export function ageScale(finding: Finding, thresholds: Thresholds, max: number): AgeScale | null {
  const resolved = resolveSource(finding, thresholds);
  if (resolved === null) return null;

  return {
    kind: resolved.kind,
    years: resolved.years,
    warn: resolved.warn,
    high: resolved.high,
    max,
    contextOnly: isContextOnly(finding),
  };
}

/**
 * The zone an age falls in against a warn/high pair, as the tone that zone is drawn in: below
 * `warn` reads as fine, `warn`..`high` as a caution, at or above `high` as the same tone a critical
 * verdict pill carries. One vocabulary for every age the page colours — a Findings row's scale dot
 * (`views/AgeScale.tsx`) and the release-branches answer (`detail/Timeline.tsx`) — so the same
 * years never read as two different verdicts in two places.
 */
export function ageZone(years: number, warn: number, high: number): Tone {
  if (years >= high) return "crit";
  if (years >= warn) return "med";
  return "none";
}

/** The run's release warn/high pair, the one a release's own age is measured against; `null` when
 *  the run did not record both — the caller then draws the age in no zone's tone, never a guess. */
export function releaseThresholds(thresholds: Thresholds): AgeLegend | null {
  const warn = thresholdYears(thresholds, "release-warn-years");
  const high = thresholdYears(thresholds, "release-high-years");
  return warn !== null && high !== null ? { warn, high } : null;
}
