/**
 * S6's facts, and every word the page says about a pinned package: the answer's clause, the key
 * facts' release slot, a run's reason and an age cell's context reason all read S6 through here.
 * Each fact is S6's own field when S6 carries it, else the explain field that states the same fact.
 * lockrot says "stable" where it means any tag, a pre-release included, so the page says "tagged".
 */

import type { ExplainLock, ExplainMetadata, Finding, PackageDetails } from "../model/types";

const KNOWN_REASONS: readonly string[] = ["branch_snapshot", "no_stable_release"];

export interface S6Reason {
  readonly raw: string;
  readonly known: boolean;
}

export interface PinnedFacts {
  /** S6's `data.version`, else the finding's own. */
  readonly version: string;
  readonly summary: string | null;
  readonly reason: S6Reason | null;
  /** Whether the repository lists any tag; `null` when nothing says. */
  readonly hasStableRelease: boolean | null;
  readonly lastStableVersion: string | null;
  readonly lastStableRelease: string | null;
  readonly lastStableDatedBy: string | null;
  /** Whether the installed version is a branch; `null` when nothing says. */
  readonly branchSnapshot: boolean | null;
  /** The date of the commit a snapshot's branch pointed at: never a release date. */
  readonly snapshotTime: string | null;
}

export type PinnedKind = "snapshot" | "untagged" | "other";

type Data = Readonly<Record<string, unknown>>;

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** S6's own key when it carries one (a wrong type is no answer), else `fallback`. */
function pick<T>(
  data: Data | null,
  key: string,
  read: (value: unknown) => T | null,
  fallback: T | null,
): T | null {
  return data !== null && Object.hasOwn(data, key) ? read(data[key]) : fallback;
}

function readReason(data: Data | null): S6Reason | null {
  const raw = nullableString(data?.["reason"]);
  return raw === null ? null : { raw, known: KNOWN_REASONS.includes(raw) };
}

/** A known reason says whether the version is a branch; an unknown one does not, so the lock does. */
function branchSnapshotOf(reason: S6Reason | null, lock: ExplainLock | null): boolean | null {
  if (reason?.known === true) return reason.raw === "branch_snapshot";
  return lock?.branchSnapshot ?? null;
}

/** S6's facts for any finding, whether or not it carries S6. */
export function readPinnedFacts(finding: Finding, details: PackageDetails | null): PinnedFacts {
  const s6 = finding.signals.find((s) => s.id === "S6");
  const data: Data | null = s6?.data ?? null;
  const meta: ExplainMetadata | null = details?.metadata ?? null;
  const lock: ExplainLock | null = details?.lock ?? null;
  const reason = readReason(data);
  // `lock.released` is the commit's date only where the lock says the version is a branch.
  const lockCommit = lock?.branchSnapshot === true ? lock.released : null;

  return {
    version: nullableString(data?.["version"]) ?? finding.version,
    summary: s6?.summary ?? null,
    reason,
    hasStableRelease: pick(data, "has_stable_release", nullableBoolean, meta?.hasStableRelease ?? null),
    lastStableVersion: pick(data, "last_stable_version", nullableString, meta?.lastStableVersion ?? null),
    lastStableRelease: pick(data, "last_stable_release", nullableString, meta?.lastStableRelease ?? null),
    lastStableDatedBy: pick(data, "last_stable_dated_by", nullableString, meta?.lastStableDatedBy ?? null),
    branchSnapshot: branchSnapshotOf(reason, lock),
    snapshotTime: pick(data, "snapshot_time", nullableString, lockCommit),
  };
}

/** `null` when the finding carries no S6 and is not pinned: there is nothing to word. */
export function pinnedFacts(finding: Finding, details: PackageDetails | null): PinnedFacts | null {
  const hasS6 = finding.signals.some((s) => s.id === "S6");
  return hasS6 || finding.verdict === "pinned" ? readPinnedFacts(finding, details) : null;
}

/** A reason the page does not know is `other`: lockrot fired S6 for a case it has no words for. */
export function pinnedKind(facts: PinnedFacts): PinnedKind {
  if (facts.reason !== null) {
    if (facts.reason.raw === "branch_snapshot") return "snapshot";
    if (facts.reason.raw === "no_stable_release") return "untagged";
    return "other";
  }
  if (facts.branchSnapshot === true) return "snapshot";
  if (facts.branchSnapshot === false && facts.hasStableRelease === false) return "untagged";
  return "other";
}

/**
 * The key facts' second slot for an S6 or pinned package with no age signal to date it.
 * `release` keeps the "Last release" label and says there is none; `snapshot` is labelled for what
 * it dates, the branch's commit.
 */
export type PinnedSlot =
  | { readonly label: "release"; readonly words: string; readonly commit: string | null }
  | { readonly label: "snapshot"; readonly commit: string | null };

/**
 * "none, a snapshot" only when the repository lists no tag: for a tagged package, or one nothing is
 * known about, "none" would claim a missing release. `null` when the slot reads as for any package.
 */
export function pinnedReleaseSlot(facts: PinnedFacts): PinnedSlot | null {
  const commit = facts.snapshotTime;
  switch (pinnedKind(facts)) {
    case "snapshot":
      return facts.hasStableRelease === false
        ? { label: "release", words: "none, a snapshot", commit }
        : { label: "snapshot", commit };
    case "untagged":
      // Its lock time is neither a release nor a snapshot.
      return { label: "release", words: "none tagged", commit: null };
    case "other":
      return facts.branchSnapshot === true ? { label: "snapshot", commit } : null;
  }
}

/** Said after "These N packages are all …"; `null` when the run shares no kind. */
export function pinnedRunReason(kind: PinnedKind | null): string {
  switch (kind) {
    case "snapshot":
      return "pinned to a branch snapshot";
    case "untagged":
      return "without a tag in their repositories";
    default:
      return "pinned";
  }
}

/** Said after "age shown for context, not for priority —" on a pinned row's age cell. */
export function pinnedContextReason(kind: PinnedKind): string {
  switch (kind) {
    case "snapshot":
      return "flagged for being pinned to a branch snapshot";
    case "untagged":
      return "flagged because its repository lists no tag";
    case "other":
      return "flagged as pinned";
  }
}

/** `null` when the finding carries no S6 and is not pinned. */
export function pinnedKindOf(finding: Finding, details: PackageDetails | null): PinnedKind | null {
  const facts = pinnedFacts(finding, details);
  return facts === null ? null : pinnedKind(facts);
}

/** The installed branch's commit, for the release-branches block's snapshot row. */
export function snapshotOf(
  finding: Finding,
  details: PackageDetails | null,
): { readonly time: string; readonly php: string | null } | null {
  const time = readPinnedFacts(finding, details).snapshotTime;
  return time === null ? null : { time, php: details?.lock?.php ?? null };
}
