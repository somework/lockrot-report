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

export type AgeKind = "branch" | "release" | "push";

export interface AgeScale {
  readonly kind: AgeKind;
  /** Years since the fact this scale draws — S8/S2/S4's own `data.years`, unrounded. */
  readonly years: number;
  readonly warn: number;
  readonly high: number;
  /** The track's right edge, shared by every row a list draws at once (`sharedAgeMax`) rather than
   *  computed per row: dot positions only compare across rows when they share one scale (PD-ROWS-3,
   *  DESIGN.md §5). */
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
 *  array — the one place both null-outs `ageScale` and `sharedAgeMax` care about are decided, so
 *  the two never drift on what counts as "a row that draws a scale". `null` for exactly the same
 *  reasons `ageScale` documents: no S8/S2/S4 with a numeric `years`, or a threshold the run never
 *  recorded. */
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

/**
 * The one maximum every row in a list shares (PD-ROWS-3, DESIGN.md §5), so a dot's position along
 * the track means the same thing on every row instead of each row rescaling its own: `max(10,
 * ceil(largest years among the rows that would actually draw a scale))`. A finding with no S8/S2/S4,
 * or whose kind is missing a threshold, contributes nothing — the same rows `ageScale` itself would
 * return `null` for. Compute once per list (`FindingsView`) and pass the result to every row's own
 * `ageScale` call.
 */
export function sharedAgeMax(findings: readonly Finding[], thresholds: Thresholds): number {
  let max = 10;
  for (const finding of findings) {
    const resolved = resolveSource(finding, thresholds);
    if (resolved !== null) max = Math.max(max, Math.ceil(resolved.years));
  }
  return max;
}

/** Whether any finding in a list would draw a scale at all — what gates the once-per-list legend
 *  (PD-ROWS-3): a report with no S8/S2/S4 signal anywhere, or with neither threshold pair recorded,
 *  needs no legend for a scale no row ever draws. */
export function anyAgeScale(findings: readonly Finding[], thresholds: Thresholds): boolean {
  return findings.some((finding) => resolveSource(finding, thresholds) !== null);
}

export interface AgeLegend {
  readonly warn: number;
  readonly high: number;
}

/**
 * The thresholds a list's once-per-list legend names (PD-ROWS-3): the release pair when the run
 * recorded both of it — the pair `branch` and `release` rows, the two most common kinds, are
 * measured against — falling back to the push pair when only that one is complete. A run that sets
 * the two pairs to different values still gets a legend that matches at least one kind of row
 * rather than none; `null` when neither pair is complete, the same "never guess" fallback every row's
 * own scale already keeps.
 */
export function ageLegend(thresholds: Thresholds): AgeLegend | null {
  const releaseWarn = thresholdYears(thresholds, "release-warn-years");
  const releaseHigh = thresholdYears(thresholds, "release-high-years");
  if (releaseWarn !== null && releaseHigh !== null) return { warn: releaseWarn, high: releaseHigh };

  const pushWarn = thresholdYears(thresholds, "push-warn-years");
  const pushHigh = thresholdYears(thresholds, "push-high-years");
  if (pushWarn !== null && pushHigh !== null) return { warn: pushWarn, high: pushHigh };

  return null;
}

/**
 * The scale a Findings row draws beside its key-fact line, from `model.report.run.thresholds`
 * (the document's own key-order array; see `model/types.ts#RunSettings`) and `max`, the list's own
 * shared maximum (`sharedAgeMax`, computed once by the view and passed to every row). `null` when
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
