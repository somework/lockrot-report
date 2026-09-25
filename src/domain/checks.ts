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
import { CHECK_NAMES, type Tone } from "./vocab";

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
 * The words under a cell and beside its id for a screen reader: the check's short name
 * (`vocab.ts#CHECK_NAMES`), except a quiet S10, which says what its silence means — "all checks
 * ran" — rather than a name ("check gaps") that reads as if there were gaps.
 */
export function checkName(cell: Pick<CheckCell, "id" | "state">): string {
  if (cell.id === "S10" && cell.state === "quiet") return "all checks ran";
  return CHECK_NAMES[cell.id] ?? "";
}

/**
 * A key in a signal's `data` as a label: "branch_last_release" reads "branch last release". Only the
 * underscores change, so the label still names the document's own key.
 */
export function dataLabel(key: string): string {
  return key.replace(/_/g, " ");
}

const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/;

/**
 * An ISO timestamp split into its date and the rest ("2022-03-17" and "T08:00:35+00:00"), so the
 * date can lead and the time sit quieter beside it; `null` for any other value. Nothing is dropped
 * or converted: the two parts joined are the value as the document wrote it.
 */
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

/** A token that names something — a package, a URL, an advisory id, a date, a setting, a verdict —
 *  rather than a plain word: it carries a hyphen, a slash or a "::". */
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
 * Text split so it wraps where a reader expects: between words, and inside an identifier only after
 * a "/" or "::" — "composer/" then "package-versions-deprecated", "https://", "github.com/", … — never
 * at the hyphens of "left-behind", "2022-03-17" or "PKSA-kbc7-dq62-pt7d". Each identifier piece is
 * `atomic` (the renderer keeps it on one line unless it alone is wider than the line); everything
 * else, spaces included, is a plain run. Punctuation attached to a token stays with it, and so does
 * a separator glued on with a no-break space ("doctrine/dbal\u00a0›"): it rides in the token's last
 * piece, so a line breaks after it, never before it. Joined, the parts are the text unchanged.
 *
 * `paths: false` is for prose (a fired check's summary, its definition): an identifier is one piece,
 * never broken after its "/" while it fits the line — a package name read inside a sentence stays
 * whole. The "/"-breaks are for narrow data columns only (the renderer may still offer them inside a
 * prose piece, for when it alone is wider than the line).
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
  /** The hops between the open package and this one: the chain without its first hop when that is
   *  the open package, and without its last when that is this package. Empty: pulled in directly. */
  readonly via: readonly string[];
}

/**
 * S7's `data.packages` as table rows (package · verdict · via), or `null` when the value is not a
 * list of `{package, verdict, chain}` objects with no other field — any other shape keeps the
 * generic per-field drawing, so nothing the document carries is hidden. The chain's first hop is
 * the open package every row repeats, and its last the row's own package, so neither is said again.
 */
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
