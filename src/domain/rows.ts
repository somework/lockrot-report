/** The Findings list's rows (PD-ROWS-4/5/6): what each row says, and the sentences over a priority
 *  group and over a run of alike rows. A run is found in the list's own order, never made. */

import type { Finding, PackageDetails, Signal, Verdict } from "../model/types";
import { ageScale, type AgeKind, type Thresholds } from "./age";
import { signalSortKey } from "./filters";
import { pinnedKindOf, type PinnedKind } from "./pinned";
import { plural } from "./format";
import { SIGNAL_NAMES, VERDICT_ORDER, vocabTable } from "./vocab";

/** A `vocabTable`, so a level such as `toString` ranks lowest, not as an inherited member. */
const LEVEL_RANK: Readonly<Record<string, number>> = vocabTable({ high: 2, warn: 1 });

/** Highest level first, ties in numeric id order: the document's order is lockrot's evaluation
 *  order and promises nothing. */
export function sortedSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    const rank = (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0);
    if (rank !== 0) return rank;
    const [an, as] = signalSortKey(a.id);
    const [bn, bs] = signalSortKey(b.id);
    return an !== bn ? an - bn : as.localeCompare(bs);
  });
}

/** With the rail filtered to exactly one signal the finding carries, the row quotes that one
 *  (PD-ROWS-5). */
export function rowSignals(
  finding: Finding,
  quoted: string | null,
): { readonly key: Signal | null; readonly rest: readonly Signal[] } {
  const sorted = sortedSignals(finding.signals);
  const pick = (quoted !== null ? sorted.find((s) => s.id === quoted) : undefined) ?? sorted[0] ?? null;
  return { key: pick, rest: sorted.filter((s) => s !== pick) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Read in UTC, so every time zone says the same month. */
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

/** Built only from the signal's own `data`; anything missing or misshapen falls back to its
 *  summary, verbatim. */
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

export function whyText(finding: Finding, quoted: string | null): string {
  const { key } = rowSignals(finding, quoted);
  return key ? shortFact(key, finding) : finding.evidence;
}

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

/** `null` when neither is known, so such a row never joins a run on a guess. */
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
 * Never re-sorted; a stretch between runs is one segment, so the list's ditto carries across it.
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
  /** `null` when the members do not share one, or the run is not pinned. */
  readonly pinned: PinnedKind | null;
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

function sharedPinned(
  findings: readonly Finding[],
  details: ReadonlyMap<string, PackageDetails>,
): PinnedKind | null {
  if (findings[0]?.verdict !== "pinned") return null;
  const kinds = new Set(findings.map((f) => pinnedKindOf(f, details.get(f.package) ?? null)));
  const [only] = [...kinds];
  return kinds.size === 1 && only !== undefined ? only : null;
}

function everyHas(findings: readonly Finding[], id: string): boolean {
  return findings.every((f) => f.signals.some((s) => s.id === id));
}

/** Only facts every member of a `segmentRuns` run carries. */
export function runFacts(
  findings: readonly Finding[],
  thresholds: Thresholds,
  details: ReadonlyMap<string, PackageDetails> = new Map(),
): RunFacts {
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
    pinned: sharedPinned(findings, details),
  };
}
