/**
 * The branch/release timeline drawn inside a package's detail panel — ported from legacy's
 * `timeline(meta, installedVersion)` (`report.js:669-709`), fixed per DESIGN.md §5 C2 and M26.
 *
 * `now` is always a parameter (`report.generatedAt`, never `Date.now()`), the same discipline
 * `lib.js`'s own date helpers keep — the maths must be reproducible from the document alone.
 */

import type { BranchRow } from "../model/types";

/** The x-axis reserves a 4%-wide margin on the left and an 8%-wide one on the right: `min` (the
 *  earliest dated branch) plots at `LEFT_MARGIN`, `now` at `RIGHT_EDGE` (`report.js:677`). */
const LEFT_MARGIN = 4;
const RIGHT_EDGE = 92;

export interface TimelineLane {
  readonly branch: string;
  /** 0-100, this lane's position along the axis. */
  readonly x: number;
  /** The version tag the date below belongs to — always the SAME tag (the M26 fix). */
  readonly label: string;
  /** ISO date string; the caller formats it (`domain/format.ts`'s `day`), this module only computes it. */
  readonly date: string;
  readonly installed: boolean;
  /** True for the lane with the latest plotted date. A caller wanting legacy's `is-newest` class
   *  (which legacy suppresses on the installed branch) computes `newest && !installed` itself. */
  readonly newest: boolean;
  readonly php: string | null;
}

export interface TimelineTick {
  readonly x: number;
  readonly year: number;
}

export interface TimelineLayout {
  readonly lanes: readonly TimelineLane[];
  readonly ticks: readonly TimelineTick[];
}

const EMPTY_LAYOUT: TimelineLayout = { lanes: [], ticks: [] };

interface DatedBranch {
  readonly branch: BranchRow;
  readonly iso: string;
  readonly label: string;
  readonly time: number;
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
function datedTag(branch: BranchRow): { readonly iso: string; readonly label: string } | null {
  if (branch.highestReleased !== null) return { iso: branch.highestReleased, label: branch.highest };
  if (branch.highestCommitDate !== null) return { iso: branch.highestCommitDate, label: branch.highest };
  if (branch.newestDatedReleased !== null && branch.newestDated !== null) {
    return { iso: branch.newestDatedReleased, label: branch.newestDated };
  }
  return null;
}

/**
 * The branch timeline's layout: which branches get a dot and where, plus the year-axis ticks.
 * Fewer than two dated branches leaves nothing worth drawing (`report.js:672`, "≥2 dated branches
 * required") — the caller omits the whole "Release branches" section in that case, exactly as
 * legacy did when `timeline()` returned `""`.
 */
export function timelineLayout(branches: readonly BranchRow[], now: Date): TimelineLayout {
  const dated: DatedBranch[] = [];
  for (const branch of branches) {
    const tag = datedTag(branch);
    if (tag === null) continue;
    const time = new Date(tag.iso).getTime();
    if (Number.isNaN(time)) continue;
    dated.push({ branch, iso: tag.iso, label: tag.label, time });
  }
  if (dated.length < 2) return EMPTY_LAYOUT;

  const min = Math.min(...dated.map((d) => d.time));
  const max = now.getTime();
  const span = Math.max(max - min, 1); // guards a divide-by-zero the same way report.js:676 did
  const pct = (t: number): number => LEFT_MARGIN + (RIGHT_EDGE - LEFT_MARGIN) * ((t - min) / span);

  // Descending by date — newest branch first (report.js:679-682).
  const lanes = [...dated].sort((a, b) => b.time - a.time);
  const newestLane = lanes[0];
  if (newestLane === undefined) return EMPTY_LAYOUT; // unreachable: `dated.length >= 2` above

  const lanesOut: TimelineLane[] = lanes.map((d) => ({
    branch: d.branch.branch,
    x: pct(d.time),
    label: d.label,
    date: d.iso,
    installed: d.branch.installed,
    newest: d === newestLane,
    php: d.branch.php,
  }));

  const startYear = new Date(min).getUTCFullYear();
  const endYear = now.getUTCFullYear();
  const yearSpan = endYear - startYear;
  const step = yearSpan > 8 ? 3 : yearSpan > 4 ? 2 : 1;

  // The C2 fix: legacy's `if (t < min) continue` dropped the axis's very first tick in practice
  // every time (the oldest dated release is essentially never exactly midnight UTC on Jan 1) —
  // kept here, even when it plots left of `min` itself.
  const ticks: TimelineTick[] = [];
  for (let year = startYear; year <= endYear; year += step) {
    ticks.push({ x: pct(Date.UTC(year, 0, 1)), year });
  }

  return { lanes: lanesOut, ticks };
}
