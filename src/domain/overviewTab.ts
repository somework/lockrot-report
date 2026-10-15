/**
 * The Overview tab's charts of a report-2 (PD-OVERVIEW-3 to PD-OVERVIEW-6) and the Findings strip
 * (PD-SUMMARY-16), as words, places and links, from published fields only. The page counts, sorts,
 * slices and lays out; every score, band and grade is lockrot's.
 */

import type { Finding, Grade, Report2 } from "../model/report";
import { isScoreGraded } from "../model/report";
import type { Filters, LinkTarget } from "../state/types";
import { decimal, pluralNoun } from "./format";
import { gradeListLabel } from "./findingRow";
import { population2 } from "./list";
import { gradeMix, RADIUS_WORDS } from "./radius2";
import { bandTicks } from "./scoreBar";

/** How many rows the exposure bars and the libyears table show before "more". */
export const EXPOSURE_SHOWN = 8;
export const LIBYEARS_SHOWN = 8;

export const OVERVIEW_TAB_WORDS = {
  scores: "Scores",
  scoresNote: "one mark per finding on the score model's ruler",
  exposure: "Blast radius",
  exposureNote: "flagged packages each direct requirement pulls in",
  libyearsTop: `Furthest behind, top ${LIBYEARS_SHOWN}`,
  package: "Package",
  libyears: "Libyears",
  grade: "Grade",
  overview: "Overview",
} as const;

/** A link to one tab, filtered by the existing fragment keys. */
export const findingsLink = (filters: Partial<Filters>): LinkTarget => ({ view: "findings", filters });

export interface ScoreZone {
  verdict: Grade;
  /** Its start and end as shares of the ruler. */
  from: number;
  to: number;
  /** Its link's name, and the Findings under its grade it opens: the strip's only targets. */
  say: string;
  link: LinkTarget;
}

export interface ScoreStack {
  total: number;
  /** Its place as a share of the ruler, clipped at `bar_max`. */
  at: number;
  marks: { package: string; verdict: string }[];
  /** The stack's text equivalent: the drawing itself is `aria-hidden`. */
  say: string;
}

export interface ScoreStrip {
  zones: ScoreZone[];
  /** The ruler's labels: 0, the band floors on it, `bar_max`. */
  labels: { value: number; at: number }[];
  stacks: ScoreStack[];
}

const gradedScore = (f: Finding): number | null => (isScoreGraded(f.score) ? f.score.total : null);

/**
 * One mark per graded finding at `score.total ÷ bar_max` over the `score_model.bands` ruler. Equal
 * totals stack, highest total first; a stack's marks keep the Findings order.
 */
export function scoreStrip(report: Report2): ScoreStrip {
  const { run } = report;
  const max = run.score_model.bar_max;
  const floors = [...run.score_model.bands].sort((a, b) => a.floor - b.floor);
  const zones = floors
    .filter(({ floor }) => floor < max)
    .map(({ verdict, floor }, i) => ({
      verdict,
      from: floor / max,
      to: Math.min(floors[i + 1]?.floor ?? max, max) / max,
      say: gradeListLabel(verdict),
      link: findingsLink({ verdict: [verdict] }),
    }));
  const labels = [0, ...bandTicks(run).map(({ floor }) => floor), max].map((value) => ({
    value,
    at: value / max,
  }));

  const byTotal = new Map<number, Finding[]>();
  for (const finding of [...population2(report, "findings")].sort((a, b) => a.rank - b.rank)) {
    const total = gradedScore(finding);
    if (total === null) continue;
    byTotal.set(total, [...(byTotal.get(total) ?? []), finding]);
  }
  const stacks = [...byTotal.entries()]
    .sort(([a], [b]) => b - a)
    .map(([total, findings]) => ({
      total,
      at: Math.min(total, max) / max,
      marks: findings.map((f) => ({ package: f.package, verdict: f.verdict })),
      say: `score ${total}: ${gradeMix(report, findings)}`,
    }));

  return { zones, labels, stacks };
}

export interface ExposureBars {
  rows: { package: string; flagged: number }[];
  longest: number;
  /** "{n} more in Blast radius", or null when every row shows. */
  more: string | null;
  /** The `unattributed` sentence of PD-RADIUS-12, or null when there is none. */
  shared: string | null;
  link: LinkTarget;
}

/** The first rows of `exposure[]` as published, each sized to the longest shown. */
export function exposureBars(report: Report2): ExposureBars {
  const rows = report.exposure.slice(0, EXPOSURE_SHOWN).map(({ package: name, flagged }) => ({
    package: name,
    flagged,
  }));
  const rest = report.exposure.length - rows.length;
  const names = report.unattributed.map(({ package: name }) => name);
  return {
    rows,
    longest: Math.max(1, ...rows.map(({ flagged }) => flagged)),
    more: rest > 0 ? `${rest} more in Blast radius` : null,
    shared: names.length > 0 ? `${RADIUS_WORDS.shared(names.length)}: ${names.join(", ")}.` : null,
    link: { view: "radius" },
  };
}

export interface LibyearsRow {
  package: string;
  version: string;
  /** One decimal (SPEC §7.9.9), "≥ " before a lower bound. */
  libyears: string;
  grade: string;
  link: LinkTarget;
}

/** `findings[].libyears` high to low, ties by name, cut at `LIBYEARS_SHOWN`; a null is not ranked. */
export function libyearsTop(report: Report2): LibyearsRow[] {
  const graded: readonly string[] = report.run.graded_verdicts;
  return report.findings
    .flatMap((f) => (f.libyears === null ? [] : [{ f, years: f.libyears }]))
    .sort((a, b) => b.years - a.years || (a.f.package < b.f.package ? -1 : a.f.package > b.f.package ? 1 : 0))
    .slice(0, LIBYEARS_SHOWN)
    .map(({ f, years }) => ({
      package: f.package,
      version: f.version,
      libyears: `${f.libyears_at_least ? "≥ " : ""}${decimal(years, 1)}`,
      grade: f.verdict,
      link: { view: graded.includes(f.verdict) ? "findings" : "packages", pkg: f.package },
    }));
}

/** The Findings strip's figure: "{packages_flagged} flagged". */
export const stripFlagged = ({ packages_flagged: flagged }: Report2): string => `${flagged} flagged`;

/** The unit of an exposure row's count, which a screen reader hears after it. */
export const exposureUnit = (flagged: number): string =>
  pluralNoun(flagged, "flagged package", "flagged packages");
