/**
 * The Overview tab's charts of a report-2 (PD-OVERVIEW-3, PD-OVERVIEW-5, PD-OVERVIEW-6) and the Findings strip
 * (PD-SUMMARY-16), as words, places and links, from published fields only. The page counts, sorts,
 * slices and lays out; every score, band and grade is lockrot's.
 */

import type { Report2 } from "../model/report";
import type { Filters, LinkTarget } from "../state/types";
import { day, decimal, plural, pluralNoun } from "./format";
import { causeWord } from "./pageVocabulary";
import { RADIUS_WORDS } from "./radius2";

/** How many rows the exposure bars and the libyears table show before "more". */
export const EXPOSURE_SHOWN = 8;
export const LIBYEARS_SHOWN = 8;

export const OVERVIEW_TAB_WORDS = {
  exposure: "Blast radius",
  exposureNote: "flagged packages each direct requirement pulls in",
  depth: "How deep the flagged packages sit",
  libyearsTop: `Furthest behind, top ${LIBYEARS_SHOWN}`,
  libyearsNone: "Every measured package rounds to 0.0 libyears.",
  requirement: "Direct requirement",
  package: "Package",
  libyears: "Libyears",
  release: "Most recent release",
  overview: "Overview",
} as const;

/** A link to one tab, filtered by the existing fragment keys. */
export const findingsLink = (filters: Partial<Filters>): LinkTarget => ({ view: "findings", filters });

export interface ExposureBars {
  rows: { package: string; flagged: number }[];
  /** The track of every bar: `packages_flagged`, so a row reads as a share of the flagged set. */
  longest: number;
  /** The count column's head: what the bars run to, `packages_flagged`. */
  scale: string;
  /** "{n} direct requirement(s) pull(s) in flagged packages": the count of `exposure[]`, with no
   *  threshold; null with fewer than two entries, where the one row says it. */
  count: string | null;
  /** Why rows can sum past the flagged set: `exposure_rule`, only with two rows or more. */
  overlap: string | null;
  /** "{n} more in Blast radius", or null when every row shows. */
  more: string | null;
  /** The `unattributed` note of SPEC §7.9.20 over the flagged findings, or null when none is flagged. */
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
  const graded: readonly string[] = report.run.graded_verdicts;
  const flagged = new Set(report.findings.filter((f) => graded.includes(f.verdict)).map((f) => f.package));
  const names = [...new Set(report.unattributed.map(({ package: name }) => name))].filter((name) =>
    flagged.has(name),
  );
  const longest = Math.max(1, report.packages_flagged, ...rows.map(({ flagged: n }) => n));
  const n = report.exposure.length;
  return {
    rows,
    count:
      n < 2 ? null : `${plural(n, "direct requirement", "direct requirements")} pull in flagged packages.`,
    longest,
    scale: `flagged, of ${String(report.packages_flagged)}`,
    overlap:
      rows.length < 2
        ? null
        : `A flagged package counts under each direct requirement it is reached from, up to ${String(report.exposure_rule.max_fan_in)}, so the rows overlap.`,
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

/** `findings[].libyears` high to low, ties by name, cut at `LIBYEARS_SHOWN`; a null is not ranked, and
 *  a row that rounds to 0.0 says nothing, so it is not drawn. */
export function libyearsTop(report: Report2): LibyearsRow[] {
  const graded: readonly string[] = report.run.graded_verdicts;
  return report.findings
    .flatMap((f) =>
      f.libyears === null || decimal(f.libyears, 1) === "0.0" ? [] : [{ f, years: f.libyears }],
    )
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

export interface DepthRow {
  /** "direct" at depth 0, else "{n} hop(s) away". */
  readonly label: string;
  readonly flagged: number;
}

/** `rot_depth.by_depth` as published, then the unreached count as a row of its own (SPEC §7.9.4). */
export function depthRows({ rot_depth: depth }: Report2): DepthRow[] {
  if (depth.flagged === 0 || depth.unmeasured.no_composer_json > 0) return [];
  return [
    ...depth.by_depth.map(({ depth: hops, flagged }) => ({
      label: hops === 0 ? "direct" : `${plural(hops, "hop", "hops")} away`,
      flagged,
    })),
    ...(depth.by_reach.unreached > 0 ? [{ label: "not reached", flagged: depth.by_reach.unreached }] : []),
  ];
}
