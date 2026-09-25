/**
 * The Findings list's ledger rows (PD-ROWS-4/5/6, DESIGN.md §5): what each one-line row says in its
 * "why it is flagged" column, and the two kinds of sentence the list reads out loud — one per
 * priority group, counting its members by verdict and by how they are reached, and one above each
 * run of three or more consecutive rows that share a verdict and a way in.
 *
 * Display only. Nothing here reorders a row or groups findings by anything but what already sits
 * next to each other in the list's own order (`filters.ts#applyFilters`): a run is found, never
 * made. Deciding what to do about a shared parent is lockrot's job, not this renderer's. Pure, no
 * DOM, no clock: the same finding always gives the same words.
 */

import type { Finding, Signal, Verdict } from "../model/types";
import { ageScale, type AgeKind, type Thresholds } from "./age";
import { signalSortKey } from "./filters";
import { plural } from "./format";
import { SIGNAL_NAMES, VERDICT_ORDER } from "./vocab";

/** `high` outranks `warn` outranks everything else (including the open-ended `"info"` and a level
 *  this renderer does not know) — the three-tier reading `SignalList.tsx` gives a signal's colour. */
const LEVEL_RANK: Readonly<Record<string, number>> = { high: 2, warn: 1 };

/**
 * Every signal a finding carries, highest level first, ties broken in `SIGNAL_IDS` numeric order
 * (`filters.ts#signalSortKey`, the order the rail and the glossary use, M2) — never the document's
 * own order, which is lockrot's rule evaluation order and carries no such guarantee. The first one
 * is the row's key fact (PD-ROWS-1); the rest are what print restores under it.
 */
export function sortedSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    const rank = (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0);
    if (rank !== 0) return rank;
    const [an, as] = signalSortKey(a.id);
    const [bn, bs] = signalSortKey(b.id);
    return an !== bn ? an - bn : as.localeCompare(bs);
  });
}

/**
 * The signal a row quotes, and the others it keeps for print. The key fact is the highest-level
 * signal (PD-ROWS-1) — unless the rail filters by exactly one signal and this finding carries it:
 * then the row quotes that one, so a list filtered to S5 says what S5 found on every row instead of
 * repeating each package's own top signal (PD-ROWS-5).
 */
