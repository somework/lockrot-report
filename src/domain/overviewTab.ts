/**
 * The Overview tab's charts of a report-2 (PD-OVERVIEW-3, PD-OVERVIEW-5, PD-OVERVIEW-6) and the Findings strip
 * (PD-SUMMARY-16), as words, places and links, from published fields only. The page counts, sorts,
 * slices and lays out; every score, band and grade is lockrot's.
 */

import type { Report2 } from "../model/report";
import type { Filters, LinkTarget } from "../state/types";
import { day, decimal, pluralNoun } from "./format";
import { causeWord } from "./pageVocabulary";
import { RADIUS_WORDS } from "./radius2";

/** How many rows the exposure bars and the libyears table show before "more". */
export const EXPOSURE_SHOWN = 8;
export const LIBYEARS_SHOWN = 8;

export const OVERVIEW_TAB_WORDS = {
  exposure: "Blast radius",
  exposureNote: "flagged packages each direct requirement pulls in",
  libyearsTop: `Furthest behind, top ${LIBYEARS_SHOWN}`,
  package: "Package",
  libyears: "Libyears",
  release: "Most recent release",
  overview: "Overview",
} as const;

/** A link to one tab, filtered by the existing fragment keys. */
export const findingsLink = (filters: Partial<Filters>): LinkTarget => ({ view: "findings", filters });

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
  /** "{version} ({date})" of `age.release`, or the cause words when it was not measured. */
  release: string;
  link: LinkTarget;
}

/** `age.release` is the release with the latest date, which can be an older version than the
 *  installed one, so no arrow joins the two. */
function mostRecentRelease({ age, origin }: Report2["findings"][number]): string {
  return age.release === null
    ? causeWord(age.release_unmeasured ?? "", origin.kind)
    : `${age.release.version} (${day(age.release.at)})`;
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
      release: mostRecentRelease(f),
      link: { view: graded.includes(f.verdict) ? "findings" : "packages", pkg: f.package },
    }));
}

/** The Findings strip's figure: "{packages_flagged} flagged". */
export const stripFlagged = ({ packages_flagged: flagged }: Report2): string => `${flagged} flagged`;

/** The unit of an exposure row's count, which a screen reader hears after it. */
export const exposureUnit = (flagged: number): string =>
  pluralNoun(flagged, "flagged package", "flagged packages");
