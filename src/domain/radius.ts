/**
 * The Blast radius ledger (PD-RADIUS-1, DESIGN.md §5): one row per direct requirement, ranked by how
 * many flagged packages it lists underneath. Legacy's `viewRadius` (`report.js:595-625`) drew a card
 * per requirement; M24/M25 fixed its count to be the rows listed. This keeps that rule — `count` is
 * exactly `pulled.length` — and adds what the document already says about the rest:
 *
 * - `elsewhere`: flagged packages the requirement also reaches (its name is in their own
 *   `direct_dependents`) whose recorded chain starts at another requirement, so they are listed
 *   under that row instead. `count + elsewhere.length` is lockrot's own `exposure[].flagged`
 *   whenever nothing is filtered (a unit test holds every fixture to it).
 * - rows that list nothing are sorted into two tails: requirements that are flagged themselves, and
 *   requirements that reach flagged packages only through rows above.
 *
 * Arrangement and counting only: every fact is a field of the document (`chain`,
 * `direct_dependents`, `exposure`, a finding's verdict and priority).
 */

import type { Finding, Model, Verdict } from "../model/types";
import { PRIORITIES } from "../model/types";
import { countPhrase } from "./format";
import { VERDICT_ORDER } from "./vocab";

/** A flagged package a row reaches but does not list: `listedUnder` is the row that lists it (the
 *  first direct requirement on its recorded chain), or null when no row does. */
export interface RadiusElsewhere {
  readonly finding: Finding;
  readonly listedUnder: string | null;
}

export interface RadiusRow {
  readonly package: string;
  /** The requirement's own installed version, from its finding (flagged or not); null when the
   *  document has no finding for it. */
  readonly version: string | null;
  readonly dev: boolean;
  /** The requirement's own finding when it is one of the flagged findings passed in. */
  readonly self: Finding | null;
  /** Flagged packages whose recorded chain runs through this requirement — the rows it lists. */
  readonly pulled: readonly Finding[];
  /** `pulled.length` — exactly the rows this requirement lists (M24/M25). */
  readonly count: number;
  readonly elsewhere: readonly RadiusElsewhere[];
  /** `exposure[].flagged`, as the document states it. */
  readonly exposure: number;
  /** Flagged packages listed under it with no filter applied: `count` again when nothing is
   *  filtered, more when the query box or the rail keeps some of them off the list. */
  readonly unfiltered: number;
}

/** A flagged package on the "only through rows above" receipt, and every tail row behind it. */
export interface RadiusReceipt {
  readonly finding: Finding;
  readonly listedUnder: string | null;
  readonly behind: readonly string[];
}

export interface RadiusLayout {
  /** Every row that lists at least one package, most first; exposure order on ties. */
  readonly ranked: readonly RadiusRow[];
  /** The ranked rows shown one by one. */
  readonly lead: readonly RadiusRow[];
  /** The ranked rows that list exactly one package each, folded under one head; empty when the
   *  list is too short to need it. */
  readonly singles: readonly RadiusRow[];
  /** Flagged themselves, listing nothing. */
  readonly selfOnly: readonly RadiusRow[];
  /** Neither flagged nor listing anything, but reaching a flagged package listed under a row above. */
  readonly throughOther: readonly RadiusRow[];
  /** `throughOther`'s packages, one entry per flagged package. */
  readonly receipt: readonly RadiusReceipt[];
  /** Flagged direct requirements `exposure` does not name, so no row can. */
  readonly unlisted: readonly Finding[];
  /** `unlisted` with no filter applied: every flagged direct requirement `exposure` leaves out. */
  readonly unfilteredUnlisted: number;
  /** How many direct requirements `exposure` names — not every direct requirement the project has:
   *  `unfilteredUnlisted` more are flagged and missing from it, so the view always says "the N
   *  direct requirements lockrot's exposure list names", never "your N". */
  readonly exposureCount: number;
  /** Whether the query box or the rail keeps any flagged package off the tab: every count above is
   *  then of the packages that match, and the view says so. */
  readonly narrowed: boolean;
  /** With no filter: the distinct flagged packages listed under any row, and the rows listing any. */
  readonly unfilteredTotal: number;
  readonly unfilteredRows: number;
}

