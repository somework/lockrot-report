/**
 * The detail's "Checks" block (PD-DETAIL-12): each of the ten checks fired, quiet or could not run,
 * read from the fired signals and S10's own list. A state the document does not settle is "not
 * reported", never drawn quiet.
 */

import type { Finding, KnownSignalId, Signal, SignalLevel } from "../model/types";
import { SIGNAL_IDS } from "../model/types";
import { sortedSignals } from "./rows";
import { CHECK_NAMES, type Tone } from "./vocab";

/** `unreported`: S10 fired without naming the checks it stopped, so quiet and could-not-run cannot
 *  be told apart. */
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
  /** Highest level first, including an id this page has no cell for. */
  readonly fired: readonly Signal[];
  /** How many of the ten cells are in each state. */
  readonly counts: Readonly<Record<CheckState, number>>;
  /** Fired ids beyond S1–S10, in `fired`'s order: a newer lockrot's check, or one from outside it. */
  readonly unknown: readonly string[];
  /** Ids S10 names as could-not-run that have no cell and did not fire, as written. */
  readonly blockedUnknown: readonly string[];
  /** The reasons of S10's entries whose own `blocks` names a stopped check, in S10's order, once
   *  each. */
  readonly blockedReasons: readonly S10Reason[];
}

/** One of S10's `data.unchecked[].reason` values, as written. */
export interface S10Reason {
  readonly raw: string;
  readonly known: boolean;
}

/** S10's `x-known-values` in the report schema. */
const S10_REASONS: ReadonlySet<string> = new Set([
  "no_token",
  "anonymous_budget",
  "install_time_budget",
  "rate_limit",
  "fetch_failed",
  "offline",
  "undated_releases",
]);

/** An unknown reason is kept as written, for the caller to set in code. */
export function s10ReasonWords(reason: S10Reason): string {
  return reason.known ? reason.raw.replace(/_/g, " ") : reason.raw;
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

/** `data.blocks`, else the union of `unchecked[].blocks`; `null` when S10 names none, so which
 *  checks ran is unknown. */
export function blockedByS10(s10: Signal): readonly string[] | null {
  const direct = strings(s10.data.blocks);
  if (direct !== null) return direct;

  const nested = records(s10.data.unchecked).map((entry) => strings(entry.blocks));
  if (nested.length === 0 || nested.some((ids) => ids === null)) return null;
  return [...new Set(nested.flatMap((ids) => ids ?? []))];
}

/** The reasons of S10's entries whose own `blocks` names one of `stopped`. */
function blockedReasons(s10: Signal | undefined, stopped: ReadonlySet<string>): readonly S10Reason[] {
  if (s10 === undefined || stopped.size === 0) return [];
  const raws = records(s10.data.unchecked)
    .filter((entry) => strings(entry.blocks)?.some((id) => stopped.has(id)) === true)
    .map((entry) => entry.reason)
    .filter((reason): reason is string => typeof reason === "string" && reason !== "");
  return [...new Set(raws)].map((raw) => ({ raw, known: S10_REASONS.has(raw) }));
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
  const blockedUnknown = [...blockedSet].filter((id) => !KNOWN.has(id) && !byId.has(id));
  const stopped = new Set([
    ...cells.filter((cell) => cell.state === "blocked").map((cell) => cell.id),
    ...blockedUnknown,
  ]);
  return {
    cells,
    fired,
    counts,
    unknown: fired.filter((signal) => !KNOWN.has(signal.id)).map((signal) => signal.id),
    blockedUnknown,
    blockedReasons: blockedReasons(s10, stopped),
  };
}

/** "Every check ran" only when S10 did not fire; quiet cells with no activity on file are counted
 *  inside the quiet figure, so it never reads as every check having had something to look at. */
export function checkTally(strip: CheckStrip, unread = 0): readonly string[] {
  const { fired, quiet, blocked, unreported } = strip.counts;
  const parts = [`${fired} fired`];
  if (unread > 0) parts.push(`${quiet} quiet (${unread} with no activity on file)`);
  else if (quiet > 0 || unreported === 0) parts.push(`${quiet} quiet`);
  if (blocked > 0) parts.push(`${blocked} could not run`);
  if (unreported > 0) parts.push(`${unreported} not reported`);
  const s10Fired = strip.cells.some((cell) => cell.id === "S10" && cell.state === "fired");
  if (!s10Fired) parts.push("every check ran");
  return parts;
}

/** A quiet S10 says what its silence means, not "check gaps". */
export function checkName(cell: Pick<CheckCell, "id" | "state">): string {
  if (cell.id === "S10" && cell.state === "quiet") return "all checks ran";
  return CHECK_NAMES[cell.id] ?? "";
}

export function dataLabel(key: string): string {
  return key.replace(/_/g, " ");
}

const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/;

/** Nothing is dropped: the two parts joined are the value as written. */
export function timestampParts(value: string): { readonly date: string; readonly time: string } | null {
  const match = ISO_TIMESTAMP.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  return { date: match[1], time: match[2] };
}

/** One run of text for `wrapParts`: `atomic` runs are drawn so a line never breaks inside them. */
export interface WrapPart {
  readonly text: string;
  readonly atomic: boolean;
}

const IDENTIFIER = /[-/]|::/;

/** A token split after each "/" that ends a path segment (a "//" stays whole) and after each "::". */
export function identifierPieces(token: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let i = 0; i < token.length - 1; i += 1) {
    const slash = token[i] === "/" && token[i + 1] !== "/" && token[i - 1] !== "/";
    const scope = token[i] === ":" && token[i - 1] === ":";
    const slashAfterSlash = token[i] === "/" && token[i - 1] === "/";
    if (slash || scope || slashAfterSlash) {
      pieces.push(token.slice(start, i + 1));
      start = i + 1;
    }
  }
  pieces.push(token.slice(start));
  return pieces;
}

