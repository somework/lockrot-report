/** The Advisories tab of a report-2 (SPEC §8.7.1): the S9 rows, grouped by `fix.kind` and
 *  `fix.to_branch`, with the tab's words. The lookup hedge reads SPEC §7.9.15's one test,
 *  `advisoryListPartial`, as the overview band does. */

import type { Finding, Report2, Run, S9fix, S9row } from "../model/report";
import type { Filters } from "../state/types";
import { advisoryRows } from "./advisoryRows";
import { advisoryListPartial } from "./copySummary";
import { safeHref } from "./links";
import { plural } from "./format";
import { causeWord, fixLabel, lookupWord } from "./pageVocabulary";
import { heldByLine, heldByWords } from "./findingRow";

export interface AdvisoryPair2 {
  readonly finding: Finding;
  readonly row: S9row;
}

/** One package's advisories in lockrot's order: a group never mixes packages. */
export interface AdvisoryGroup2 {
  readonly finding: Finding;
  readonly pairs: readonly AdvisoryPair2[];
  /** Per row, the id of the group's earlier row that carries the same CVE (G135), else null. */
  readonly sameAs: readonly (string | null)[];
}

/** The rows of each finding in the order given, narrowed by the sev and fix rail buttons row by row. */
export function advisoryPairs2(findings: readonly Finding[], filters: Filters): readonly AdvisoryPair2[] {
  return findings.flatMap((finding) =>
    advisoryRows(finding)
      .filter((row) => filters.sev.length === 0 || filters.sev.includes(row.severity))
      .filter((row) => filters.fix.length === 0 || filters.fix.includes(row.fix.kind))
      .map((row) => ({ finding, row })),
  );
}

/** In the order of the rows given, which is `rank` order. */
export function advisoryGroups2(pairs: readonly AdvisoryPair2[]): readonly AdvisoryGroup2[] {
  const groups = new Map<string, AdvisoryPair2[]>();
  for (const pair of pairs) {
    const pkg = pair.finding.package;
    groups.set(pkg, [...(groups.get(pkg) ?? []), pair]);
  }
  return [...groups.values()].map((members) => {
    const first = new Map<string, string>();
    const sameAs = members.map(({ row }) => {
      if (row.cve === null) return null;
      const earlier = first.get(row.cve);
      if (earlier === undefined) first.set(row.cve, row.id);
      return earlier ?? null;
    });
    return { finding: (members[0] as AdvisoryPair2).finding, pairs: members, sameAs };
  });
}

/** The package names the tab draws as rows, top to bottom (`j`/`k`); a package repeats per row. */
export const advisoryRowPackages = (groups: readonly AdvisoryGroup2[]): readonly string[] =>
  groups.flatMap((group) => group.pairs.map((pair) => pair.finding.package));

export interface AdvisoryAnswer2 {
  readonly text: string;
  /** The count alone, for an unfiltered list whose severity chips beside it say the rest. */
  readonly head: string;
  /** Set under a filter: the count without it. */
  readonly narrowed: string | null;
}

export function advisoryAnswer2(
  run: Run,
  pairs: readonly AdvisoryPair2[],
  unfiltered: number,
): AdvisoryAnswer2 {
  const isNarrowed = pairs.length < unfiltered;
  const packages = new Set(pairs.map((pair) => pair.finding.package)).size;
  const severities = run.score_model.severities
    .map(({ id }) => ({ id, n: pairs.filter((pair) => pair.row.severity === id).length }))
    .filter(({ n }) => n > 0)
    .map(({ id, n }) => `${n} ${id}`);
  const known = new Set(run.score_model.severities.map(({ id }) => id));
  const others = [...new Set(pairs.map((pair) => pair.row.severity).filter((id) => !known.has(id)))].map(
    (id) => `${pairs.filter((pair) => pair.row.severity === id).length} ${id}`,
  );
  const noun = isNarrowed ? ["matching advisory", "matching advisories"] : ["advisory", "advisories"];
  const count = `${plural(pairs.length, noun[0] as string, noun[1] as string)} on ${plural(packages, "package", "packages")}`;
  return {
    text: `${count}, by severity: ${[...severities, ...others].join(", ")}.`,
    head: `${count}.`,
    narrowed: isNarrowed
      ? `Only advisories that match the filter are counted; without it there ${unfiltered === 1 ? "is" : "are"} ${unfiltered}.`
      : null,
  };
}

/** What a severity counts as when the model scores it as another one: ", counted as medium". */
export function advisoryCountedAs(run: Run, severity: string): string | null {
  const countsAs = run.score_model.severities.find(({ id }) => id === severity)?.counts_as ?? null;
  return countsAs === null ? null : `, counted as ${countsAs}`;
}

export interface AdvisoryFixWords {
  readonly version: string | null;
  readonly where: string;
}