/** Fewer one-each rows than this stay in the ranking as they are; this many or more fold. */
export const SINGLES_FOLD_MIN = 4;

/** The chain's hops before `pkg` itself (a chain may or may not end with the package). */
function hopsOf(finding: Finding): readonly string[] {
  const last = finding.chain.at(-1);
  return last === finding.package ? finding.chain.slice(0, -1) : finding.chain;
}

/** The flagged packages `parent`'s row lists: those whose recorded chain runs through it. */
function listedUnder(parent: string, flagged: readonly Finding[]): readonly Finding[] {
  return flagged.filter((f) => f.package !== parent && hopsOf(f).includes(parent));
}

/**
 * One row per `exposure` entry, in document order, from `visibleFlagged` — the view's
 * already-filtered flagged findings (the query box and the rail apply before this runs) — and
 * `allFlagged`, the same list before any filter, which only `unfiltered` reads.
 */
export function radiusRows(
  model: Model,
  visibleFlagged: readonly Finding[],
  allFlagged: readonly Finding[] = visibleFlagged,
): readonly RadiusRow[] {
  const parents = model.report.exposure.map((e) => e.package);
  const parentSet = new Set(parents);
  const byName = new Map(model.report.findings.map((f) => [f.package, f]));
  const kept = new Map(visibleFlagged.map((f) => [f.package, f]));

  return model.report.exposure.map((exposure) => {
    const pulled = listedUnder(exposure.package, visibleFlagged);
    const listed = new Set(pulled.map((f) => f.package));
    const elsewhere = visibleFlagged
      .filter(
        (f) =>
          !f.direct &&
          f.package !== exposure.package &&
          !listed.has(f.package) &&
          f.directDependents.includes(exposure.package),
      )
      .map((f) => ({ finding: f, listedUnder: hopsOf(f).find((hop) => parentSet.has(hop)) ?? null }));
    const own = byName.get(exposure.package);

    return {
      package: exposure.package,
      version: own?.version ?? null,
      dev: own?.dev ?? false,
      self: kept.get(exposure.package) ?? null,
      pulled,
      count: pulled.length,
      elsewhere,
      exposure: exposure.flagged,
      unfiltered:
        allFlagged === visibleFlagged ? pulled.length : listedUnder(exposure.package, allFlagged).length,
    };
  });
}

/** Sorts the rows into the ranking, its fold and the two tails; drops rows with nothing to say.
 *  `allFlagged` is the tab's flagged findings before any filter (`population`); left out, the
 *  visible ones are all there is. */
export function radiusLayout(
  model: Model,
  visibleFlagged: readonly Finding[],
  allFlagged: readonly Finding[] = visibleFlagged,
): RadiusLayout {
  const rows = radiusRows(model, visibleFlagged, allFlagged);
  const visible = new Set(visibleFlagged.map((f) => f.package));
  const narrowed = allFlagged.some((f) => !visible.has(f.package));
  const unfilteredListed = new Set(
    model.report.exposure.flatMap((e) => listedUnder(e.package, allFlagged).map((f) => f.package)),
  );
  const ranked = [...rows.filter((r) => r.count > 0)].sort((a, b) => b.count - a.count);
  const multi = ranked.filter((r) => r.count > 1);
  const ones = ranked.filter((r) => r.count === 1);
  const fold = multi.length > 0 && ones.length >= SINGLES_FOLD_MIN;
  const throughOther = rows.filter((r) => r.count === 0 && r.self === null && r.elsewhere.length > 0);
  const parents = new Set(rows.map((r) => r.package));

  return {
    ranked,
    lead: fold ? multi : ranked,
    singles: fold ? ones : [],
    selfOnly: rows.filter((r) => r.count === 0 && r.self !== null),
    throughOther,
    receipt: receiptOf(throughOther),
    unlisted: visibleFlagged.filter((f) => f.direct && !parents.has(f.package)),
    unfilteredUnlisted: allFlagged.filter((f) => f.direct && !parents.has(f.package)).length,
    exposureCount: rows.length,
    narrowed,
    unfilteredTotal: unfilteredListed.size,
    unfilteredRows: rows.filter((r) => r.unfiltered > 0).length,
  };
}