/**
 * Wraps between words, and inside an identifier only after "/" or "::", never at a hyphen. A
 * no-break-space-joined separator rides with its token. `paths: false` keeps an identifier whole in
 * prose.
 */
export function wrapParts(text: string, { paths = true }: { paths?: boolean } = {}): readonly WrapPart[] {
  const parts: WrapPart[] = [];
  let plain = "";
  // Split at breaking whitespace only: a no-break space keeps what it joins in one token.
  for (const token of text.split(/([^\S\u00a0]+)/)) {
    if (token === "") continue;
    if (!IDENTIFIER.test(token) || /^\s+$/.test(token)) {
      plain += token;
      continue;
    }
    if (plain !== "") parts.push({ text: plain, atomic: false });
    plain = "";
    const pieces = paths ? identifierPieces(token) : [token];
    for (const piece of pieces) parts.push({ text: piece, atomic: true });
  }
  if (plain !== "" || parts.length === 0) parts.push({ text: plain, atomic: false });
  return parts;
}

/** One flagged package S7 pulls in, as its `data.packages` entry names it. */
export interface PulledRow {
  readonly package: string;
  readonly verdict: string;
  /** The chain without the open package and this one. Empty: pulled in directly. */
  readonly via: readonly string[];
}

/** `null` unless every item is exactly `{package, verdict, chain}`: any other shape keeps the
 *  generic drawing, so nothing is hidden. */
export function pulledRows(value: unknown, openPackage: string): readonly PulledRow[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: PulledRow[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const record = item as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort().join(",");
    const chain = strings(record.chain);
    const { package: pkg, verdict } = record;
    if (keys !== "chain,package,verdict" || chain === null) return null;
    if (typeof pkg !== "string" || typeof verdict !== "string") return null;
    const start = chain[0] === openPackage ? 1 : 0;
    const end = chain.length > start && chain[chain.length - 1] === pkg ? chain.length - 1 : chain.length;
    rows.push({ package: pkg, verdict, via: chain.slice(start, end) });
  }
  return rows;
}

/** Anything but `high` or `warn`, `info` included, reads as low. */
export function levelTone(level: SignalLevel): Tone {
  if (level === "high") return "crit";
  if (level === "warn") return "med";
  return "low";
}
