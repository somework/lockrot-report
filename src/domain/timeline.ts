/**
 * The "Release branches" block of a package's detail panel, as facts: which branches get a row, in
 * what order, which ones fold away, and where each one sits on one shared time axis that ends at
 * `now`. Ported from legacy's `timeline(meta, installedVersion)` (`report.js:669-709`) and since
 * redesigned answer-first (PD-TIMELINE-1..8, DESIGN.md §5); the M26 fix (label and date read off the
 * same tag) is unchanged.
 *
 * Display only: every value here is a field lockrot already wrote (BranchRow, the lock entry) or
 * arithmetic on two of them — an order, a count, the time between two dates. Nothing here reads a
 * composer constraint or decides whether a branch suits the project; lockrot owns that analysis.
 *
 * `now` is always a parameter (`report.generatedAt`, never `Date.now()`), the same discipline
 * `lib.js`'s own date helpers keep — the maths must be reproducible from the document alone.
 */

import type { BranchRow, ExplainLock } from "../model/types";

const MS_PER_DAY = 24 * 3600 * 1000;
const MS_PER_JULIAN_YEAR = 365.25 * MS_PER_DAY;

/** Newer branches shown one row each, up to this many; past it the ones between the newest and
 *  yours fold into one row, so a 21-branch package never buries the two rows that answer the
 *  question (the newest, and yours) under the ones in between. */
const BETWEEN_MAX = 4;

/** The fewest branches a fold hides: a fold row costs a row itself, so folding two saves one line
 *  and hides two answers — below three, each branch keeps its own row. */
const FOLD_MIN = 3;

/** The right-hand share of the axis a year label may not sit in: the "today" label owns it. */
const TODAY_ZONE = 28;

export interface TimelineLane {
  /** The branch name, or for a snapshot row the installed ref itself ("dev-main"). */
  readonly branch: string;
  /** 0-100 along the shared axis: 0 is 1 January of the oldest date's year, 100 is `now`. */
  readonly x: number;
  /** The version tag the date belongs to — always the SAME tag (the M26 fix). */
  readonly label: string;
  /** ISO date string; the caller formats it (`domain/format.ts`'s `day`). */
  readonly date: string;
  readonly installed: boolean;
  /** The first row of the sort order — the newest branch — and never the installed one: a reader
   *  already on the newest branch has nothing newer to be pointed at. */
  readonly newest: boolean;
  readonly php: string | null;
  /** The lock's own dev-branch snapshot, drawn as a pseudo-row; it has no BranchRow of its own. */
  readonly snapshot: boolean;
  /** False when the label only repeats the branch name ("0.0.3" / "v0.0.3", PD-TIMELINE-3). */
  readonly showLabel: boolean;
}

export type TimelineRow =
  | { readonly kind: "lane"; readonly lane: TimelineLane }
  | { readonly kind: "fold"; readonly which: "between" | "older"; readonly lanes: readonly TimelineLane[] };

export interface TimelineTick {
  readonly x: number;
  readonly year: number;
}

export interface TimelineModel {
  /** Every dated branch, sorted (`sortedBy`); the snapshot row is not one of them. */
  readonly lanes: readonly TimelineLane[];
  /** What is drawn, top to bottom. A fold row carries the lanes it hides, in sort order. */
  readonly rows: readonly TimelineRow[];
  /** The reader's own row: the installed branch, else the snapshot row, else none. */
  readonly mine: TimelineLane | null;
  /** The first lane of the sort order (the newest branch), installed or not. */
  readonly top: TimelineLane;
  /** Whether `top` also released last: false when a lower branch shipped after it (a maintenance
   *  release), so the sentence calls `top` the highest rather than the newest — "the newest is 4.x,
   *  released 2023" beside a 3.x release from 2025 would contradict itself. */
  readonly topReleasedLast: boolean;
  /** How many lanes sort above the installed branch; 0 without one. */
  readonly newerCount: number;
  readonly sortedBy: "version" | "date";
  /** Every lane's version is its own branch name: a package with no maintained branches, whose
   *  "branches" are just its past releases (PD-TIMELINE-3). */
  readonly releasesOnly: boolean;
  readonly ticks: readonly TimelineTick[];
  /** `x` of an instant, on the same axis every lane uses — for a threshold guide ("N years ago"). */
  readonly xOfYearsAgo: (years: number) => number | null;
}

interface DatedTag {
  readonly iso: string;
  readonly label: string;
  readonly time: number;
}

/**
 * Whether `branch` and `label` name the same release, modulo an optional leading `v`/`V` — so a
 * package with no maintained branches, where each release is its own "branch", never prints
 * "0.0.3 · v0.0.3" (PD-TIMELINE-3, DESIGN.md §5).
 */
