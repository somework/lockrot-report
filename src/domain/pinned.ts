/**
 * Every word the page says about a pinned package reads S6 through here: S6's own field, else the
 * explain field that states the same fact. lockrot's "stable" means any tag, so the page says
 * "tagged".
 */

import type { ExplainLock, ExplainMetadata, Finding, PackageDetails } from "../model/types";
import { ageSource } from "./age";
import { ageText, day, gapShort, yearsBetween } from "./format";

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
  /** Whether the repository lists any tag: `null` is lockrot's no-answer, `undefined` a document
   *  with no field that says. */
  readonly hasStableRelease: boolean | null | undefined;
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

/** lockrot fires S6 on every branch snapshot, so a finding without it is not one. A known reason
 *  says which case fired; an unknown one does not, so the lock does. */
function branchSnapshotOf(hasS6: boolean, reason: S6Reason | null, lock: ExplainLock | null): boolean | null {
  if (!hasS6) return false;
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
  const branchSnapshot = branchSnapshotOf(s6 !== undefined, reason, lock);
  // `lock.released` is the commit's date only for a branch.
  const lockCommit = branchSnapshot === true ? (lock?.released ?? null) : null;

  return {
    version: nullableString(data?.["version"]) ?? finding.version,
    summary: s6?.summary ?? null,
    reason,
    hasStableRelease: statedTag(data, meta),
    lastStableVersion: pick(data, "last_stable_version", nullableString, meta?.lastStableVersion ?? null),
    lastStableRelease: pick(data, "last_stable_release", nullableString, meta?.lastStableRelease ?? null),
    lastStableDatedBy: pick(data, "last_stable_dated_by", nullableString, meta?.lastStableDatedBy ?? null),
    branchSnapshot,
    snapshotTime: pick(data, "snapshot_time", nullableString, lockCommit),
  };
}

/** `null` when the finding carries no S6 and is not pinned: there is nothing to word. */
export function pinnedFacts(finding: Finding, details: PackageDetails | null): PinnedFacts | null {
  const hasS6 = finding.signals.some((s) => s.id === "S6");
  return hasS6 || finding.verdict === "pinned" ? readPinnedFacts(finding, details) : null;
}

/** The metadata keeps no null apart from a missing key, so only S6's own null is lockrot's
 *  no-answer; a metadata null states nothing. */
