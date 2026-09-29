/**
 * The "Release branches" block as facts: which branches get a row, which fold away, and where each
 * sits on one time axis ending at `now` (`report.generatedAt`, so the maths is the document's own).
 * Rows keep lockrot's order, highest first; nothing here reads a constraint.
 */

import type { BranchRow } from "../model/types";
import { yearsPhrase } from "./format";

const MS_PER_DAY = 24 * 3600 * 1000;
const MS_PER_JULIAN_YEAR = 365.25 * MS_PER_DAY;

/** Past this many newer branches, the ones between the newest and yours fold, so the two rows that
 *  answer the question stay in view. */
const BETWEEN_MAX = 4;

/** Folding two would save one line and hide two answers. */
const FOLD_MIN = 3;

/** The right-hand share of the axis a year label may not sit in: the "today" label owns it. */
const TODAY_ZONE = 28;

export interface TimelineLane {
  /** The branch name, or for a snapshot row the installed ref itself ("dev-main"). */
  readonly branch: string;
  /** 0-100 along the shared axis: 0 is 1 January of the oldest date's year, 100 is `now`. */
  readonly x: number;
  /** The version tag the date belongs to: always the same tag. */
  readonly label: string;
  /** ISO date string; the caller formats it (`domain/format.ts`'s `day`). */
  readonly date: string;
  readonly installed: boolean;
  /** The first row, unless it is the installed one: nothing newer to point at then. */
  readonly newest: boolean;
  readonly php: string | null;
  /** The installed branch's commit, drawn as a row of its own; it has no BranchRow. */
  readonly snapshot: boolean;
  /** False when the label only repeats the branch name ("0.0.3" / "v0.0.3", PD-TIMELINE-3). */
  readonly showLabel: boolean;
  /** Null when the date is the package's own, or a commit date. */
  readonly datedBy: string | null;
}

export type TimelineRow =
  | { readonly kind: "lane"; readonly lane: TimelineLane }
  | { readonly kind: "fold"; readonly which: "between" | "older"; readonly lanes: readonly TimelineLane[] };

export interface TimelineTick {
  readonly x: number;
  readonly year: number;
}

export interface TimelineModel {
  /** Every dated branch, in the document's order; the snapshot row is not one of them. */
  readonly lanes: readonly TimelineLane[];
  /** What is drawn, top to bottom. A fold row carries the lanes it hides, in order. */
  readonly rows: readonly TimelineRow[];
  /** The reader's own row: the installed branch, else the snapshot row, else none. */
  readonly mine: TimelineLane | null;
  /** The first lane, installed or not. */
  readonly top: TimelineLane;
  /** False when a lower branch shipped after it: the sentence then calls `top` the highest, not the
   *  newest. */
  readonly topReleasedLast: boolean;
  /** How many lanes sit above the installed branch; 0 without one. */
  readonly newerCount: number;
  /**
   * A package with no maintained branches, whose "branches" are its past releases (PD-TIMELINE-3).
   */
  readonly releasesOnly: boolean;
  readonly ticks: readonly TimelineTick[];
  /** `x` of an instant, on the same axis every lane uses — for a threshold guide ("N years ago"). */
  readonly xOfYearsAgo: (years: number) => number | null;
}

interface DatedTag {
  readonly iso: string;
  readonly label: string;
  readonly datedBy: string | null;
  readonly time: number;
}

/** Modulo a leading `v`, so a release-per-branch package never prints "0.0.3 · v0.0.3"
 *  (PD-TIMELINE-3). */
export function sameVersion(branch: string, label: string): boolean {
  const stripV = (s: string): string => (s.startsWith("v") || s.startsWith("V") ? s.slice(1) : s);
  return stripV(branch) === stripV(label);
}

/** The date a branch plots at and the label beside it, always read off the same tag, so an undated
 *  highest tag never shows its version beside another tag's date. */
function datedTag(branch: BranchRow): DatedTag | null {
  const pick = (): { iso: string; label: string; datedBy: string | null } | null => {
    if (branch.highestReleased !== null) {
      return { iso: branch.highestReleased, label: branch.highest, datedBy: branch.datedBy };
    }
    if (branch.highestCommitDate !== null) {
      return { iso: branch.highestCommitDate, label: branch.highest, datedBy: null };
    }
    if (branch.newestDatedReleased !== null && branch.newestDated !== null) {
      return { iso: branch.newestDatedReleased, label: branch.newestDated, datedBy: branch.datedBy };
    }
    return null;
  };
  const tag = pick();
  if (tag === null) return null;
  const time = new Date(tag.iso).getTime();
  return Number.isNaN(time) ? null : { ...tag, time };
}