function receiptOf(rows: readonly RadiusRow[]): readonly RadiusReceipt[] {
  const byPkg = new Map<string, { finding: Finding; listedUnder: string | null; behind: string[] }>();
  for (const row of rows) {
    for (const { finding, listedUnder } of row.elsewhere) {
      const entry = byPkg.get(finding.package) ?? { finding, listedUnder, behind: [] };
      byPkg.set(finding.package, { ...entry, behind: [...entry.behind, row.package] });
    }
  }
  return [...byPkg.values()].sort(
    (a, b) => b.behind.length - a.behind.length || a.finding.package.localeCompare(b.finding.package),
  );
}

/** The flagged packages the tab names anywhere: every row's pulled packages, every flagged
 *  requirement that heads a row, and every one the footnote names (PD-RADIUS-5). */
export function radiusListed(layout: RadiusLayout): ReadonlySet<string> {
  const rows = [...layout.ranked, ...layout.selfOnly];
  return new Set([
    ...rows.flatMap((r) => [...(r.self ? [r.self.package] : []), ...r.pulled.map((f) => f.package)]),
    ...layout.unlisted.map((f) => f.package),
  ]);
}

/** The direct requirements the tab names by row or in a tail — what its count line counts. */
export function radiusShownCount(layout: RadiusLayout): number {
  return layout.ranked.length + layout.selfOnly.length + layout.throughOther.length;
}

/**
 * The status line's count for the tab: "29 of 29 direct requirements" when `exposure` names every
 * flagged direct requirement; when it leaves some out, the footnote names them too, so the line
 * counts them as well and says which list the first number is of — "29 of 29 direct requirements
 * on the exposure list, plus 8 of 8 flagged ones it leaves out".
 */
export function radiusCountPhrase(layout: RadiusLayout): string {
  const head = countPhrase(
    radiusShownCount(layout),
    layout.exposureCount,
    "direct requirement",
    "direct requirements",
  );
  if (layout.unfilteredUnlisted === 0) return head;
  const ones = layout.unfilteredUnlisted === 1 ? "flagged one" : "flagged ones";
  return `${head} on the exposure list, plus ${String(layout.unlisted.length)} of ${String(
    layout.unfilteredUnlisted,
  )} ${ones} it leaves out`;
}

/**
 * The findings among `flagged` that have a place on the Blast radius tab at all: listed under some
 * direct requirement's row, heading a row as a flagged direct requirement, or — a flagged direct
 * requirement `exposure` does not name (wallabag's lcobucci/jwt, say) — named, with a link, in the
 * footnote. Only a transitive package whose recorded chain reaches no row is left out. Membership
 * is per finding, so a filter applied before or after this gives the same set; the rail counts over
 * this set on that tab (PD-RAIL-1, `domain/filters.ts#railGroups`), so Direct plus Transitive is
 * the summary band's flagged count whenever every chain reaches a row.
 */
export function placedOnRadius(model: Model, flagged: readonly Finding[]): readonly Finding[] {
  const parents = new Set(model.report.exposure.map((exposure) => exposure.package));
  return flagged.filter(
    (f) => f.direct || parents.has(f.package) || f.chain.some((hop) => hop !== f.package && parents.has(hop)),
  );
}

// ---------------------------------------------------------------------------------------------
// Ordering and counting inside a row
// ---------------------------------------------------------------------------------------------

function rankOf(list: readonly string[], key: string): number {
  const at = list.indexOf(key);
  return at < 0 ? list.length : at;
}

/** Most urgent first: priority, then verdict, then name — the order a row's squares are drawn in. */
export function byUrgency(a: Finding, b: Finding): number {
  return (
    rankOf(PRIORITIES, a.priority) - rankOf(PRIORITIES, b.priority) ||
    rankOf(VERDICT_ORDER, a.verdict) - rankOf(VERDICT_ORDER, b.verdict) ||
    a.package.localeCompare(b.package)
  );
}

export interface VerdictCount {
  readonly verdict: Verdict;
  readonly count: number;
}

