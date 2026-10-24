/**
 * The Security row of the detail sheet (SPEC §7.9.8.10, §7.9.13.6): the summary, the Meanwhile
 * line, the advisory list by severity, the ignored advisories and the ladder of ways out.
 */

import type {
  BranchFixes,
  Finding,
  HeldBy,
  RepositoryMetadata,
  Run,
  S9fix,
  S9row,
  Severity,
} from "../model/report";
import { isScoreGraded, isSecurityVulnerable } from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import { safeHref } from "./links";
import { fixLabel, lookupWord, stoppedCheckWords } from "./pageVocabulary";
import { vocabTable } from "./vocab";
import { newTab, type Rich } from "./rich";
import { isPrintableName, posixArgument } from "./shellArgv";
import { ADVISORY_FLAT_MAX, RANGE_INLINE_MAX } from "./sheetThresholds";

const BLOCKED = "needs a PHP your target does not run";
const SECURITY_FIX_WORDS = vocabTable<Record<string, string>>({
  unknown: "not known",
  none: "none available",
  blocked: BLOCKED,
});

const securityFixWord = (kind: string): string => SECURITY_FIX_WORDS[kind] ?? fixLabel(kind);
/** The fix label of a ladder rung and an advisory row, which name what blocks a blocked fix. */
export const ladderFixWord = (kind: string): string => (kind === "blocked" ? BLOCKED : fixLabel(kind));

export function holderWord({ source, package: name }: Pick<HeldBy, "source" | "package">): string {
  return source === "root" || name === null ? "composer.json" : name;
}

/** G138: each holder once, in first-seen order. */
const uniqueHolders = (held: readonly Pick<HeldBy, "source" | "package">[]): string[] => [
  ...new Set(held.map(holderWord)),
];

/** "after it: {bound}{total}, {verdict}", with its conditions (G139). A move that the check stopped
 *  drops the Composer caveat, and " · " and its short check words end the line. */
export function afterIt(applied: BranchFixes["if_applied"], stopped: string | null = null): string | null {
  if (applied === null) return stopped;
  const noNew = applied.assumes.includes("no_new_advisories");
  const bound = applied.at_most ? (noNew ? "at most, from the facts it checked, " : "at most ") : "";
  return (
    `after it: ${bound}${applied.total}, ${applied.verdict}` +
    (stopped === null && applied.assumes.includes("composer_resolves") ? `, ${COMPOSER_CAVEAT}` : "") +
    (noNew ? ", advisories on its new versions not checked" : "") +
    (stopped === null ? "" : ` · ${stopped}`)
  );
}

export const COMPOSER_CAVEAT = "if Composer resolves it";

export interface SecurityRung {
  readonly branch: string;
  readonly installed: boolean;
  readonly move: boolean;
  /** "your branch" and "the move". */
  readonly marks: readonly string[];
  readonly clears: string;
  readonly kind: string;
  readonly after: string | null;
  readonly afterVerdict: string | null;
}

/** A rung's golden lines (G137 to G139). */
export const rungLines = (r: SecurityRung): string[] => [
  [r.branch, ...r.marks, r.clears].join(" "),
  r.kind,
  ...(r.after === null ? [] : [r.after]),
];

/** One rung per branch row that fixes an advisory, lowest branch first (G137 to G140). */
export function securityRungs(finding: Finding, metadata: RepositoryMetadata | null): SecurityRung[] {
  const move = finding.next_step;
  const heldCount = move?.held_by.length ?? 0;
  const shown = uniqueHolders(move?.held_by ?? []);
  const moveBranch = move?.to_branch ?? null;
  const held = (holders: readonly string[]): string =>
    shown.length < 2 || !shown.every((w) => holders.includes(w))
      ? joinAnd(holders)
      : joinAnd([...holders.filter((w) => !shown.includes(w)), `the ${heldCount} in Held by`]);
  return [...(metadata?.branches ?? [])].reverse().flatMap((row) => {
    const fixes = row.fixes;
    if (fixes === null || fixes.fixed === 0) return [];
    const isMove = moveBranch !== null && row.branch === moveBranch;
    const holders = uniqueHolders(fixes.held_by);
    return [
      {
        branch: row.branch,
        installed: row.installed,
        move: isMove,
        marks: [...(row.installed ? ["your branch"] : []), ...(isMove ? ["the move"] : [])],
        clears: `clears ${fixes.fixed} of ${fixes.of}${fixes.lowest ? ` from ${fixes.lowest}` : ""}`,
        kind:
          ladderFixWord(fixes.fix_kind ?? "unknown") +
          (holders.length > 0 ? ` · held by ${held(holders)}` : ""),
        after: afterIt(fixes.if_applied, stoppedCheckWords(fixes.check)),
        afterVerdict: fixes.if_applied?.verdict ?? null,
      },
    ];
  });
}