/** How long ago `iso` was, in the page's one age unit, so the sentence and the facts row agree. */
export function agePhrase(iso: string, now: Date): string {
  return yearsPhrase(yearsSince(iso, now));
}

/** Years between `iso` and `now` (fractional; negative for a future date). */
export function yearsSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / MS_PER_JULIAN_YEAR;
}

/** Every newer branch (the middle folded past BETWEEN_MAX), yours, then the older ones folded. */
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

/** Year steps a reader counts in, smallest first; the axis takes the smallest that fits. */
const YEAR_STEPS = [1, 2, 3, 5, 10, 20, 25, 50];

/** The most year labels an axis carries, "today" not counted (PD-TIMELINE-11). */
const MAX_YEAR_LABELS = 3;

/** Every `step` years from the left edge, none in the right-hand zone "today" owns. */
function ticksEvery(step: number, startYear: number, now: Date, x: (t: number) => number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  for (let year = startYear; year <= now.getUTCFullYear(); year += step) {
    const tx = x(Date.UTC(year, 0, 1));
    if (tx <= 100 - TODAY_ZONE) ticks.push({ x: tx, year });
  }
  return ticks;
}

/** Up to MAX_YEAR_LABELS year labels at the smallest step that keeps within it, the first on the
 *  axis's left edge so it can never run off it. */
export function yearTicks(startYear: number, now: Date, x: (t: number) => number): TimelineTick[] {
  for (const step of YEAR_STEPS) {
    const ticks = ticksEvery(step, startYear, now, x);
    if (ticks.length <= MAX_YEAR_LABELS) return ticks;
  }
  const span = now.getUTCFullYear() - startYear;
  return ticksEvery(Math.ceil(span / (MAX_YEAR_LABELS - 1)), startYear, now, x);
}

/** The snapshot row's source: the installed branch's commit (`pinned.ts#snapshotOf`). */
export interface SnapshotCommit {
  readonly time: string;
  readonly php: string | null;
}

/** `null` when fewer than two rows would be drawn: one dot on an axis answers nothing. */
export function timelineModel(
  branches: readonly BranchRow[],
  snapshotCommit: SnapshotCommit | null,
  installedVersion: string,
  now: Date,
): TimelineModel | null {
  const dated = branches.flatMap((branch) => {
    const tag = datedTag(branch);
    return tag === null ? [] : [{ row: branch, tag, time: tag.time }];
  });
  const installedDated = dated.some((d) => d.row.installed);
  const snapshotTime = snapshotCommit === null ? NaN : new Date(snapshotCommit.time).getTime();
  const hasSnapshot = !installedDated && !Number.isNaN(snapshotTime);
  if (dated.length + (hasSnapshot ? 1 : 0) < 2) return null;

  const times = [...dated.map((d) => d.time), ...(hasSnapshot ? [snapshotTime] : [])];
  const startYear = new Date(Math.min(...times)).getUTCFullYear();
  const t0 = Date.UTC(startYear, 0, 1);
  const span = Math.max(now.getTime() - t0, 1); // a document dated 1 January still draws
  const x = (t: number): number => Math.min(100, Math.max(0, ((t - t0) / span) * 100));

  const lanes: TimelineLane[] = dated.map((d, index) => ({
    branch: d.row.branch,
    x: x(d.time),
    label: d.tag.label,
    date: d.tag.iso,
    installed: d.row.installed,
    newest: index === 0 && !d.row.installed,
    php: d.row.php,
    snapshot: false,
    showLabel: !sameVersion(d.row.branch, d.tag.label),
    datedBy: d.tag.datedBy,
  }));
  const top = lanes[0];
  if (top === undefined) return null;

  const snapshot: TimelineLane | null =
    hasSnapshot && snapshotCommit !== null
      ? {
          branch: installedVersion,
          x: x(snapshotTime),
          label: installedVersion,
          date: snapshotCommit.time,
          installed: true,
          newest: false,
          php: snapshotCommit.php,
          snapshot: true,
          showLabel: false,
          datedBy: null,
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
    topReleasedLast: dated.every((d) => d.time <= (dated[0]?.time ?? d.time)),
    newerCount: Math.max(installedIndex, 0),
    releasesOnly: lanes.every((lane) => !lane.showLabel),
    ticks: yearTicks(startYear, now, x),
    xOfYearsAgo: (years) => {
      const tx = ((now.getTime() - years * MS_PER_JULIAN_YEAR - t0) / span) * 100;
      return tx > 0 && tx < 100 ? tx : null;
    },
  };
}