/** Packages per verdict, most common first; verdict order on ties. */
export function verdictMix(findings: readonly Finding[]): readonly VerdictCount[] {
  const counts = new Map<Verdict, number>();
  for (const f of findings) counts.set(f.verdict, (counts.get(f.verdict) ?? 0) + 1);
  return [...counts.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count || rankOf(VERDICT_ORDER, a.verdict) - rankOf(VERDICT_ORDER, b.verdict));
}

/** One vendor's share of a list: "hoa/*" with its count, or a lone package by its full name. */
export interface VendorPart {
  readonly text: string;
  readonly count: number;
}

/**
 * Where a row's packages come from, as few words as the list allows: one vendor ("all hoa/*"), up to
 * three parts named, or the two biggest vendors and "N from other vendors" when those two hold at
 * least half. `null` when the list is too spread out for a short phrase to be true — the verdict mix
 * then says it alone.
 */
export function vendorPhrase(
  findings: readonly Finding[],
): { readonly parts: readonly VendorPart[]; readonly others: number; readonly all: boolean } | null {
  const groups = new Map<string, string[]>();
  for (const f of findings) {
    const slash = f.package.indexOf("/");
    const vendor = slash > 0 ? f.package.slice(0, slash) : f.package;
    groups.set(vendor, [...(groups.get(vendor) ?? []), f.package]);
  }
  const parts = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([vendor, names]) => ({
      text: names.length === 1 ? (names[0] ?? vendor) : `${vendor}/*`,
      count: names.length,
    }));
  if (parts.length === 1) return { parts, others: 0, all: findings.length > 1 };
  if (parts.length <= 3) return { parts, others: 0, all: false };
  const top = parts.slice(0, 2);
  const held = top.reduce((n, p) => n + p.count, 0);
  if (held * 2 < findings.length) return null;
  return { parts: top, others: findings.length - held, all: false };
}

// ---------------------------------------------------------------------------------------------
// The chain tree an open row draws
// ---------------------------------------------------------------------------------------------

export interface TreeNode {
  readonly finding: Finding;
  /** 0 for a package whose nearest listed ancestor is the row's requirement itself. */
  readonly depth: number;
  /** Unflagged hops between its tree parent and it, in chain order. */
  readonly via: readonly string[];
  /** Whether it is the last child of its tree parent. */
  readonly last: boolean;
  /** For each ancestor depth 0..depth-1: whether that ancestor has a later sibling (its line runs
   *  on past this row). */
  readonly rails: readonly boolean[];
}

/**
 * A row's pulled packages as the tree their recorded chains draw: each hangs under the nearest hop
 * of its own chain that the row also lists, and the hops in between that are not flagged are named
 * as "via". Depth-first, siblings most urgent first.
 */
