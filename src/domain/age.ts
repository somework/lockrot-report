/**
 * The age a Findings row and the open package quote, and its zone against the run's thresholds. One
 * of S8, S2 or S4 supplies the years, in that order: the most precise fact first. Anything missing
 * returns `null`, never a guess.
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
  /**
   * Shared by every row a list draws, so bar lengths compare; `years` may exceed it (drawn cut).
   */
  readonly max: number;
  /**
   * True when the verdict's own reason is not age (`abandoned`, `pinned`): the scale is still drawn
   * for context, in a neutral tone, so it never reads as the reason for a priority it did not set.
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

/** Never coerced: a string or missing `years` is not `0`. */
function yearsOf(finding: Finding, id: "S8" | "S2" | "S4"): number | null {
  const signal = finding.signals.find((s) => s.id === id);
  const years = signal?.data.years;
  return typeof years === "number" && Number.isFinite(years) ? years : null;
}

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

/** The S8 > S2 > S4 age without thresholds, so the answer and the key facts never name two ages. */
export function ageSource(finding: Finding): { readonly kind: AgeKind; readonly years: number } | null {
  const source = pickSource(finding);
  return source === null ? null : { kind: source.kind, years: source.years };
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

function resolveSource(finding: Finding, thresholds: Thresholds): Resolved | null {
  const source = pickSource(finding);
  if (source === null) return null;

  const warn = thresholdYears(thresholds, source.warnName);
  const high = thresholdYears(thresholds, source.highName);
  if (warn === null || high === null) return null;

  return { ...source, warn, high };
}

export function isContextOnly(finding: Finding): boolean {
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

/** One axis for every Findings row (PD-ROWS-4), fixed by the run's `high` threshold rather than the
 *  oldest row, so a filter never rescales the bars: `max(10, 2 × high)`. */
export function ageAxis(thresholds: Thresholds): AgeAxis | null {
  const legend = ageLegend(thresholds);
  if (legend === null) return null;
  return { ...legend, max: Math.max(AXIS_FLOOR_YEARS, 2 * legend.high) };
}

/**
 * An S10 blocks one of S2, S4 or S8: the row says "age not read" rather than guess why none fired.
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

/** The release pair when the run recorded it, else the push pair: a legend that matches at least
 *  one kind of row. */
export function ageLegend(thresholds: Thresholds): AgeLegend | null {
  const release = releaseThresholds(thresholds);
  if (release !== null) return release;

  return pushThresholds(thresholds);
}

export function ageScale(finding: Finding, thresholds: Thresholds, max: number): AgeScale | null {
  const fact = ageFact(finding, thresholds);
  return fact === null ? null : { ...fact, max };
}

export type AgeFact = Omit<AgeScale, "max">;

/** The row's age without a shared axis, for the open package's key facts. */
export function ageFact(finding: Finding, thresholds: Thresholds): AgeFact | null {
  const resolved = resolveSource(finding, thresholds);
  if (resolved === null) return null;

  return {
    kind: resolved.kind,
    years: resolved.years,
    warn: resolved.warn,
    high: resolved.high,
    contextOnly: isContextOnly(finding),
  };
}

/** The run's push warn/high pair, the one S4's years are measured against; `null` unless both. */
export function pushThresholds(thresholds: Thresholds): AgeLegend | null {
  const warn = thresholdYears(thresholds, "push-warn-years");
  const high = thresholdYears(thresholds, "push-high-years");
  return warn !== null && high !== null ? { warn, high } : null;
}

/**
 * One tone per zone for every age the page colours, so the same years never read as two verdicts.
 */
export function ageZone(years: number, warn: number, high: number): Tone {
  if (years >= high) return "crit";
  if (years >= warn) return "med";
  return "none";
}

export function releaseThresholds(thresholds: Thresholds): AgeLegend | null {
  const warn = thresholdYears(thresholds, "release-warn-years");
  const high = thresholdYears(thresholds, "release-high-years");
  return warn !== null && high !== null ? { warn, high } : null;
}