/** The fixing release and where it is released, or the fix label and its reason without one. */
export function advisoryFixWords(fix: S9fix, finding: Finding): AdvisoryFixWords {
  if (fix.version === null) {
    const reason = fix.reason === null ? "" : `: ${causeWord(fix.reason, finding.origin.kind)}`;
    return { version: null, where: `${fixLabel(fix.kind)}${reason}` };
  }
  const where =
    fix.on_installed_branch === true
      ? "on your branch"
      : fix.to_branch === null
        ? fixLabel(fix.kind)
        : `on ${fix.to_branch}`;
  return { version: fix.version, where };
}

/** The lookup word of an advisory list that may be partial, by SPEC §7.9.15's one test; a
 *  complete lookup beside an unchecked package or note reads "check incomplete". Null for a full list. */
function partialLookupWord(report: Report2): string | null {
  if (!advisoryListPartial(report)) return null;
  const { check } = report.security;
  return check === "complete" ? "check incomplete" : lookupWord(check, null);
}

/** Under the answer when the run's lookup did not cover every package. */
export function advisoryLookupHedge(report: Report2): string | null {
  const word = partialLookupWord(report);
  return word === null ? null : `Advisories: ${word}, so this list may be partial.`;
}

/** The tab when no finding is vulnerable: clean only after a full list. */
export function noAdvisoryLine(report: Report2): string {
  const word = partialLookupWord(report);
  return word === null ? "No advisory affects this lock." : `No advisory found (${word}).`;
}

/** What holds a fix and the PHP it needs: "needs PHP >=8.1.0 · held by symfony/twig-bridge", with
 *  the holders as a Findings row says them (accepted derivation 3). */
export function advisoryFixNote(fix: S9fix, run: Run, own: string): string | null {
  const held = heldByLine(fix.held_by, run, own);
  const parts = [advisoryFixPhp(fix), held === null ? null : heldByWords(held)].filter((p) => p !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The PHP a fix needs, when lockrot says that the target PHP or the project's PHP floor does not
 *  admit it. A null answer is no answer. */
export function advisoryFixPhp({
  php,
  admits_target_php: target,
  admits_project_php: project,
}: S9fix): string | null {
  return php !== null && (target === false || project === false) ? `needs PHP ${php}` : null;
}

/** The band a severity's square and word take, by lookup in the model. */
export const advisoryBand = (run: Run, severity: string): string | null =>
  run.score_model.severities.find(({ id }) => id === severity)?.band ?? null;

export interface AdvisoryId {
  readonly text: string;
  readonly href: string | null;
  /** The "no CVE assigned" placeholder, which is no id. */
  readonly noCve: boolean;
}

/** The ids a row shows. lockrot's `link` belongs to the source id, so only that id links, and a
 *  different CVE id is text. The page builds no URL. */
export function advisoryIds({ cve, id, link }: Pick<S9row, "cve" | "id" | "link">): readonly AdvisoryId[] {
  const href = safeHref(link);
  if (cve === null)
    return [
      { text: ADVISORY_HEAD.noCve, href: null, noCve: true },
      { text: id, href, noCve: false },
    ];
  if (id === cve) return [{ text: cve, href, noCve: false }];
  return [
    { text: cve, href: null, noCve: false },
    { text: id, href, noCve: false },
  ];
}

/** A row's accessible name: one package can carry several rows. */
export const advisoryRowLabel2 = ({ finding, row }: AdvisoryPair2): string =>
  `${finding.package}, ${row.severity}, ${row.cve ?? row.id}`;

export const ADVISORY_HEAD = {
  sev: "Severity",
  adv: "Advisory",
  pkg: "Package · reached",
  aff: "Affects",
  fix: "Fixed by",
  noCve: "no CVE assigned",
  sameAs: "same CVE as",
  reported: "reported",
  affects: "affects",
  fixedBy: "fixed by",
} as const;

export interface AdvisoryGroupNotes {
  readonly package: string;
  /** "{id}: same CVE as {earlier id}", one per repeating row. */
  readonly same_cve_as: readonly string[];
  /** The distinct fix notes, in row order. */
  readonly fix_notes: readonly string[];
}

/** Each package group's repeated CVEs and fix notes, with no filter (golden `advisory_groups`). */
export function advisoryGroupNotes(report: Report2): AdvisoryGroupNotes[] {
  const findings = report.findings.filter((f) => advisoryRows(f).length > 0).sort((a, b) => a.rank - b.rank);
  return advisoryGroups2(advisoryPairs2(findings, { sev: [], fix: [] } as unknown as Filters)).map(
    ({ finding, pairs, sameAs }) => ({
      package: finding.package,
      same_cve_as: pairs.flatMap(({ row }, at) => {
        const earlier = sameAs[at];
        return earlier === null || earlier === undefined
          ? []
          : [`${row.id}: ${ADVISORY_HEAD.sameAs} ${earlier}`];
      }),
      fix_notes: [
        ...new Set(pairs.flatMap(({ row }) => advisoryFixNote(row.fix, report.run, finding.package) ?? [])),
      ],
    }),
  );
}
