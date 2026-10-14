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

function afterIt({ if_applied: applied }: BranchFixes): string {
  if (applied === null) return "";
  const noNew = applied.assumes.includes("no_new_advisories");
  const atMost = applied.at_most ? (noNew ? "at most, from the facts it checked, " : "at most ") : "";
  const resolves = applied.assumes.includes("composer_resolves") ? ", if Composer resolves it" : "";
  return `; after it: ${atMost}${applied.total}, ${applied.verdict}${resolves}${noNew ? ", advisories on its new versions not checked" : ""}`;
}

function rungTail(fixes: BranchFixes): string {
  const holders = fixes.held_by.map(holderWord);
  return `${holders.length === 0 ? "" : `; held by ${joinAnd(holders)}`}${afterIt(fixes)}`;
}

function ladder(metadata: RepositoryMetadata | null): string[] {
  return [...(metadata?.branches ?? [])]
    .reverse()
    .flatMap(({ branch, fixes }) =>
      fixes === null || fixes.fixed === 0
        ? []
        : [
            `${branch} clears ${fixes.fixed} of ${fixes.of}${fixes.lowest === null ? "" : ` from ${fixes.lowest}`} (${
              fixes.fix_kind === "blocked" ? BLOCKED : fixLabel(fixes.fix_kind ?? "unknown")
            }${rungTail(fixes)})`,
          ],
    );
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

export function securityLine(finding: Finding, run: Run, metadata: RepositoryMetadata | null): string {
  const { security } = finding;
  const records =
    security.records === null
      ? []
      : [`${security.records === 0 ? "none" : security.records} on record for this name`];
  const ignored =
    security.ignored_count > 0 ? [`${security.ignored_count} ignored by Composer's audit policy`] : [];
  const lookup = lookupWord(security.check, security.unchecked_reason, finding.origin.kind);

  if (!isSecurityVulnerable(security)) {
    return [
      security.status === "clear" ? "no counted advisory" : "advisories not known",
      ...records,
      ...ignored,
      lookup,
    ].join(" · ");
  }
  return [
    advisoryCounts(security, run),
    ...records,
    ...ignored,
    `fix: ${securityFixWord(security.fix_kind)}${partialFix(finding, security.fix_kind)}`,
    lookup,
    ...ladder(metadata),
  ].join(" · ");
}