export function sameVersion(branch: string, label: string): boolean {
  const stripV = (s: string): string => (s.startsWith("v") || s.startsWith("V") ? s.slice(1) : s);
  return stripV(branch) === stripV(label);
}

/**
 * The date a branch plots at, and the version label shown beside it — always read off the same
 * tag. This is the fix for critic.md M26: legacy paired the *label* of the highest tag
 * (`b.highest`) with the *date* of `b.highest_released || b.newest_dated_released`, so an undated
 * highest tag (a shared-commit release) showed its version next to a different tag's date. Here,
 * when the highest tag has no release date of its own, its commit date is used instead (still the
 * same tag); only when neither exists at all does the lane fall back to the newest *dated* tag,
 * labelled with that tag's own version rather than `highest`'s.
 */
function datedTag(branch: BranchRow): DatedTag | null {
  const pick = (): { iso: string; label: string } | null => {
    if (branch.highestReleased !== null) return { iso: branch.highestReleased, label: branch.highest };
    if (branch.highestCommitDate !== null) return { iso: branch.highestCommitDate, label: branch.highest };
    if (branch.newestDatedReleased !== null && branch.newestDated !== null) {
      return { iso: branch.newestDatedReleased, label: branch.newestDated };
    }
    return null;
  };
  const tag = pick();
  if (tag === null) return null;
  const time = new Date(tag.iso).getTime();
  return Number.isNaN(time) ? null : { ...tag, time };
}

/**
 * A branch name as a sortable version key: "0.27.x" → [0, 27, ∞], "11.x" → [11, ∞], "0.0.3" →
 * [0, 0, 3], "v2.1" → [2, 1]. A wildcard sorts above every number in its place, so "2.x" (every
 * 2.* release) ranks above "2.1.x". `null` for a name that is not version-shaped ("master",
 * "dev-main", "3.x-dev"), which sends the whole list to date order instead (`compareLanes`).
 */
export function branchVersionKey(name: string): readonly number[] | null {
  const match = /^v?(\d+(?:\.(?:\d+|x|\*))*)$/i.exec(name.trim());
  if (match === null || match[1] === undefined) return null;
  return match[1].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : Infinity));
}

/** Descending: the higher version first. A missing place sorts below any present one ("2" below
 *  "2.0"), so the order is total and never depends on input order. */
function compareKeysDesc(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x > y ? -1 : 1;
  }
  return 0;
}

interface Sortable {
  readonly branch: string;
  readonly time: number;
}

/**
 * The lane order, newest first. By version when every branch name is version-shaped — the order a
 * reader expects ("3.x" never above "4.x", which the old date order did whenever a maintenance
 * branch shipped after the next major's last release) — otherwise by date, since a name like
 * "master" has no place among versions. Ties break on date, then name, so the order is total.
 */
export function sortLanes<T extends Sortable>(lanes: readonly T[]): { sorted: T[]; by: "version" | "date" } {
  const keys = new Map(lanes.map((lane) => [lane, branchVersionKey(lane.branch)] as const));
  const byVersion = lanes.every((lane) => keys.get(lane) !== null);
  const sorted = [...lanes].sort((a, b) => {
    if (byVersion) {
      const cmp = compareKeysDesc(keys.get(a) ?? [], keys.get(b) ?? []);
      if (cmp !== 0) return cmp;
    }
    if (a.time !== b.time) return b.time - a.time;
    return a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0;
  });
  return { sorted, by: byVersion ? "version" : "date" };
}

/**
 * How long ago `iso` was, in the unit a reader holds for that span: days under a week, weeks under
 * about two months, months under a year, then years to one decimal ("7 weeks", "4 months", "4.1
 * years"). The answer sentence's wording; `ageText` (format.ts) stays the terse "4.1 y ago" of the
 * reference sections. A date at or after `now` reads "1 day", never "0 days" or a negative span.
 */
export function agePhrase(iso: string, now: Date): string {
  const days = (now.getTime() - new Date(iso).getTime()) / MS_PER_DAY;
  const unit = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  if (days < 7) return unit(Math.max(1, Math.round(days)), "day", "days");
  if (days < 60) return unit(Math.round(days / 7), "week", "weeks");
  if (days < 365) return unit(Math.round(days / 30.44), "month", "months");
  return `${(days / 365.25).toFixed(1)} years`;
}

/** Years between `iso` and `now` (fractional; negative for a future date). */
export function yearsSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / MS_PER_JULIAN_YEAR;
}

/** The rows drawn for a reader on the installed lane at `index`: every newer branch (the middle
 *  ones folded past BETWEEN_MAX), theirs, then the older ones folded into one row (fewer than
 *  FOLD_MIN older ones keep their own rows). */