export interface SecuritySummary {
  readonly head: string;
  readonly counts: readonly { readonly severity: Severity; readonly count: number }[];
  readonly lines: readonly string[];
}

function securitySummary(finding: Finding, run: Run): SecuritySummary {
  const { security } = finding;
  const records =
    security.records === null
      ? []
      : [`${security.records === 0 ? "none" : security.records} on record for this name`];
  const ignored =
    security.ignored_count > 0 ? [`${security.ignored_count} ignored by Composer's audit policy`] : [];
  const lookup = lookupWord(security.check, security.unchecked_reason, finding.origin.kind);
  if (!isSecurityVulnerable(security)) {
    return {
      head: security.status === "clear" ? "no counted advisory" : "advisories not known",
      counts: [],
      lines: [...records, ...ignored, lookup],
    };
  }
  const byId: Readonly<Record<string, number | undefined>> = security.counts;
  const counts = run.score_model.severities
    .map(({ id }) => ({ severity: id, count: byId[id] ?? 0 }))
    .filter(({ count }) => count > 0);
  const total = counts.reduce((sum, { count }) => sum + count, 0);
  const [only] = counts;
  const one = total === 1 && counts.length === 1 && only !== undefined;
  const kind = security.fix_kind;
  const rows = advisoryRows(finding);
  const sharing = rows.filter((row) => row.fix.kind === kind).length;
  const partly =
    (kind === "none" || kind === "unknown") && sharing > 0 && sharing < rows.length
      ? ` for ${sharing} of ${rows.length}`
      : "";
  return {
    head: one ? `1 ${only.severity} advisory` : `${total} advisories:`,
    counts: one ? [] : counts,
    lines: [...records, ...ignored, `fix: ${securityFixWord(kind)}${partly}`, lookup],
  };
}

/** The Meanwhile line (G128): what a plain update of the package installs and clears. */
function meanwhile(finding: Finding): Rich | null {
  const partial = isSecurityVulnerable(finding.security) ? finding.security.partial : null;
  if (partial === null) return null;
  const applied = partial.if_applied;
  const of = isScoreGraded(finding.score) ? finding.score.parts.security.of : 0;
  const cleared = partial.clears.filter((c) => c.kind === "advisory").length;
  const facts = [
    ...partial.clears.filter((c) => c.kind === "flag").map((c) => c.id),
    `${cleared} of its ${of} advisories`,
  ];
  const command = isPrintableName(finding.package)
    ? { code: `composer update ${posixArgument(finding.package)}` }
    : "an update of this package";
  return [
    "Meanwhile, ",
    command,
    ` installs ${partial.version}, which clears ${joinAnd(facts)} ` +
      `(${applied.at_most ? "at most " : ""}${applied.total}, ${applied.verdict} after it` +
      (applied.assumes.includes("no_new_advisories") ? ", if that release carries no new advisory" : "") +
      (partial.unverified.length > 0
        ? `; not checked: ${partial.unverified.map((u) => u.id).join(", ")}`
        : "") +
      ")",
  ];
}

/** The S9 rows by severity in the model's order, an unknown severity last by its id (decision D9). */
function sortedAdvisories(finding: Finding, run: Run): S9row[] {
  const order: readonly string[] = run.score_model.severities.map((s) => s.id);
  const rank = (severity: string): number =>
    order.includes(severity) ? order.indexOf(severity) : order.length;
  return advisoryRows(finding)
    .map((row, at) => ({ row, at }))
    .sort((a, b) => {
      const ra = rank(a.row.severity);
      const rb = rank(b.row.severity);
      if (ra !== rb) return ra - rb;
      if (ra === order.length && a.row.severity !== b.row.severity)
        return a.row.severity < b.row.severity ? -1 : 1;
      return a.at - b.at;
    })
    .map(({ row }) => row);
}

function advisoryFixWords(fix: S9fix): string {
  if (fix.kind === "none") return "no release fixes it";
  if (fix.kind === "unknown" || fix.version === null) return "fix not known";
  const where =
    fix.to_branch === null ? "" : ` on ${fix.to_branch}${fix.on_installed_branch ? ", your branch" : ""}`;
  return `fix ${fix.version}${where} (${ladderFixWord(fix.kind)})`;
}

/** A string cut after each "|" that ends an alternative: a "||" stays whole. */
export const barParts = (text: string): string[] => text.split(/(?<=\|)(?!\|)/);

const rangeCount = (text: string): number => text.split(/\s*\|\|?\s*/).filter((part) => part !== "").length;

export interface AdvisoryAffects {
  /** "19 ranges" when the string folds, else null: the string shows inline. */
  readonly folded: string | null;
  readonly range: string;
  readonly parts: readonly string[];
}

