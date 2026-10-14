/**
 * report-2 as lockrot publishes it. The document shapes are lockrot's TypeScript contract, vendored
 * under contract/ as written (every key required); only the html embed's `details` is typed here,
 * because no report-2 type covers it (DESIGN.md §2).
 */

import type {
  BranchFixes,
  DateTime,
  PackageName,
  Report2,
  Score,
  ScoreGraded,
  Security,
  SecurityVulnerable,
  Signal,
  Term,
  TermSecurity,
  Years,
} from "../../contract/lockrot-report-2";

export type * from "../../contract/lockrot-report-2";

/** Every root key of report-2. A key the contract adds and this list lacks fails the type check. */
export const REPORT2_KEYS = [
  "$schema",
  "lockrot",
  "generated_at",
  "run",
  "activity_cache_oldest_at",
  "activity_cache_age_hours",
  "packages_checked",
  "packages_flagged",
  "packages_multi_flag",
  "include_dev",
  "not_from_composer_repository",
  "packages_unchecked_accepted",
  "network_failures",
  "counts",
  "flags",
  "priorities",
  "abandoned",
  "exposure",
  "exposure_rule",
  "unattributed",
  "libyears",
  "baseline",
  "notes",
  "note_details",
  "gate",
  "data_date",
  "rot_depth",
  "security",
  "findings",
] as const satisfies readonly (keyof Report2)[];

const _everyKey: [Exclude<keyof Report2, (typeof REPORT2_KEYS)[number]>] extends [never] ? true : never =
  true;

// explain-2's `lock` and `repositoryMetadata` (Q9 of the 0.14 handoff: they validate `details`).

export interface DetailsLock {
  php: string | null;
  released: DateTime | null;
  repository: string | null;
  from_composer_repository: boolean;
  dev: boolean;
  branch_snapshot: boolean;
  type: string;
}

export type PhpBlockedBy = "project" | "target" | (string & {});
export type PhpMiss = "needs_newer" | "stops_before" | "skips" | "unsatisfiable" | (string & {});

export interface ReleaseBranch {
  branch: string;
  installed: boolean;
  highest: string;
  highest_released: DateTime | null;
  highest_commit_date: DateTime | null;
  newest_dated: string;
  newest_dated_released: DateTime | null;
  dated_by: PackageName | null;
  php: string | null;
  admits_target_php: boolean | null;
  admits_project_php: boolean | null;
  php_blocked_by: PhpBlockedBy | null;
  misses_target_php: PhpMiss | null;
  misses_project_php: PhpMiss | null;
  released_years: Years | null;
  fixes: BranchFixes | null;
}

export interface RepositoryMetadata {
  abandoned: boolean;
  replacement: string | null;
  releases_listed: number;
  has_stable_release: boolean;
  last_stable_release: DateTime | null;
  last_stable_version: string | null;
  last_stable_dated_by: PackageName | null;
  installed_release: DateTime | null;
  installed_release_dated_by: PackageName | null;
  repository: string | null;
  type: string;
  data_date: DateTime;
  branches: ReleaseBranch[];
  installed_branch: string | null;
}

export interface DetailsEntry {
  lock: DetailsLock;
  metadata: RepositoryMetadata | null;
  /** No schema defines it: lockrot writes the repository URL only when it is a link without credentials. */
  repository_link: string | null;
}

/** Keyed by package: each graded package and each ungraded one with an S9 signal, or all under `--all`. */
export type Details = Record<PackageName, DetailsEntry>;

export interface Report2Embed {
  report: Report2;
  details: Details;
}

export function isScoreGraded(score: Score): score is ScoreGraded {
  return "terms" in score;
}

export function isTermSecurity(term: Term): term is TermSecurity {
  return term.part === "security";
}

export function isSecurityVulnerable(security: Security): security is SecurityVulnerable {
  return security.status === "vulnerable";
}

export function isSignal<I extends Signal["id"]>(
  signal: Signal,
  id: I,
): signal is Extract<Signal, { id: I }> {
  return signal.id === id;
}