export function pulledTree(row: RadiusRow): readonly TreeNode[] {
  const listed = new Set(row.pulled.map((f) => f.package));
  const children = new Map<string, { finding: Finding; via: readonly string[] }[]>();
  for (const finding of row.pulled) {
    const hops = hopsOf(finding);
    const from = hops.indexOf(row.package);
    const path = from < 0 ? [] : hops.slice(from + 1);
    let parentAt = -1;
    path.forEach((hop, i) => {
      if (listed.has(hop) && hop !== finding.package) parentAt = i;
    });
    const parent = parentAt < 0 ? row.package : (path[parentAt] ?? row.package);
    const via = path.slice(parentAt + 1);
    children.set(parent, [...(children.get(parent) ?? []), { finding, via }]);
  }

  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string, depth: number, rails: readonly boolean[]): void => {
    const kids = [...(children.get(parent) ?? [])].sort((a, b) => byUrgency(a.finding, b.finding));
    kids.forEach((kid, i) => {
      if (seen.has(kid.finding.package)) return;
      seen.add(kid.finding.package);
      const last = i === kids.length - 1;
      out.push({ finding: kid.finding, depth, via: kid.via, last, rails });
      walk(kid.finding.package, depth + 1, [...rails, !last]);
    });
  };
  walk(row.package, 0, []);
  // A chain loop (malformed document) could leave a package unreached: list it at the top level.
  for (const finding of row.pulled) {
    if (!seen.has(finding.package)) out.push({ finding, depth: 0, via: [], last: true, rails: [] });
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// The answer sentence
// ---------------------------------------------------------------------------------------------

export interface RadiusAnswer {
  /** The rows the sentence names, most first: as few as hold half the listed packages, at most 3. */
  readonly top: readonly RadiusRow[];
  /** Distinct packages the named rows list. */
  readonly held: number;
  /** Distinct packages listed under any row. */
  readonly total: number;
  /** How many rows list anything. */
  readonly rows: number;
  readonly exposureCount: number;
}

export const ANSWER_MAX_ROWS = 3;

export function radiusAnswer(layout: RadiusLayout): RadiusAnswer | null {
  if (layout.ranked.length === 0) return null;
  const total = new Set(layout.ranked.flatMap((r) => r.pulled.map((f) => f.package))).size;
  const top: RadiusRow[] = [];
  const held = new Set<string>();
  for (const row of layout.ranked) {
    top.push(row);
    for (const f of row.pulled) held.add(f.package);
    if (held.size * 2 >= total || top.length === ANSWER_MAX_ROWS) break;
  }
  return { top, held: held.size, total, rows: layout.ranked.length, exposureCount: layout.exposureCount };
}

// ---------------------------------------------------------------------------------------------
// What is open
// ---------------------------------------------------------------------------------------------

/** Disclosure keys: a row's own packages, the one-each fold and the two tails. */
export const rowKey = (pkg: string): string => `row:${pkg}`;
export const FOLD_SINGLES = "fold:singles";
export const FOLD_SELF = "fold:self";
export const FOLD_OTHER = "fold:other";

export interface OpenInput {
  /** What the reader opened or closed; a key they never touched takes its default. */
  readonly disclosure: Readonly<Record<string, boolean>>;
  /** The open package: the row listing it opens, and so does the fold holding that row. */
  readonly pkg: string | null;
  /** Phone widths: the one-each fold starts closed there, open elsewhere. */
  readonly narrow: boolean;
}

export function isRowOpen(row: RadiusRow, input: OpenInput): boolean {
  return input.disclosure[rowKey(row.package)] ?? row.pulled.some((f) => f.package === input.pkg);
}

function holds(rows: readonly RadiusRow[], pkg: string | null): boolean {
  if (pkg === null) return false;
  return rows.some((r) => r.package === pkg || r.pulled.some((f) => f.package === pkg));
}

export function isFoldOpen(layout: RadiusLayout, key: string, input: OpenInput): boolean {
  // With nothing ranked above it (a filter left no row listing anything), this tail is the list: it
  // is always shown, whatever the reader did to the fold while there was a ranking above it.
  if (key === FOLD_SELF && layout.ranked.length === 0) return true;
  const set = input.disclosure[key];
  if (set !== undefined) return set;
  if (key === FOLD_SINGLES) return !input.narrow || holds(layout.singles, input.pkg);
  if (key === FOLD_SELF) return holds(layout.selfOnly, input.pkg);
  return layout.receipt.some((r) => r.finding.package === input.pkg);
}

/** The packages of the rows on screen, top to bottom — a row, then its packages when it is open;
 *  the "only through rows above" tail lists the flagged packages it reaches, one row each — the
 *  order `j`/`k` walk (`ui/views/order.ts`). */
export function radiusRowOrder(layout: RadiusLayout, input: OpenInput): readonly string[] {
  const rowsOf = (rows: readonly RadiusRow[], expandable: boolean) =>
    rows.flatMap((row) => [
      row.package,
      ...(expandable && isRowOpen(row, input) ? pulledTree(row).map((n) => n.finding.package) : []),
    ]);
  return [
    ...rowsOf(layout.lead, true),
    ...(isFoldOpen(layout, FOLD_SINGLES, input) ? rowsOf(layout.singles, true) : []),
    ...(isFoldOpen(layout, FOLD_SELF, input) ? rowsOf(layout.selfOnly, false) : []),
    ...(isFoldOpen(layout, FOLD_OTHER, input) ? layout.receipt.map((r) => r.finding.package) : []),
  ];
}
