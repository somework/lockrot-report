/**
 * The Blast radius tail for lockrot's `unattributed` list: flagged packages shared by more direct
 * requirements than `exposure_rule.max_fan_in`, which lockrot counts under none of them (PD-RADIUS-12).
 */

import type { Finding, Model, Verdict } from "../model/types";

/** The dots stop at this many times the limit, so a package shared by a hundred keeps one line. */
const DOT_CAP_FACTOR = 2;
/** The cap when the report states no limit. */
const NAMES_CAP_NO_RULE = 16;

export interface SharedEntry {
  readonly finding: Finding;
  /** The entry's own verdict, as written. */
  readonly verdict: Verdict;
  readonly fanIn: number | null;
}

export interface SharedTail {
  /** Most shared first; an unreadable fan_in last. */
  readonly entries: readonly SharedEntry[];
  readonly maxFanIn: number | null;
  /** `include_dev` is false: never inferred from null. */
  readonly devLeftOut: boolean;
  /** Null unless every entry's fan_in is readable. */
  readonly fanIn: { readonly low: number; readonly high: number } | null;
}

/** `shown`: the flagged packages the tab's filter keeps; an entry naming none of them is not drawn. */
export function sharedTail(model: Model, shown: readonly Finding[]): SharedTail | null {
  const byName = new Map(shown.map((f) => [f.package, f]));
  const seen = new Set<string>();
  const found = model.report.unattributed.flatMap((entry) => {
    const finding = byName.get(entry.package);
    if (finding === undefined || seen.has(entry.package)) return [];
    seen.add(entry.package);
    return [{ finding, verdict: entry.verdict, fanIn: entry.fanIn }];
  });
  if (found.length === 0) return null;
  const entries = found
    .map((entry, index) => ({ entry, index }))
    .sort((x, y) => (y.entry.fanIn ?? -1) - (x.entry.fanIn ?? -1) || x.index - y.index)
    .map(({ entry }) => entry);
  const counts = entries.map((e) => e.fanIn);
  const readable = counts.filter((n): n is number => n !== null);
  return {
    entries,
    maxFanIn: model.report.exposureRule?.maxFanIn ?? null,
    devLeftOut: model.report.includeDev === false,
    fanIn:
      readable.length === counts.length ? { low: Math.min(...readable), high: Math.max(...readable) } : null,
  };
}

function dotCap(max: number): number {
  return Math.max(max * DOT_CAP_FACTOR, max + 1);
}

/** Filled up to the limit, hollow past it; `clipped` when the fan_in runs past the last dot. */
export function fanInDots(fanIn: number, max: number): { filled: number; hollow: number; clipped: boolean } {
  const cap = dotCap(max);
  const drawn = Math.min(fanIn, cap);
  const filled = Math.min(drawn, max);
  return { filled, hollow: drawn - filled, clipped: fanIn > cap };
}

/** One slot past the limit at least, so the limit's tick always has a dot after it. */
export function scaleSlots(fanIns: readonly (number | null)[], max: number): number {
  const drawn = fanIns.map((n) => (n === null ? 0 : Math.min(n, dotCap(max))));
  return Math.max(max + 1, ...drawn);
}

/** A list of requirements longer than the dots can draw opens clamped to a few lines. */
export function clampsNames(count: number, max: number | null): boolean {
  return count > (max === null ? NAMES_CAP_NO_RULE : dotCap(max));
}
