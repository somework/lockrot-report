/**
 * Run data, arranged (PD-RUN-1..4, DESIGN.md §5): what the run was told and what it recorded, read
 * straight off the document — counts, presence and date arithmetic, nothing inferred beyond what a
 * field says. No DOM and no clock: the one instant it measures from is the report's own
 * `generated_at`.
 */

import type { Model, PackageDetails, ReportModel } from "../model/types";
import { yearsPhrase } from "./format";

const MS_PER_HOUR = 3600 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_JULIAN_YEAR = 365.25 * MS_PER_DAY;
/** Under this a span reads in hours; under `DAYS_UNTIL` in days; past it `yearsPhrase` takes over. */
const HOURS_UNTIL = 48 * MS_PER_HOUR;
const DAYS_UNTIL = 60 * MS_PER_DAY;

/** What a reader is told for a value the document does not give, instead of a bare em dash. */
export const NOT_IN_DOCUMENT = "not in this document";
export const NOT_RECORDED = "not recorded";

/**
 * An ISO 8601 instant as `2026-09-24 00:00 UTC`: one zone for every reader, so the page says the
 * same thing wherever it is opened. The string itself when it does not parse.
 */
export function utcMinute(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const text = new Date(ms).toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;
}

/** A span of time in the unit a reader holds: "less than an hour", hours under two days, days
 *  under two months, then the page's usual months/years (`yearsPhrase`). */
export function spanPhrase(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MS_PER_HOUR) return "less than an hour";
  if (span < HOURS_UNTIL) {
    const hours = Math.max(1, Math.round(span / MS_PER_HOUR));
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (span < DAYS_UNTIL) return `${Math.round(span / MS_PER_DAY)} days`;
  return yearsPhrase(span / MS_PER_JULIAN_YEAR);
}

export interface CacheAge {
  /** `activity_cache_oldest_at` as given. */
  readonly oldest: string;
  /** How long before `generated_at` that was, spelled out; `null` when either date does not parse. */
  readonly before: string | null;
}

/** The oldest cached repository activity the run used, and how old it was when the report was
 *  written; `null` when the document gives no such date. */
export function cacheAge(report: ReportModel): CacheAge | null {
  const oldest = report.activityCacheOldestAt;
  if (oldest === null) return null;
  const gap = Date.parse(report.generatedAt) - Date.parse(oldest);
  return { oldest, before: Number.isNaN(gap) ? null : spanPhrase(gap) };
}

export interface ActivityTally {
  /** Packages whose details carry a repository-activity block. */
  readonly total: number;
  readonly fromCache: number;
}

/** How many of the packages this file explains carry repository activity, and how many of those
 *  answers came from lockrot's cache (`activity.from_cache`). */
export function activityTally(details: ReadonlyMap<string, PackageDetails>): ActivityTally {
  let total = 0;
  let fromCache = 0;
  for (const entry of details.values()) {
    if (entry.activity === null) continue;
    total += 1;
    if (entry.activity.fromCache) fromCache += 1;
  }
  return { total, fromCache };
}

/** Whether the document carries `key` (a wire key, `run.` prefixed for the run block). */
export function carries(report: ReportModel, key: string): boolean {
  return !report.absent.includes(key);
}

/** The reason shown for a `null` value: the document left the key out, or wrote it as null. */
export function nullReason(report: ReportModel, key: string): string {
  return carries(report, key) ? NOT_RECORDED : NOT_IN_DOCUMENT;
}

/** The sentence the oldest-cache row gives when the document has no date for it. When this file
 *  explains packages with repository activity and none of those came from the cache, it says so
 *  with the count; otherwise only that the date is absent or empty. */
export function cacheNullReason(model: Model): string {
  const { report } = model;
  if (!carries(report, "activity_cache_oldest_at")) return NOT_IN_DOCUMENT;
  const tally = activityTally(model.details);
  if (tally.total > 0 && tally.fromCache === 0) {
    return tally.total === 1
      ? "none — the one in this file was fetched during the run"
      : `none — all ${tally.total} in this file were fetched during the run`;
  }
  return NOT_RECORDED;
}

export interface ThresholdPair {
  /** The part of the names before `-warn-years` / `-high-years` ("release", "push"). */
  readonly subject: string;
  readonly warn: number;
  readonly high: number;
  readonly warnName: string;
  readonly highName: string;
}

export interface ThresholdGroups {
  /** Each `X-warn-years` with its `X-high-years`, in the order the first of the two appears. */
  readonly pairs: readonly ThresholdPair[];
  /** Every threshold that is not half of a pair, as given. */
  readonly others: readonly (readonly [name: string, years: number])[];
  /** The right edge every pair's scale shares: `max(10, 2 × the highest high)`, as `ageAxis`. */
  readonly max: number;
}

const WARN_SUFFIX = "-warn-years";
const HIGH_SUFFIX = "-high-years";
const AXIS_FLOOR_YEARS = 10;

/** The run's thresholds grouped into warn/high pairs on one shared scale (`ageAxis`'s edge rule,
 *  so a pair reads here as its guides read in the Findings column head). */
export function thresholdGroups(thresholds: readonly (readonly [string, number])[]): ThresholdGroups {
  const byName = new Map(thresholds);
  const pairs: ThresholdPair[] = [];
  const paired = new Set<string>();
  for (const [name] of thresholds) {
    if (paired.has(name)) continue;
    const subject = name.endsWith(WARN_SUFFIX)
      ? name.slice(0, -WARN_SUFFIX.length)
      : name.endsWith(HIGH_SUFFIX)
        ? name.slice(0, -HIGH_SUFFIX.length)
        : null;
    if (subject === null || subject === "") continue;
    const warnName = subject + WARN_SUFFIX;
    const highName = subject + HIGH_SUFFIX;
    const warn = byName.get(warnName);
    const high = byName.get(highName);
    if (warn === undefined || high === undefined) continue;
    pairs.push({ subject, warn, high, warnName, highName });
    paired.add(warnName).add(highName);
  }
  const others = thresholds.filter(([name]) => !paired.has(name));
  const highest = pairs.reduce((top, pair) => Math.max(top, pair.high, pair.warn), 0);
  return { pairs, others, max: Math.max(AXIS_FLOOR_YEARS, 2 * highest) };
}