function statedTag(data: Data | null, meta: ExplainMetadata | null): boolean | null | undefined {
  if (data !== null && Object.hasOwn(data, "has_stable_release"))
    return nullableBoolean(data["has_stable_release"]);
  return typeof meta?.hasStableRelease === "boolean" ? meta.hasStableRelease : undefined;
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

/** `release` keeps the "Last release" label and says there is none; `snapshot` dates the branch's
 *  commit. */
export type PinnedSlot =
  | { readonly label: "release"; readonly words: string; readonly commit: string | null }
  | { readonly label: "snapshot"; readonly commit: string | null };

/** "none, a snapshot" only when the repository lists no tag; for any other package "none" would
 *  claim a missing release. */
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

export function pinnedKindOf(finding: Finding, details: PackageDetails | null): PinnedKind | null {
  const facts = pinnedFacts(finding, details);
  return facts === null ? null : pinnedKind(facts);
}

/** The lock entry's label for `lock.released`: the lock's `time` is a release date only for a
 *  tagged, non-branch version. */
export function lockTimeLabel(finding: Finding, details: PackageDetails | null): string {
  if (readPinnedFacts(finding, details).branchSnapshot === true) return "snapshot dated";
  if (pinnedKindOf(finding, details) === "untagged") return "lock time";
  return "released";
}

/** The installed branch's commit, for the release-branches block's snapshot row. */
export function snapshotOf(
  finding: Finding,
  details: PackageDetails | null,
): { readonly time: string; readonly php: string | null } | null {
  const time = readPinnedFacts(finding, details).snapshotTime;
  return time === null ? null : { time, php: details?.lock?.php ?? null };
}

/** What the page may say about the package's tags: `unstated` says nothing. */
export type TagStanding = "tagged" | "none" | "unknown" | "not-a-tag" | "unstated";

export function tagStanding(facts: PinnedFacts): TagStanding {
  const kind = pinnedKind(facts);
  if (kind === "untagged") return "not-a-tag";
  if (kind !== "snapshot") return "unstated";
  if (facts.hasStableRelease === true) return "tagged";
  if (facts.hasStableRelease === false) return "none";
  return facts.hasStableRelease === null ? "unknown" : "unstated";
}

/** Years from the newest dated tag to the snapshot, negative when the tag is the newer; `null`
 *  unless a tagged snapshot carries both dates and both parse. */
export function snapshotTagGap(facts: PinnedFacts): number | null {
  if (tagStanding(facts) !== "tagged") return null;
  return yearsBetween(facts.lastStableRelease, facts.snapshotTime);
}

/** Whether the pinned answer words the tag fact, so the key facts need not repeat it. */
export function leadSaysTag(facts: PinnedFacts): boolean {
  const standing = tagStanding(facts);
  if (standing === "tagged") return snapshotTagGap(facts) !== null;
  return standing !== "unstated";
}

/** The Snapshot key fact's note, for a package whose answer does not word its tags. */
export function tagNote(facts: PinnedFacts, now: Date): string | null {
  switch (tagStanding(facts)) {
    case "tagged": {
      const version = facts.lastStableVersion;
      if (version === null) return "tagged";
      return `tag ${version}, ${facts.lastStableRelease === null ? "undated" : ageText(facts.lastStableRelease, now)}`;
    }
    case "none":
    case "not-a-tag":
      return "no tag";
    case "unknown":
      return "tags unknown";
    case "unstated":
      return null;
  }
}

export interface DatedPoint {
  readonly role: "tag" | "snapshot";
  readonly version: string | null;
  readonly day: string;
}

/** Level 1 of the answer's tag phrase: the two dates oldest first, or what "no tag" covers. */
export type TagDetail =
  | {
      readonly kind: "dates";
      readonly points: readonly [DatedPoint, DatedPoint];
      /** The gap, sign dropped: the points' order says which way. */
      readonly years: number;
      /** The package whose release dates the tag, when it is not this one. */
      readonly datedBy: string | null;
    }
  | { readonly kind: "none" }
  | { readonly kind: "not-a-tag"; readonly version: string };

export function pinnedTagDetail(facts: PinnedFacts): TagDetail | null {
  const standing = tagStanding(facts);
  if (standing === "none") return { kind: "none" };
  if (standing === "not-a-tag") return { kind: "not-a-tag", version: facts.version };
  const years = snapshotTagGap(facts);
  if (years === null || facts.lastStableRelease === null || facts.snapshotTime === null) return null;
  const tag: DatedPoint = {
    role: "tag",
    version: facts.lastStableVersion,
    day: day(facts.lastStableRelease),
  };
  const snapshot: DatedPoint = { role: "snapshot", version: facts.version, day: day(facts.snapshotTime) };
  return {
    kind: "dates",
    points: years >= 0 ? [tag, snapshot] : [snapshot, tag],
    years: Math.abs(years),
    datedBy: facts.lastStableDatedBy,
  };
}

/** A Findings row's why is as terse as every other row's ("5.x stopped; 8.x ships"). */
const WHY_MAX = 32;

function firstThatFits(candidates: readonly (string | null)[]): string | null {
  const kept = candidates.filter((c): c is string => c !== null);
  return kept.find((c) => c.length <= WHY_MAX) ?? kept[kept.length - 1] ?? null;
}

/**
 * The row's S6 words, from S6's own data alone so a search finds what the row shows; `null` keeps
 * S6's summary. The gap is left out where the age column already shows years, so two unrelated
 * ages never stand side by side.
 */
export function pinnedWhy(finding: Finding): string | null {
  if (!finding.signals.some((s) => s.id === "S6")) return null;
  const facts = readPinnedFacts(finding, null);
  switch (tagStanding(facts)) {
    case "not-a-tag":
      return firstThatFits([`${facts.version} is not a tag upstream`, "its version is not a tag"]);
    case "none":
      return "snapshot; no tag at all";
    case "unknown":
      return "snapshot; tags unknown";
    case "unstated":
      return null;
    case "tagged":
      return taggedWhy(facts, ageSource(finding) !== null);
  }
}

function taggedWhy(facts: PinnedFacts, ageShown: boolean): string | null {
  const version = facts.lastStableVersion;
  const years = snapshotTagGap(facts);
  if (years === null) {
    return version === null ? "snapshot of a tagged package" : firstThatFits([`snapshot; tag ${version}`]);
  }
  const way = years > 0 ? "after" : years < 0 ? "before" : "same day as";
  const gap = ageShown || years === 0 ? null : `${gapShort(years)} ${way}`;
  const tag = version === null ? null : `tag ${version}`;
  return firstThatFits([
    gap !== null && tag !== null ? `snapshot ${gap} ${tag}` : null,
    tag !== null ? `snapshot ${way} ${tag}` : null,
    gap !== null ? `snapshot ${gap} its tag` : null,
    `snapshot ${way} its newest tag`,
  ]);
}
