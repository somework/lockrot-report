/** The Blast radius tab of a report-2: `radius.ts`'s layout of `exposure[]` over the graded
 *  findings, each row listing what its requirement's S7 names, and the tab's words. */

import type { Finding, Report2, S7 } from "../model/report";
import type { State } from "../state/types";
import { plural, pluralNoun } from "./format";
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

/** The packages a requirement's S7 names, with their chains. */
function members(report: Report2, requirement: string, own: Finding | undefined): readonly RadiusMember[] {
  const s7 = own?.signals.find(({ id }) => id === "S7");
  if (s7 !== undefined) return (s7.data as S7).packages;
  if (own !== undefined) return [];
  // shortcut: stands in only for a document that breaks I25 (an exposure requirement with no
  // finding, so no S7), goes when the lockrot goldens give each such requirement a finding and an S7.
  const graded: readonly string[] = report.run.graded_verdicts;
  const shared = new Set(report.unattributed.map(({ package: name }) => name));
  return report.findings
    .filter(
      (f) =>
        graded.includes(f.verdict) &&
        f.package !== requirement &&
        !shared.has(f.package) &&
        f.direct_dependents.includes(requirement),
    )
    .map((f) => ({
      package: f.package,
      chain: f.chain[0] === requirement ? f.chain : [requirement, f.package],
    }));
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
        members: members(report, entry.package, byName.get(entry.package)),
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

export function radiusAnswer2(layout: RadiusLayout2): string {
  const answer = radiusAnswer(layout);
  if (answer === null) {
    if (layout.narrowed) return "No direct requirement lists a flagged package that matches the filter.";
    const n = layout.rows.length;
    return n === 0
      ? "No direct requirement pulls in a flagged package."
      : `${plural(n, "direct requirement", "direct requirements")} on lockrot's exposure list ${pluralNoun(n, "pulls", "pull")} in flagged packages.`;
  }
  const names = answer.top.map((row) => row.package);
  const named = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const flagged = plural(answer.total, "flagged package", "flagged packages");
  if (answer.top.length === answer.rows) return `${flagged} pulled in, under ${named}.`;
  return `${answer.held} of the ${flagged} pulled in sit under ${named}.`;
}

/** A requirement row's sentence: what it lists, by grade; lockrot's count alone when its S7 names no
 *  finding of the report. */
export function radiusRowSay(report: Report2, row: RadiusRow2): string {
  if (row.count === 0)
    return row.unfiltered > 0
      ? `None of the ${plural(row.unfiltered, "flagged package", "flagged packages")} listed under it match the filter.`
      : `Pulls in ${plural(row.exposure, "flagged package", "flagged packages")}.`;
  return `Pulls in ${plural(row.count, "flagged package", "flagged packages")}: ${gradeMix(report, row.pulled)}.`;
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
