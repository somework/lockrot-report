/** The Blast radius tab of a report-2: `radius.ts`'s layout over the graded findings, which read
 *  `chain` and `direct_dependents`, and the tab's words. A vulnerable-only package is graded, so
 *  it is listed as S7 lists it. */

import type { Finding, Report2 } from "../model/report2";
import type { State } from "../state/types";
import { plural } from "./format";
import {
  FOLD_OTHER,
  FOLD_SELF,
  FOLD_SINGLES,
  isFoldOpen,
  isRowOpen,
  pulledTree,
  radiusAnswer,
  radiusLayout,
  type OpenInput,
  type RadiusLayout,
  type RadiusRow,
} from "./radius";

export type RadiusFinding2 = Finding & { readonly directDependents: readonly string[] };
export type RadiusLayout2 = RadiusLayout<RadiusFinding2>;
export type RadiusRow2 = RadiusRow<RadiusFinding2>;

const adapt = (findings: readonly Finding[]): readonly RadiusFinding2[] =>
  findings.map((f) => ({ ...f, directDependents: f.direct_dependents }));

/** `visible` is the tab's filtered list, `all` its population. */
export function radiusLayout2(
  report: Report2,
  visible: readonly Finding[],
  all: readonly Finding[],
): RadiusLayout2 {
  const source = {
    report: {
      exposure: report.exposure,
      unattributed: report.unattributed,
      findings: adapt(report.findings),
    },
  };
  return radiusLayout(source, adapt(visible), adapt(all));
}

export interface RadiusKey {
  readonly key: string;
  readonly pkg: string;
}

export const parentKey2 = (pkg: string): string => `p:${pkg}`;
export const childKey2 = (parent: string, pkg: string): string => `c:${parent}:${pkg}`;
export const receiptKey2 = (pkg: string): string => `r:${pkg}`;

/** Every row `RadiusView2` draws, top to bottom, keyed apart: a package can have several rows. */
export function radiusKeys2(layout: RadiusLayout2, input: OpenInput): readonly RadiusKey[] {
  const rowsOf = (rows: readonly RadiusRow2[], expandable: boolean): RadiusKey[] =>
    rows.flatMap((row) => [
      { key: parentKey2(row.package), pkg: row.package },
      ...(expandable && row.count > 0 && isRowOpen(row, input)
        ? pulledTree(row).map((node) => ({
            key: childKey2(row.package, node.finding.package),
            pkg: node.finding.package,
          }))
        : []),
    ]);
  return [
    ...rowsOf(layout.lead, true),
    ...(isFoldOpen(layout, FOLD_SINGLES, input) ? rowsOf(layout.singles, true) : []),
    ...(isFoldOpen(layout, FOLD_SELF, input) ? rowsOf(layout.selfOnly, false) : []),
    ...(isFoldOpen(layout, FOLD_OTHER, input)
      ? layout.receipt.map((entry) => ({
          key: receiptKey2(entry.finding.package),
          pkg: entry.finding.package,
        }))
      : []),
  ];
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
  if (answer === null)
    return layout.narrowed
      ? "No direct requirement lists a flagged package that matches the filter."
      : "No direct requirement pulls in a flagged package.";
  const names = answer.top.map((row) => row.package);
  const named = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const flagged = plural(answer.total, "flagged package", "flagged packages");
  if (answer.top.length === answer.rows) return `${flagged} pulled in, under ${named}.`;
  return `${answer.held} of the ${flagged} pulled in sit under ${named}.`;
}

/** A requirement row's sentence: what it lists, by grade. */
export function radiusRowSay(report: Report2, row: RadiusRow2): string {
  if (row.count === 0)
    return row.unfiltered > 0
      ? `None of the ${plural(row.unfiltered, "flagged package", "flagged packages")} listed under it match the filter.`
      : "Nothing flagged is listed under it.";
  return `Pulls in ${plural(row.count, "flagged package", "flagged packages")}: ${gradeMix(report, row.pulled)}.`;
}

export const RADIUS_WORDS = {
  list: "Direct requirements, most flagged packages listed under them first",
  itself: (verdict: string): string => `${verdict} itself`,
  elsewhere: (n: number): string => `+${n} reached too, listed under another row`,
  filtered: (n: number): string => `${n} more do not match the filter`,
  show: (row: RadiusRow2): string =>
    `Show the ${plural(row.count, "package", "packages")} listed under ${row.package}`,
  listedUnder: (pkg: string): string => `Listed under ${pkg}`,
  via: (hops: readonly string[]): string => `via ${hops.join(" → ")}`,
  singles: (n: number): string => `${n} more pull in one flagged package each`,
  selfOnly: (n: number): string =>
    `${plural(n, "direct requirement", "direct requirements")} flagged themselves, listing nothing flagged`,
  receipt: (n: number): string =>
    `${plural(n, "flagged package", "flagged packages")} reached only through rows above`,
  behind: (under: string | null, behind: readonly string[]): string =>
    `${under === null ? "" : `listed under ${under} · `}also behind ${behind.join(", ")}`,
  unlisted: (n: number): string =>
    `${plural(n, "flagged direct requirement", "flagged direct requirements")} with nothing flagged counted under ${n === 1 ? "it" : "them"}`,
  shared: (n: number): string =>
    `${plural(n, "flagged package", "flagged packages")} shared by too many requirements to list under one`,
} as const;
