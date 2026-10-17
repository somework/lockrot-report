/** The Advisories tab of a report-2 (SPEC §8.7.1): the S9 rows, grouped by `fix.kind` and
 *  `fix.to_branch`, with the tab's words. The lookup hedge reads SPEC §7.9.15's one test,
 *  `advisoryListPartial`, as the overview band does. */

import type { Finding, Report2, Run, S9fix, S9row } from "../model/report";
import type { Filters } from "../state/types";
import { advisoryRows } from "./advisoryRows";
import { advisoryListPartial } from "./copySummary";
import { plural } from "./format";
import { joinAnd } from "./joinWords";
import { causeWord, fixLabel, lookupWord } from "./pageVocabulary";
import { holderWord } from "./securityBlock";

export interface AdvisoryPair2 {
  readonly finding: Finding;
  readonly row: S9row;
}

export interface AdvisoryGroup2 {
  readonly kind: string;
  readonly toBranch: string | null;
  readonly heading: string;
  readonly pairs: readonly AdvisoryPair2[];
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

const groupKey = ({ kind, to_branch: branch }: S9fix): string => `${kind}\u0000${branch ?? ""}`;

function branchOrder(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/** In `score_model.fix_kinds` order, an unknown kind after them; branches lowest first, none last. */
export function advisoryGroups2(run: Run, pairs: readonly AdvisoryPair2[]): readonly AdvisoryGroup2[] {
  const kinds = run.score_model.fix_kinds.map(({ id }) => id);
  const rank = (kind: string): number => (kinds.includes(kind) ? kinds.indexOf(kind) : kinds.length);
  const groups = new Map<string, AdvisoryPair2[]>();
  for (const pair of pairs) {
    const key = groupKey(pair.row.fix);
    groups.set(key, [...(groups.get(key) ?? []), pair]);
  }
  return [...groups.values()]
    .map((members) => {
      const { kind, to_branch: toBranch } = (members[0] as AdvisoryPair2).row.fix;
      const label = fixLabel(kind);
      return {
        kind,
        toBranch,
        heading: toBranch === null ? label : `${label} · ${toBranch}`,
        pairs: members,
      };
    })
    .sort((a, b) => rank(a.kind) - rank(b.kind) || branchOrder(a.toBranch, b.toBranch));
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

/** What holds a fix and the PHP it needs: "needs PHP >=8.1.0 · held by composer.json and symfony/twig-bridge". */
export function advisoryFixNote({ kind, php, held_by: heldBy }: S9fix): string | null {
  const parts = [
    ...(php !== null && (kind === "raise-php" || kind === "blocked") ? [`needs PHP ${php}`] : []),
    ...(heldBy.length > 0 ? [`held by ${joinAnd([...new Set(heldBy.map(holderWord))])}`] : []),
  ];
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The band a severity's square and word take, by lookup in the model. */
export const advisoryBand = (run: Run, severity: string): string | null =>
  run.score_model.severities.find(({ id }) => id === severity)?.band ?? null;

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
  reported: "reported",
  affects: "affects",
  fixedBy: "fixed by",
} as const;