function rowsAround(lanes: readonly TimelineLane[], index: number): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const newer = lanes.slice(0, index);
  const older = lanes.slice(index + 1);
  const [first, ...between] = newer;
  if (first !== undefined && newer.length > BETWEEN_MAX) {
    rows.push({ kind: "lane", lane: first }, { kind: "fold", which: "between", lanes: between });
  } else {
    for (const lane of newer) rows.push({ kind: "lane", lane });
  }
  const mine = lanes[index];
  if (mine !== undefined) rows.push({ kind: "lane", lane: mine });
  rows.push(...foldOlder(older));
  return rows;
}

function foldOlder(older: readonly TimelineLane[]): TimelineRow[] {
  if (older.length >= FOLD_MIN) return [{ kind: "fold", which: "older", lanes: older }];
  return older.map((lane) => ({ kind: "lane", lane }));
}

/** At most two year labels, the first on the axis's own left edge (x = 0, 1 January of the
 *  oldest year — so it can never run off the axis, the old PD-TIMELINE-1 bug), none in the right-hand
 *  zone the "today" label owns. */
function yearTicks(startYear: number, now: Date, x: (t: number) => number): TimelineTick[] {
  const span = now.getUTCFullYear() - startYear;
  const step = Math.max(1, Math.ceil(span / 2));
  const ticks: TimelineTick[] = [];
  for (let year = startYear; year <= now.getUTCFullYear(); year += step) {
    const tx = x(Date.UTC(year, 0, 1));
    if (tx <= 100 - TODAY_ZONE) ticks.push({ x: tx, year });
  }
  return ticks;
}

/**
 * The block's model, or `null` when fewer than two rows would be drawn — one dot on an axis answers
 * nothing (legacy skipped the section below two dated branches, `report.js:672`). The lock's own
 * dev-branch snapshot counts as a row: a `dev-master` checkout next to its one release branch is
 * exactly the comparison a reader opened the panel for.
 */
export function timelineModel(
  branches: readonly BranchRow[],
  lock: ExplainLock | null,
  installedVersion: string,
  now: Date,
): TimelineModel | null {
  const dated = branches.flatMap((branch) => {
    const tag = datedTag(branch);
    return tag === null ? [] : [{ branch, tag, time: tag.time }];
  });
  const installedDated = dated.some((d) => d.branch.installed);
  const snapshotTime = lock?.branchSnapshot && lock.released ? new Date(lock.released).getTime() : NaN;
  const hasSnapshot = !installedDated && !Number.isNaN(snapshotTime);
  if (dated.length + (hasSnapshot ? 1 : 0) < 2) return null;

  const times = [...dated.map((d) => d.time), ...(hasSnapshot ? [snapshotTime] : [])];
  const startYear = new Date(Math.min(...times)).getUTCFullYear();
  const t0 = Date.UTC(startYear, 0, 1);
  const span = Math.max(now.getTime() - t0, 1); // a document dated 1 January still draws
  const x = (t: number): number => Math.min(100, Math.max(0, ((t - t0) / span) * 100));

  const { sorted, by } = sortLanes(dated.map((d) => ({ ...d, branch: d.branch.branch, row: d.branch })));
  const lanes: TimelineLane[] = sorted.map((d, index) => ({
    branch: d.row.branch,
    x: x(d.time),
    label: d.tag.label,
    date: d.tag.iso,
    installed: d.row.installed,
    newest: index === 0 && !d.row.installed,
    php: d.row.php,
    snapshot: false,
    showLabel: !sameVersion(d.row.branch, d.tag.label),
  }));
  const top = lanes[0];
  if (top === undefined) return null; // unreachable: at least one dated branch above

  const snapshot: TimelineLane | null =
    hasSnapshot && lock?.released
      ? {
          branch: installedVersion,
          x: x(snapshotTime),
          label: installedVersion,
          date: lock.released,
          installed: true,
          newest: false,
          php: lock.php,
          snapshot: true,
          showLabel: false,
        }
      : null;

  const installedIndex = lanes.findIndex((lane) => lane.installed);
  const rows: TimelineRow[] =
    installedIndex >= 0
      ? rowsAround(lanes, installedIndex)
      : [
          ...(snapshot ? [{ kind: "lane" as const, lane: snapshot }] : []),
          { kind: "lane", lane: top },
          ...foldOlder(lanes.slice(1)),
        ];

  return {
    lanes,
    rows,
    mine: installedIndex >= 0 ? (lanes[installedIndex] ?? null) : snapshot,
    top,
    topReleasedLast: sorted.every((d) => d.time <= (sorted[0]?.time ?? d.time)),
    newerCount: Math.max(installedIndex, 0),
    sortedBy: by,
    releasesOnly: lanes.every((lane) => !lane.showLabel),
    ticks: yearTicks(startYear, now, x),
    xOfYearsAgo: (years) => {
      const tx = ((now.getTime() - years * MS_PER_JULIAN_YEAR - t0) / span) * 100;
      return tx > 0 && tx < 100 ? tx : null;
    },
  };
}
