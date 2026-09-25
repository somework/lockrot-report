/**
 * The detail panel's "Checks" block (PD-DETAIL-12, DESIGN.md §5): all ten of lockrot's checks at a
 * glance — which fired, which stayed quiet, which could not run — and then only the fired ones,
 * most important first.
 *
 * Display only, read from two things the document already says: each `Signal` that fired (its id
 * and `level`), and S10's `data.blocks`, lockrot's own list of the checks that could not run for
 * this package. A state the document does not settle is reported as unknown, never guessed: when
 * S10 fired but named no check, the others are "not reported" rather than drawn quiet. Pure, no
 * DOM, no clock.
 */

import type { Finding, KnownSignalId, Signal, SignalLevel } from "../model/types";
import { SIGNAL_IDS } from "../model/types";
import { sortedSignals } from "./rows";
import type { Tone } from "./vocab";

/**
 * - `fired`: the signal is on the finding.
 * - `quiet`: it is not, and nothing says its check was prevented from running.
 * - `blocked`: it is not, and S10 names it among the checks that could not run.
 * - `unreported`: it is not, and S10 fired without saying which checks it stopped, so quiet and
 *   could-not-run cannot be told apart.
 */
export type CheckState = "fired" | "quiet" | "blocked" | "unreported";

export interface CheckCell {
  readonly id: KnownSignalId;
  readonly state: CheckState;
  /** The fired signal, `null` for every other state. */
  readonly signal: Signal | null;
}

export interface CheckStrip {
  /** S1 to S10, in that order, one each. */
  readonly cells: readonly CheckCell[];
  /** Every fired signal, highest level first (`rows.ts#sortedSignals`), including an id newer than
   *  S10 that this page has no cell for. */
  readonly fired: readonly Signal[];
  /** How many of the ten cells are in each state. */
  readonly counts: Readonly<Record<CheckState, number>>;
  /** Fired ids beyond S1–S10, in `fired`'s order: a newer lockrot's check. */
  readonly unknown: readonly string[];
  /** Why the blocked checks could not run, from S10's `data.unchecked[].reason` ("undated
   *  releases"), or `null` when S10 gives none. */
  readonly blockedReason: string | null;
}

const KNOWN: ReadonlySet<string> = new Set(SIGNAL_IDS);

function strings(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function records(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Readonly<Record<string, unknown>> => typeof item === "object" && item !== null,
  );
}

/**
 * The ids S10 says could not run: its `data.blocks`, or, for a document that carries only the
 * per-check list, the union of `data.unchecked[].blocks`. `null` when S10 names none in either
 * shape — the caller then cannot tell which checks ran.
 */
export function blockedByS10(s10: Signal): readonly string[] | null {
  const direct = strings(s10.data.blocks);
  if (direct !== null) return direct;

  const nested = records(s10.data.unchecked).map((entry) => strings(entry.blocks));
  if (nested.length === 0 || nested.some((ids) => ids === null)) return null;
  return [...new Set(nested.flatMap((ids) => ids ?? []))];
}

function blockedReason(s10: Signal | undefined): string | null {
  if (s10 === undefined) return null;
  const reasons = records(s10.data.unchecked)
    .map((entry) => entry.reason)
    .filter((reason): reason is string => typeof reason === "string" && reason !== "")
    .map((reason) => reason.replace(/_/g, " "));
  const distinct = [...new Set(reasons)];
  return distinct.length === 0 ? null : distinct.join(" and ");
}

/** Every one of the ten checks in its state, and the fired signals in reading order. */
export function checkStrip(finding: Finding): CheckStrip {
  const byId = new Map(finding.signals.map((signal) => [signal.id, signal]));
  const s10 = byId.get("S10");
  const blocked = s10 === undefined ? [] : blockedByS10(s10);
  const blockedSet = new Set(blocked ?? []);

  const cells = SIGNAL_IDS.map((id): CheckCell => {
    const signal = byId.get(id) ?? null;
    if (signal !== null) return { id, state: "fired", signal };
    if (blocked === null) return { id, state: "unreported", signal: null };
    return { id, state: blockedSet.has(id) ? "blocked" : "quiet", signal: null };
  });

  const counts: Record<CheckState, number> = { fired: 0, quiet: 0, blocked: 0, unreported: 0 };
  for (const cell of cells) counts[cell.state] += 1;

  const fired = sortedSignals(finding.signals);
  const hasBlocked = counts.blocked > 0;
  return {
    cells,
    fired,
    counts,
    unknown: fired.filter((signal) => !KNOWN.has(signal.id)).map((signal) => signal.id),
    blockedReason: hasBlocked ? blockedReason(s10) : null,
  };
}

/**
 * The line under the strip: "5 fired · 5 quiet · every check ran", "3 fired · 6 quiet · 1 could
 * not run", "1 fired · 9 not reported". "Every check ran" is said only when S10 did not fire —
 * S10 firing is lockrot saying a check did not, even when that check's own signal fired anyway.
 */
export function checkTally(strip: CheckStrip): readonly string[] {
  const { fired, quiet, blocked, unreported } = strip.counts;
  const parts = [`${fired} fired`];
  if (quiet > 0 || unreported === 0) parts.push(`${quiet} quiet`);
  if (blocked > 0) parts.push(`${blocked} could not run`);
  if (unreported > 0) parts.push(`${unreported} not reported`);
  const s10Fired = strip.cells.some((cell) => cell.id === "S10" && cell.state === "fired");
  if (!s10Fired) parts.push("every check ran");
  return parts;
}

/**
 * A signal level's tone, shared by the strip's cell and the fired row's id: `high` is drawn as a
 * critical verdict is, `warn` in the medium tone the Findings list's age bars use past the warn
 * threshold, anything else (the open-ended `"info"`, a level this page does not know) as low.
 */
export function levelTone(level: SignalLevel): Tone {
  if (level === "high") return "crit";
  if (level === "warn") return "med";
  return "low";
}