export function rowSignals(
  finding: Finding,
  quoted: string | null,
): { readonly key: Signal | null; readonly rest: readonly Signal[] } {
  const sorted = sortedSignals(finding.signals);
  const pick = (quoted !== null ? sorted.find((s) => s.id === quoted) : undefined) ?? sorted[0] ?? null;
  return { key: pick, rest: sorted.filter((s) => s !== pick) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 2017" from an ISO timestamp, read in UTC so the page says the same month in every time
 *  zone; `null` for anything that is not a date. */
function monthYear(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

function yearOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * One signal, said short enough for a one-line row: "no stable release since Nov 2017", "5.x
 * stopped; 7.x ships". Built only from the signal's own `data` fields, which the row's title keeps
 * beside the document's full `summary`; any field missing or of the wrong shape falls back to that
 * summary, verbatim, rather than a guess.
 */
export function shortFact(signal: Signal, finding: Finding): string {
  const d = signal.data;
  switch (signal.id) {
    case "S1": {
      const replacement = finding.replacement ?? text(d.replacement);
      return replacement
        ? `marked abandoned, replaced by ${replacement}`
        : "marked abandoned by its repository";
    }
    case "S2": {
      const since = monthYear(d.last_release);
      return since ? `no stable release since ${since}` : signal.summary;
    }
    case "S4": {
      const since = monthYear(d.last_push);
      return since ? `no push since ${since}` : signal.summary;
    }
    case "S5": {
      const year = yearOf(d.released);
      const php = d.written_for_php;
      const target = text(d.target_php);
      if (year === null || (typeof php !== "number" && typeof php !== "string") || target === null) {
        return signal.summary;
      }
      return `released ${year} for PHP ${php}; admits ${target} untested`;
    }
    case "S7":
      return typeof d.flagged === "number"
        ? `pulls in ${plural(d.flagged, "flagged package", "flagged packages")}`
        : signal.summary;
    case "S8": {
      const branch = text(d.branch);
      const newest = text(d.newest_branch);
      return branch && newest ? `${branch} stopped; ${newest} ships` : signal.summary;
    }
    case "S9":
      return Array.isArray(d.advisories)
        ? `${plural(d.advisories.length, "advisory affects", "advisories affect")} this version`
        : signal.summary;
    case "S10":
      return SIGNAL_NAMES.S10 ?? signal.summary;
    default:
      return signal.summary;
  }
}

/** The words a row's "why it is flagged" column shows: its quoted signal said short, or the
 *  document's own evidence sentence for a finding that carries no signal at all. */
export function whyText(finding: Finding, quoted: string | null): string {
  const { key } = rowSignals(finding, quoted);
  return key ? shortFact(key, finding) : finding.evidence;
}

/** The words a row's "reached" column shows: "direct", or "via" the direct requirement its chain
 *  starts at — "through another package" when the document names none. */
export function reachText(finding: Finding): string {
  if (finding.direct) return "direct";
  const root = finding.chain[0];
  return root ? `via ${root}` : "through another package";
}

/** The part of a Composer name before its slash, or `null` for a name without one. */
export function vendorOf(pkg: string): string | null {
  const slash = pkg.indexOf("/");
  return slash > 0 ? pkg.slice(0, slash) : null;
}

/**
 * How a finding gets into the project, as the run key compares it: a direct requirement by its
 * vendor (`direct:scheb`), anything else by the direct requirement that starts its chain
 * (`via:wallabag/rulerz`). `null` when neither is known — a name with no vendor, or an empty chain —
 * so such a row never joins a run on a guess.
 */
export function wayIn(finding: Finding): string | null {
  if (finding.direct) {
    const vendor = vendorOf(finding.package);
    return vendor === null ? null : `direct:${vendor}`;
  }
  const root = finding.chain[0];
  return root ? `via:${root}` : null;
}

/** The fewest consecutive rows a run note is written for; two alike read fine without one. */
export const RUN_MIN = 3;

function runKey(finding: Finding): string | null {
  const way = wayIn(finding);
  return way === null ? null : `${finding.verdict}|${way}|${finding.dev ? "dev" : "prod"}`;
}

export interface Segment {
  /** True for a run: `RUN_MIN` or more consecutive rows sharing verdict, way in and dev-ness. */
  readonly run: boolean;
  readonly findings: readonly Finding[];
}

/**
 * The list cut into runs and the stretches between them, in the order given — never re-sorted.
 * A stretch of rows that do not form a run is one segment, so a row's "same as the row above"
 * reading (the list's ditto) carries across it; a run starts and ends one.
 */
export function segmentRuns(findings: readonly Finding[]): readonly Segment[] {
  const segments: Segment[] = [];
  let plain: Finding[] = [];
  let i = 0;
  while (i < findings.length) {
    const first = findings[i] as Finding;
    const key = runKey(first);
    let j = i + 1;
    while (key !== null && j < findings.length && runKey(findings[j] as Finding) === key) j++;
    if (j - i >= RUN_MIN) {
      if (plain.length > 0) segments.push({ run: false, findings: plain });
      plain = [];
      segments.push({ run: true, findings: findings.slice(i, j) });
    } else {
      plain = [...plain, ...findings.slice(i, j)];
    }
    i = j;
  }
  if (plain.length > 0) segments.push({ run: false, findings: plain });
  return segments;
}

export interface VerdictCount {
  readonly verdict: Verdict;
  readonly count: number;
}

export interface GroupCounts {
  readonly total: number;
  /** Most common first; a tie keeps `VERDICT_ORDER`, and a verdict it does not list goes last. */
  readonly verdicts: readonly VerdictCount[];
  readonly direct: number;
  readonly dev: number;
}

function verdictIndex(verdict: string): number {
  const index = VERDICT_ORDER.indexOf(verdict);
  return index === -1 ? VERDICT_ORDER.length : index;
}

/** A priority group's members counted by verdict, by reach and by dev-ness — its sentence's facts. */
export function groupCounts(findings: readonly Finding[]): GroupCounts {
  const counts = new Map<Verdict, number>();
  for (const finding of findings) counts.set(finding.verdict, (counts.get(finding.verdict) ?? 0) + 1);
  const verdicts = [...counts.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count || verdictIndex(a.verdict) - verdictIndex(b.verdict));
  return {
    total: findings.length,
    verdicts,
    direct: findings.filter((f) => f.direct).length,
    dev: findings.filter((f) => f.dev).length,
  };
}

export interface RunAge {
  readonly kind: AgeKind;
  readonly min: number;
  readonly max: number;
}

export interface RunFacts {
  readonly count: number;
  readonly verdict: Verdict;
  /** Every member's vendor when they all share one, else `null`. */
  readonly vendor: string | null;
  readonly direct: boolean;
  /** The direct requirement every member comes in through; `null` for a run of direct ones. */
  readonly via: string | null;
  readonly dev: boolean;
  /** The members' ages, when every one of them has one of the same kind. */
  readonly age: RunAge | null;
  /** Which signal every member shares that says why it is abandoned (S1 over S3). */
  readonly abandonedBy: "S1" | "S3" | null;
}

function sharedVendor(findings: readonly Finding[]): string | null {
  const first = findings[0] ? vendorOf(findings[0].package) : null;
  return first !== null && findings.every((f) => vendorOf(f.package) === first) ? first : null;
}

function runAge(findings: readonly Finding[], thresholds: Thresholds): RunAge | null {
  const scales = findings.map((f) => ageScale(f, thresholds, Number.POSITIVE_INFINITY));
  const kind = scales[0]?.kind;
  if (kind === undefined || scales.some((s) => s === null || s.kind !== kind)) return null;
  const years = scales.map((s) => s?.years ?? 0);
  return { kind, min: Math.min(...years), max: Math.max(...years) };
}

function everyHas(findings: readonly Finding[], id: string): boolean {
  return findings.every((f) => f.signals.some((s) => s.id === id));
}

/**
 * What a run's members share, for the sentence above it. Only facts every member carries: the
 * verdict and way in (the run's own key), a vendor when all of them have the same one, an age range
 * when all of them have an age of the same kind. Expects a run from `segmentRuns`, not an arbitrary
 * list.
 */
export function runFacts(findings: readonly Finding[], thresholds: Thresholds): RunFacts {
  const first = findings[0];
  const direct = first?.direct ?? false;
  return {
    count: findings.length,
    verdict: first?.verdict ?? "unknown",
    vendor: sharedVendor(findings),
    direct,
    via: direct ? null : (first?.chain[0] ?? null),
    dev: first?.dev ?? false,
    age: runAge(findings, thresholds),
    abandonedBy: everyHas(findings, "S1") ? "S1" : everyHas(findings, "S3") ? "S3" : null,
  };
}
