/**
 * The Security line of the detail sheet (SPEC §7.9.8): the advisories a package carries, the fix
 * that clears them, and each release branch that clears them, with who holds it and the score after.
 */

import type {
  BranchFixes,
  Finding,
  HeldBy,
  Run,
  RepositoryMetadata,
  SecurityVulnerable,
} from "../model/report2";
import { isSecurityVulnerable } from "../model/report2";
import { advisoryRows } from "./advisoryRows";
import { joinAnd } from "./joinWords";
import { fixLabel, lookupWord } from "./pageVocabulary";

const BLOCKED = "needs a PHP your target does not run";

const SECURITY_FIX_WORDS: Readonly<Record<string, string>> = {
  unknown: "not known",
  none: "none available",
  blocked: BLOCKED,
};

const securityFixWord = (kind: string): string => SECURITY_FIX_WORDS[kind] ?? fixLabel(kind);

function holderWord({ source, package: name }: HeldBy): string {
  return source === "root" || name === null ? "composer.json" : name;
}

function afterIt({ if_applied: applied }: BranchFixes): string | null {
  if (applied === null) return null;
  const noNew = applied.assumes.includes("no_new_advisories");
  const atMost = applied.at_most ? (noNew ? "at most, from the facts it checked, " : "at most ") : "";
  const resolves = applied.assumes.includes("composer_resolves") ? ", if Composer resolves it" : "";
  return `after it: ${atMost}${applied.total}, ${applied.verdict}${resolves}${noNew ? ", advisories on its new versions not checked" : ""}`;
}

/** One way out of the ladder (P2). `clause` and `after` together are its golden clause after the branch. */
export interface SecurityRung {
  readonly branch: string;
  /** From "clears" up to the "after it" part, which `after` holds apart so the page can tone it. */
  readonly clause: string;
  readonly after: string | null;
  readonly afterVerdict: string | null;
  readonly fixed: number;
  readonly of: number;
  /** The fix class, as the rung names it. */
  readonly label: string;
}

/** The rung's clause after its branch, word for word: "clears 1 of 1 from v5.4.52 (upgrade; …)". */
export function rungText({ clause, after }: SecurityRung): string {
  return `${clause}${after === null ? "" : `; ${after}`})`;
}

function rung(branch: string, fixes: BranchFixes): SecurityRung {
  const label = fixes.fix_kind === "blocked" ? BLOCKED : fixLabel(fixes.fix_kind ?? "unknown");
  const holders = fixes.held_by.map(holderWord);
  return {
    branch,
    clause:
      `clears ${fixes.fixed} of ${fixes.of}${fixes.lowest === null ? "" : ` from ${fixes.lowest}`} (${label}` +
      (holders.length === 0 ? "" : `; held by ${joinAnd(holders)}`),
    after: afterIt(fixes),
    afterVerdict: fixes.if_applied?.verdict ?? null,
    fixed: fixes.fixed,
    of: fixes.of,
    label,
  };
}

function ladder(metadata: RepositoryMetadata | null): SecurityRung[] {
  return [...(metadata?.branches ?? [])]
    .reverse()
    .flatMap(({ branch, fixes }) => (fixes === null || fixes.fixed === 0 ? [] : [rung(branch, fixes)]));
}

function advisoryCounts(security: SecurityVulnerable, run: Run): string {
  const counts = run.score_model.severities
    .map(({ id }) => [id, security.counts[id]] as const)
    .filter(([, count]) => count > 0);
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  const [[only] = []] = counts;
  return total === 1 && only !== undefined
    ? `1 ${only} advisory`
    : `${total} advisories: ${counts.map(([id, count]) => `${count} ${id}`).join(", ")}`;
}

/** ` for k of n` once the fix kind is `none` or `unknown` for only k of the n counted advisories. */
function partialFix(finding: Finding, kind: string): string {
  const rows = advisoryRows(finding);
  const sharing = rows.filter((row) => row.fix.kind === kind).length;
  return (kind === "none" || kind === "unknown") && sharing > 0 && sharing < rows.length
    ? ` for ${sharing} of ${rows.length}`
    : "";
}

/** The Security row: its summary, then its ladder of ways out, lowest branch first. */
export interface SecurityRow {
  readonly summary: string;
  readonly rungs: readonly SecurityRung[];
}

export function securityRow(finding: Finding, run: Run, metadata: RepositoryMetadata | null): SecurityRow {
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
      summary: [
        security.status === "clear" ? "no counted advisory" : "advisories not known",
        ...records,
        ...ignored,
        lookup,
      ].join(" · "),
      rungs: [],
    };
  }
  return {
    summary: [
      advisoryCounts(security, run),
      ...records,
      ...ignored,
      `fix: ${securityFixWord(security.fix_kind)}${partialFix(finding, security.fix_kind)}`,
      lookup,
    ].join(" · "),
    rungs: ladder(metadata),
  };
}

export function securityLine(finding: Finding, run: Run, metadata: RepositoryMetadata | null): string {
  const { summary, rungs } = securityRow(finding, run, metadata);
  return [summary, ...rungs.map((r) => `${r.branch} ${rungText(r)}`)].join(" · ");
}

/** The level-0 button over the rungs after the first: "3 more ways out: 6.x, 7.x and 8.x (php floor raise)". */
export function moreWaysOut(rest: readonly SecurityRung[]): string {
  const labels = new Set(rest.map((r) => r.label));
  const [only] = labels;
  return (
    `${rest.length} more ${rest.length === 1 ? "way" : "ways"} out: ${joinAnd(rest.map((r) => r.branch))}` +
    (labels.size === 1 && only !== undefined ? ` (${only})` : "")
  );
}
