/**
 * `ageScale`: the age-vs-threshold facts behind a Findings row's small scale (PD-ROWS-2, DESIGN.md
 * §5) — the colleague's "text, text, text, no scales" gap in the up-to-three signal lines
 * `views/FindingRow.tsx` used to draw. Pure, no DOM: reads a finding's own signals and the run's
 * own thresholds, same discipline as `domain/timeline.ts`.
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
  /** The track's right edge: `max(10, ceil(years))`, so a very old package's dot never runs past
   *  the track and a young one still gets a track wide enough to read the thresholds on. */
  readonly max: number;
}

type Thresholds = readonly (readonly [name: string, years: number])[];

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

/**
 * The scale a Findings row draws beside its key-fact line, from `model.report.run.thresholds`
 * (the document's own key-order array; see `model/types.ts#RunSettings`). `null` when there is
 * nothing safe to draw: no S8/S2/S4 signal with a numeric `years`, or the run never recorded one
 * of the two thresholds that signal's kind is measured against.
 */
export function ageScale(finding: Finding, thresholds: Thresholds): AgeScale | null {
  const source = pickSource(finding);
  if (source === null) return null;

  const warn = thresholdYears(thresholds, source.warnName);
  const high = thresholdYears(thresholds, source.highName);
  if (warn === null || high === null) return null;

  return { kind: source.kind, years: source.years, warn, high, max: Math.max(10, Math.ceil(source.years)) };
}
