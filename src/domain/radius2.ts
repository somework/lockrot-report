/** The Blast radius tab of a report-2: `radius.ts`'s layout of `exposure[]` over the graded
 *  findings, each row listing what its requirement's S7 names, and the tab's words. */

import type { Finding, Report2, S7 } from "../model/report";
import type { State } from "../state/types";
import { plural, pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import {
  isRowOpen,
  isSinglesOpen,
  pulledTree,
  radiusAnswer,
  radiusLayout,
  type OpenInput,
  type RadiusLayout,
  type RadiusMember,
  type RadiusRow,
} from "./radius";

export type RadiusFinding2 = Finding;
export type RadiusLayout2 = RadiusLayout<RadiusFinding2>;
export type RadiusRow2 = RadiusRow<RadiusFinding2>;

/** The packages a requirement's S7 names, with their chains; none without an S7 (I25 gives every
 *  exposure requirement a finding). */
function members(own: Finding | undefined): readonly RadiusMember[] {
  const s7 = own?.signals.find(({ id }) => id === "S7");
  return s7 === undefined ? [] : (s7.data as S7).packages;
}

/** `visible` is the tab's filtered list, `all` its population. */
export function radiusLayout2(
  report: Report2,
  visible: readonly Finding[],
  all: readonly Finding[],
): RadiusLayout2 {
  const byName = new Map(report.findings.map((f) => [f.package, f]));
  const source = {
    report: {
      exposure: report.exposure.map((entry) => ({
        ...entry,
        members: members(byName.get(entry.package)),
      })),
      unattributed: report.unattributed,
      findings: report.findings,
    },
  };
  return radiusLayout(source, visible, all);
}

export interface RadiusKey {
  readonly key: string;
  readonly pkg: string;
}

export const parentKey2 = (pkg: string): string => `p:${pkg}`;
export const childKey2 = (parent: string, pkg: string): string => `c:${parent}:${pkg}`;

/** Every row `RadiusView2` draws, top to bottom, keyed apart: a package can have several rows. */
export function radiusKeys2(layout: RadiusLayout2, input: OpenInput): readonly RadiusKey[] {
  const rowsOf = (rows: readonly RadiusRow2[]): RadiusKey[] =>
    rows.flatMap((row) => [
      { key: parentKey2(row.package), pkg: row.package },
      ...(row.count > 0 && isRowOpen(layout, row, input)
        ? pulledTree(row).map((node) => ({
            key: childKey2(row.package, node.finding.package),
            pkg: node.finding.package,
          }))
        : []),
    ]);
  return [...rowsOf(layout.lead), ...(isSinglesOpen(layout, input) ? rowsOf(layout.singles) : [])];
}

/** The tab's rows top to bottom for `j`/`k`. */
export function radiusRows2(layout: RadiusLayout2, state: State, narrow: boolean): readonly string[] {
  return radiusKeys2(layout, { disclosure: state.disclosure, pkg: state.pkg, narrow }).map(({ pkg }) => pkg);
}

/** Packages per grade, in `run.graded_verdicts` order: "2 critical, 1 high". */
export function gradeMix(report: Report2, findings: readonly Finding[]): string {
  const graded: readonly string[] = report.run.graded_verdicts;
  const counts = graded
    .map((verdict) => ({ verdict, n: findings.filter((f) => f.verdict === verdict).length }))
    .filter(({ n }) => n > 0)
    .map(({ verdict, n }) => `${n} ${verdict}`);
  return counts.join(", ");
}

/** The lead lines of §7.9.20 after the depth sentence: the flagged packages pulled in
 *  (`rot_depth.by_reach.transitive`), how many no exposure S7 lists, then the rows that hold them. */
export function radiusAnswer2(report: Report2, layout: RadiusLayout2): string[] {
  const pulled = report.rot_depth.by_reach.transitive;
  const answer = radiusAnswer(layout, pulled);
  if (answer === null && layout.narrowed) {
    return ["No direct requirement lists a flagged package that matches the filter."];
  }
  if (pulled === 0) return [];
  const unlisted = pulled - listedTransitive(report);
  const sit = (n: number): string => `${String(n)} of them ${pluralNoun(n, "sits", "sit")} under`;
  const names = answer?.top.map((row) => row.package) ?? [];
  return [
    `${plural(pulled, "flagged package", "flagged packages")} pulled in.`,
    ...(unlisted > 0
      ? [`${sit(unlisted)} more than ${String(report.exposure_rule.max_fan_in)} direct requirements.`]
      : []),
    ...(answer !== null && answer.held > 0 ? [`${sit(answer.held)} ${joinAnd(names)}.`] : []),
  ];
}

/** The graded transitive findings that the S7 of an `exposure[]` entry lists. */
function listedTransitive(report: Report2): number {
  const graded: readonly string[] = report.run.graded_verdicts;
  const byName = new Map(report.findings.map((f) => [f.package, f]));
  const listed = new Set(
    report.exposure.flatMap((entry) => members(byName.get(entry.package)).map((m) => m.package)),
  );
  return report.findings.filter(
    (f) => f.reach === "transitive" && graded.includes(f.verdict) && listed.has(f.package),
  ).length;
}

/** A requirement row's facts: the count it lists and its grade split; lockrot's count alone when
 *  its S7 names no finding of the report; no count, and a note, when the filter hides them all. */
export interface RadiusRowFacts {
  readonly count: number | null;
  readonly mix: string | null;
  readonly note: string | null;
}

export function radiusRowFacts(report: Report2, row: RadiusRow2): RadiusRowFacts {
  if (row.count > 0) return { count: row.count, mix: gradeMix(report, row.pulled), note: null };
  if (row.unfiltered === 0) return { count: row.exposure, mix: null, note: null };
  return {
    count: null,
    mix: null,
    note: `None of the ${plural(row.unfiltered, "flagged package", "flagged packages")} listed under it match the filter.`,
  };
}

export const RADIUS_WORDS = {
  list: "Direct requirements, in the order of lockrot's exposure list",
  itself: (verdict: string): string => `${verdict} itself`,
  filtered: (n: number): string => `${n} more do not match the filter`,
  show: (row: RadiusRow2): string =>
    `Show the ${plural(row.count, "package", "packages")} listed under ${row.package}`,
  listedUnder: (pkg: string): string => `Listed under ${pkg}`,
  via: (hops: readonly string[]): string => `via ${hops.join(" → ")}`,
  singles: (n: number): string => `${n} more pull in one flagged package each`,
  unlisted: (n: number): string =>
    `${plural(n, "flagged direct requirement", "flagged direct requirements")} with nothing flagged counted under ${n === 1 ? "it" : "them"}`,
  shared: (n: number): string =>
    `${plural(n, "flagged package", "flagged packages")} shared by too many requirements to list under one`,
} as const;