export interface AdvisoryItem {
  readonly name: string;
  readonly href: string | null;
  readonly linkName: string;
  readonly source: string | null;
  readonly deciding: boolean;
  readonly severity: Severity;
  readonly fix: string;
  readonly affects: AdvisoryAffects | null;
  /** The earlier row that carries the same CVE: its id and its place in `rows`. */
  readonly sameAs: { readonly id: string; readonly at: number } | null;
}

export interface AdvisoryGroup {
  readonly severity: Severity;
  readonly count: number;
  readonly words: string;
  readonly open: boolean;
  /** The places of its rows in `rows`. */
  readonly rows: readonly number[];
}

export interface SecurityBlock extends SecuritySummary {
  readonly meanwhile: Rich | null;
  readonly caption: readonly string[];
  /** Empty for a flat list. */
  readonly groups: readonly AdvisoryGroup[];
  readonly rows: readonly AdvisoryItem[];
  readonly ignored: readonly string[];
  readonly ladder: readonly SecurityRung[];
}

export function advisoryAffects(range: string | null): AdvisoryAffects | null {
  if (!range) return null;
  const n = rangeCount(range);
  return {
    folded: range.length > RANGE_INLINE_MAX ? `${n} ${pluralNoun(n, "range", "ranges")}` : null,
    range,
    parts: barParts(range),
  };
}

function groupsOf(rows: readonly S9row[], run: Run): AdvisoryGroup[] {
  if (rows.length <= ADVISORY_FLAT_MAX) return [];
  const runs: { severity: Severity; rows: number[] }[] = [];
  rows.forEach((row, at) => {
    const last = runs.at(-1);
    if (last?.severity === row.severity) last.rows.push(at);
    else runs.push({ severity: row.severity, rows: [at] });
  });
  return runs.map((g, i) => {
    const countsAs = run.score_model.severities.find((s) => s.id === g.severity)?.counts_as ?? null;
    return {
      severity: g.severity,
      count: g.rows.length,
      words:
        pluralNoun(g.rows.length, "advisory", "advisories") + (countsAs ? `, counted as ${countsAs}` : ""),
      open: i === 0 || g.rows.some((at) => rows[at]?.deciding === true),
      rows: g.rows,
    };
  });
}

export function securityBlock(
  finding: Finding,
  run: Run,
  metadata: RepositoryMetadata | null,
): SecurityBlock {
  const sorted = sortedAdvisories(finding, run);
  const firstOfCve = new Map<string, number>();
  const rows = sorted.map((row, at): AdvisoryItem => {
    const first = row.cve ? firstOfCve.get(row.cve) : undefined;
    if (row.cve && first === undefined) firstOfCve.set(row.cve, at);
    const name = row.cve ?? row.id;
    return {
      name,
      href: safeHref(row.link),
      linkName: newTab(name),
      source: row.cve !== null && row.cve !== row.id ? row.id : null,
      deciding: row.deciding,
      severity: row.severity,
      fix: advisoryFixWords(row.fix),
      affects: advisoryAffects(row.affected_versions),
      sameAs: first === undefined ? null : { id: sorted[first]?.id ?? "", at: first },
    };
  });
  const repeats = rows.filter((r) => r.sameAs !== null).length;
  const security = finding.security;
  return {
    ...securitySummary(finding, run),
    meanwhile: meanwhile(finding),
    caption:
      rows.length === 0
        ? []
        : [
            `By severity. Each affects your version, ${finding.version}.`,
            ...(repeats > 0
              ? [`${repeats} ${pluralNoun(repeats, "repeats", "repeat")} the CVE of another row.`]
              : []),
          ],
    groups: groupsOf(sorted, run),
    rows,
    ignored: isSecurityVulnerable(security)
      ? security.ignored.map(
          ({ id, cve, severity, by, reason }) =>
            `${cve ?? id} (${severity}) ignored by ${by}${reason === null ? ", no reason given" : `: ${reason}`}`,
        )
      : [],
    ladder: securityRungs(finding, metadata),
  };
}

/** The fixed words of the Security row: the list's and the ladder's names, and a row's parts. */
export const SECURITY_WORDS = {
  deciding: "deciding",
  affects: "affects ",
  separator: " · ",
  sameAs: "same CVE as ",
} as const;

/** G140: the ladder's name. */
export const waysOut = (n: number): string => `${n} ${pluralNoun(n, "way", "ways")} out`;

/** The flat list's name. */
export const advisoriesName = (n: number): string => `${n} ${pluralNoun(n, "advisory", "advisories")}`;

/** G123: a summary count that opens its group. */
export const showGroupName = (count: number, severity: string): string =>
  `${count} ${severity}, show the group`;
