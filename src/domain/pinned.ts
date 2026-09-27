/**
 * S6's facts, and every word the page says about a pinned package or an S6: the answer's clause
 * (`domain/answer.ts`), the key facts' second slot (`detail/DetailLead.tsx`), a run's reason
 * (`views/LedgerNotes.tsx`) and an age cell's context reason (`views/AgeScale.tsx`). One place, so
 * no two of them read S6 two ways.
 *
 * S6 fires for one of two cases, which lockrot 0.13.0 names in `data.reason`: `branch_snapshot`, the
 * installed version is a branch (`dev-main`, `2.x-dev`), checked first, so a snapshot of a package
 * that never tagged anything is a snapshot; and `no_stable_release`, the installed version is not a
 * branch and the repository lists no tag at all. "Stable" in those names is lockrot's word: a
 * pre-release tag counts as a tag, so the page says "tagged" and "newest dated tag", never "stable".
 *
 * Every 0.13 fact keeps four states: a value, false, `null` (the document's "no answer": no
 * repository metadata was loaded) and absent (a document written before 0.13.0), which is an absent
 * property. A document without `reason` keeps the words it had before 0.13 — "a branch snapshot" —
 * unless its lock says the installed version is not a branch.
 *
 * Display only: it reads fields and picks words; it decides nothing lockrot did not.
 */

import type { ExplainLock, ExplainMetadata, Finding, PackageDetails } from "../model/types";

/** The reasons this renderer has words for. Any other string is shown as S6's own summary. */
const KNOWN_REASONS: readonly string[] = ["branch_snapshot", "no_stable_release"];

export interface S6Reason {
  /** `data.reason` as written. */
  readonly raw: string;
  /** Whether it is one of the two reasons lockrot 0.13.0 documents. */
  readonly known: boolean;
}

export interface PinnedFacts {
  /** S6's `data.version`, else the finding's own version. */
  readonly version: string;
  /** S6's summary as lockrot wrote it; `null` when the finding carries no S6. */
  readonly summary: string | null;
  /** Which case fired. Absent on a document written before 0.13.0. */
  readonly reason?: S6Reason;
  /** Whether the repository lists any tag (a pre-release counts, a branch does not); `null` when no
   *  repository metadata was loaded. S6's own, else the explain metadata's. */
  readonly hasStableRelease?: boolean | null;
  /** The version the newest dated tag names: the newest dated, not necessarily the highest, and
   *  perhaps a pre-release. `null` exactly when `lastStableRelease` is. */
  readonly lastStableVersion?: string | null;
  /** The newest dated tag's date. `null` when there is no tag, no metadata, or no date lockrot trusts. */
  readonly lastStableRelease?: string | null;
  /** The monorepo parent whose tag dates `lastStableRelease`; `null` when the date is the package's own. */
  readonly lastStableDatedBy?: string | null;
  /** For a snapshot, the date of the commit the branch pointed at, not a release: S6's own, else the
   *  lock's `time` when the lock says the version is a branch. */
  readonly snapshotTime?: string | null;
}

/** How the page words a pinned package: a branch snapshot, a version in a repository with no tag,
 *  or neither it can name (an S6 reason it does not know, or an older lock that says not a branch). */
export type PinnedKind = "snapshot" | "untagged" | "other";

type Data = Readonly<Record<string, unknown>>;

type Picked<T> = { readonly present: true; readonly value: T } | { readonly present: false };

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** S6's own key when it carries it (a wrong type is no answer), else the metadata's when there is
 *  metadata, else absent. */
function pick<T>(
  data: Data | null,
  key: string,
  read: (value: unknown) => T | null,
  fallback: (() => T | null) | null,
): Picked<T | null> {
  if (data !== null && Object.hasOwn(data, key)) return { present: true, value: read(data[key]) };
  if (fallback !== null) return { present: true, value: fallback() };
  return { present: false };
}

/** The picked value under `key`, or nothing at all when it is absent: an absent fact stays an
 *  absent property, never `undefined` written under the key. */
function field<K extends keyof PinnedFacts>(key: K, picked: Picked<PinnedFacts[K]>): Partial<PinnedFacts> {
  return picked.present ? { [key]: picked.value } : {};
}

/**
 * S6's facts, S6's own data first, the explain metadata (and, for the snapshot's date, the lock)
 * second. `null` when the finding carries no S6 and is not pinned: there is nothing to word.
 */
