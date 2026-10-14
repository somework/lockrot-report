/**
 * The Release branches line of the detail sheet (SPEC §7.9.8): the installed branch, then every
 * higher one, lowest first, with the php each needs.
 */

import type { Finding, ReleaseBranch, RepositoryMetadata } from "../model/report2";
import { ago } from "./ago";
import { phpConstraintWord } from "./phpAlternatives";

function installedClause(finding: Finding, installed: ReleaseBranch | undefined): string {
  if (installed === undefined) return `A branch snapshot, ${finding.version}, is installed`;
  const last = finding.age.branch_release;
  const release = last === null ? "has no dated release" : `had its last release ${ago(last.years)}`;
  const { requires, target_runs: targetRuns } = finding.installed_php;
  const unrunnable =
    targetRuns === false && requires !== null
      ? ` (the version you have, ${finding.version}, needs php ${phpConstraintWord(requires)}, which your target does not run)`
      : "";
  return `Your branch, ${installed.branch}, ${release}${unrunnable}`;
}

function phpReach(row: ReleaseBranch): string {
  if (row.admits_target_php === false) return ", which your target does not run";
  if (row.admits_project_php !== false) return "";
  return row.misses_project_php === "needs_newer"
    ? ", above your require.php"
    : ", which your require.php does not admit";
}

function higherBranch(row: ReleaseBranch): string {
  const released =
    row.released_years === null
      ? `has ${row.highest} (undated)`
      : `released ${row.highest} ${ago(row.released_years)}`;
  // TODO: FIX-RENDER-INPUTS - read `highest_php` here once lockrot adds it to the branch rows; `php` is read until then.
  const needs = row.php === null ? "" : ` and needs php ${phpConstraintWord(row.php)}${phpReach(row)}`;
  return `${row.branch} ${released}${needs}`;
}

/** `null` when the report carries no branch table. Rows are published highest first. */
export function branchesLine(finding: Finding, metadata: RepositoryMetadata | null): string | null {
  const rows = metadata?.branches ?? [];
  if (rows.length === 0) return null;

  const installedAt = rows.findIndex(({ installed }) => installed);
  const higher = [...(installedAt === -1 ? rows : rows.slice(0, installedAt))].reverse();
  const head = installedClause(finding, rows[installedAt]);

  return `${head}; ${higher.length === 0 ? "no higher branch" : higher.map(higherBranch).join("; ")}.`;
}