export function pinnedFacts(finding: Finding, details: PackageDetails | null): PinnedFacts | null {
  const s6 = finding.signals.find((s) => s.id === "S6");
  if (s6 === undefined && finding.verdict !== "pinned") return null;

  const data: Data | null = s6?.data ?? null;
  const meta: ExplainMetadata | null = details?.metadata ?? null;
  const lock: ExplainLock | null = details?.lock ?? null;
  const fromMeta = <T>(read: (m: ExplainMetadata) => T): (() => T) | null =>
    meta === null ? null : () => read(meta);

  const reason = nullableString(data?.["reason"]);
  return {
    version: nullableString(data?.["version"]) ?? finding.version,
    summary: s6?.summary ?? null,
    ...(reason !== null ? { reason: { raw: reason, known: KNOWN_REASONS.includes(reason) } } : {}),
    ...field(
      "hasStableRelease",
      pick(
        data,
        "has_stable_release",
        nullableBoolean,
        fromMeta((m) => m.hasStableRelease),
      ),
    ),
    ...field(
      "lastStableVersion",
      pick(
        data,
        "last_stable_version",
        nullableString,
        fromMeta((m) => m.lastStableVersion),
      ),
    ),
    ...field(
      "lastStableRelease",
      pick(
        data,
        "last_stable_release",
        nullableString,
        fromMeta((m) => m.lastStableRelease),
      ),
    ),
    ...field(
      "lastStableDatedBy",
      pick(
        data,
        "last_stable_dated_by",
        nullableString,
        fromMeta((m) => m.lastStableDatedBy),
      ),
    ),
    ...field(
      "snapshotTime",
      pick(data, "snapshot_time", nullableString, lock?.branchSnapshot === true ? () => lock.released : null),
    ),
  };
}

/**
 * Which words fit: the reason when lockrot named one it documents; for a document without a reason,
 * a snapshot — the only reading such a page ever gave — unless its lock is there and says the version
 * is not a branch. A reason this renderer does not know is `other`, whatever the lock says: lockrot
 * fired S6 for a case the page has no words for, so the page quotes it.
 */
export function pinnedKind(facts: PinnedFacts, lock: ExplainLock | null): PinnedKind {
  const reason = facts.reason;
  if (reason !== undefined) {
    if (reason.raw === "branch_snapshot") return "snapshot";
    if (reason.raw === "no_stable_release") return "untagged";
    return "other";
  }
  return lock !== null && lock.branchSnapshot === false ? "other" : "snapshot";
}

/**
 * The key facts' second slot for an S6 or pinned package with no age signal to date it.
 * - `release`: the slot keeps its "Last release" label and its `words` say there is none. `commit`
 *   is absent on a document written before 0.13.0, whose slot dates the installed version as it
 *   always did; on a 0.13 one it is S6's `snapshot_time`, the commit the branch pointed at (`null`
 *   when there is none to give, as for a version that is not a branch).
 * - `snapshot`: the slot is labelled for what it dates, the branch's commit, which is not a release.
 */
export type PinnedSlot =
  | { readonly label: "release"; readonly words: string; readonly commit?: string | null }
  | { readonly label: "snapshot"; readonly commit: string | null };

/**
 * Which slot fits:
 * - "none, a snapshot" — any snapshot on a document written before 0.13.0 (its words then), or on a
 *   0.13 one a snapshot of a package that lists no tag, dated by the commit;
 * - a `snapshot` slot — on a 0.13 document, a snapshot of a package that lists a tag, or of one
 *   lockrot loaded no metadata for: "none" would claim a release it does not know is missing, and
 *   "Last release" over the commit's date would give the package a release it never made;
 * - "none tagged", with no date — a version in a repository that lists no tag: its lock time is
 *   neither a release nor a snapshot (lockrot's `snapshot_time` is null for it);
 * - for a reason it does not know, a `snapshot` slot when the lock says the version is a branch, and
 *   `null` otherwise: the slot then reads as for any package, from the installed version's date.
 */
export function pinnedReleaseSlot(facts: PinnedFacts, lock: ExplainLock | null): PinnedSlot | null {
  const commit = facts.snapshotTime ?? null;
  switch (pinnedKind(facts, lock)) {
    case "snapshot":
      if (facts.reason === undefined) return { label: "release", words: "none, a snapshot" };
      return facts.hasStableRelease === false
        ? { label: "release", words: "none, a snapshot", commit }
        : { label: "snapshot", commit };
    case "untagged":
      return { label: "release", words: "none tagged", commit: null };
    case "other":
      return lock?.branchSnapshot === true ? { label: "snapshot", commit } : null;
  }
}

/** What every member of a run of pinned rows is, after "These N packages are all …": the kind they
 *  all share (`null` when they do not share one, or share one the page cannot name). */
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

/** A finding's kind straight from the model, for a caller that holds the finding and its details:
 *  `null` when it carries no S6 and is not pinned. */
export function pinnedKindOf(finding: Finding, details: PackageDetails | null): PinnedKind | null {
  const facts = pinnedFacts(finding, details);
  return facts === null ? null : pinnedKind(facts, details?.lock ?? null);
}
