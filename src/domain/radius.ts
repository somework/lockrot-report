/**
 * The Blast radius ledger (PD-RADIUS-1): one row per `exposure[]` entry, in lockrot's order. A row
 * lists the flagged packages its requirement's S7 names, so with nothing filtered its count is
 * lockrot's `exposure[].flagged`. S7 names no `unattributed` package, so no row lists one.
 */

import { countPhrase } from "./format";

/** What the layout reads of a finding: a report-2 one through `radius2.ts`. */
export interface RadiusFinding {
  readonly package: string;
  readonly version: string;
  readonly direct: boolean;
  readonly dev: boolean;
  readonly verdict: string;
  /** report-2's published order. */
  readonly rank: number;
}

/** A flagged package S7 names under a requirement, with its chain from that requirement. */
export interface RadiusMember {
  readonly package: string;
  readonly chain: readonly string[];
}

export interface RadiusExposure {
  readonly package: string;
  readonly flagged: number;
  /** The requirement's S7 `packages`, empty when it carries no S7. */
  readonly members: readonly RadiusMember[];
}

/** The document fields the layout reads. */
export interface RadiusSource<F extends RadiusFinding = RadiusFinding> {
  readonly report: {
    readonly exposure: readonly RadiusExposure[];
    readonly unattributed: readonly { readonly package: string }[];
    readonly findings: readonly F[];
  };
}

export interface RadiusRow<F extends RadiusFinding = RadiusFinding> {
  readonly package: string;
  readonly version: string | null;
  readonly dev: boolean;
  /** The requirement's own finding when it is one of the flagged findings passed in. */
  readonly self: F | null;
  /** The visible flagged packages its S7 names, in S7's order. */
  readonly pulled: readonly F[];
  readonly count: number;
  /** Each S7 package's chain from this requirement, for the tree. */
  readonly chains: ReadonlyMap<string, readonly string[]>;
  /** `exposure[].flagged`, as the document states it. */
  readonly exposure: number;
  /** More than `count` when the search or the rail keeps some off the list. */
  readonly unfiltered: number;
}

export interface RadiusLayout<F extends RadiusFinding = RadiusFinding> {
  /** In `exposure[]` order, the rows with a visible package, a visible flagged requirement, or no
   *  listed finding at all. */
  readonly rows: readonly RadiusRow<F>[];
  /** The rows shown one by one. */
  readonly lead: readonly RadiusRow<F>[];
  /** The trailing one-each rows, folded. */
  readonly singles: readonly RadiusRow<F>[];
  /** Flagged direct requirements `exposure` does not name, so no row can. */
  readonly unlisted: readonly F[];
  /** `unlisted` with no filter applied: every flagged direct requirement `exposure` does not name. */
  readonly unfilteredUnlisted: number;
  /** Not every direct requirement the project has, so the view never says "your N". */
  readonly exposureCount: number;
  readonly narrowed: boolean;
  /** With no filter: the distinct flagged packages listed under any row, and the rows listing any. */
  readonly unfilteredTotal: number;
  readonly unfilteredRows: number;
  /** The visible flagged packages in `unattributed`, in its order: in no row. */
  readonly unattributed: readonly F[];
}

/** Fewer trailing one-each rows than this stay as they are; this many or more fold. */
export const SINGLES_FOLD_MIN = 4;

/** One row per `exposure` entry, in document order; `allFlagged` (before any filter) feeds only
 *  `unfiltered`. */
export function radiusRows<F extends RadiusFinding>(
  model: RadiusSource<F>,
  visibleFlagged: readonly F[],
  allFlagged: readonly F[] = visibleFlagged,
): readonly RadiusRow<F>[] {
  const own = new Map(model.report.findings.map((f) => [f.package, f]));
  const visible = new Map(visibleFlagged.map((f) => [f.package, f]));
  const all = new Set(allFlagged.map((f) => f.package));

  return model.report.exposure.map(({ package: name, flagged, members }) => {
    const listed = members.filter((m) => m.package !== name);
    const pulled = listed.flatMap((m) => {
      const found = visible.get(m.package);
      return found === undefined ? [] : [found];
    });
    return {
      package: name,
      version: own.get(name)?.version ?? null,
      dev: own.get(name)?.dev ?? false,
      self: visible.get(name) ?? null,
      pulled,
      count: pulled.length,
      chains: new Map(listed.map((m) => [m.package, m.chain])),
      exposure: flagged,
      unfiltered: listed.filter((m) => all.has(m.package)).length,
    };
  });
}

/** The trailing rows that list one package each; the order stays lockrot's. */
function trailingSingles<F extends RadiusFinding>(rows: readonly RadiusRow<F>[]): number {
  let n = 0;
  while (n < rows.length && rows[rows.length - 1 - n]?.count === 1) n += 1;
  return n;
}

export function radiusLayout<F extends RadiusFinding>(
  model: RadiusSource<F>,
  visibleFlagged: readonly F[],
  allFlagged: readonly F[] = visibleFlagged,
): RadiusLayout<F> {
  const every = radiusRows(model, visibleFlagged, allFlagged);
  const visible = new Set(visibleFlagged.map((f) => f.package));
  const all = new Set(allFlagged.map((f) => f.package));
  // A requirement whose S7 names no finding of the report keeps its row: `exposure[]` still counts it.
  const rows = every.filter((r) => r.count > 0 || r.self !== null || r.unfiltered === 0);
  const ones = trailingSingles(rows);
  const fold = ones >= SINGLES_FOLD_MIN && ones < rows.length;
  const parents = new Set(every.map((r) => r.package));
  const unfilteredListed = new Set(
    every.flatMap((r) => [...r.chains.keys()].filter((name) => all.has(name))),
  );

  return {
    rows,
    lead: fold ? rows.slice(0, rows.length - ones) : rows,
    singles: fold ? rows.slice(rows.length - ones) : [],
    unlisted: visibleFlagged.filter((f) => f.direct && !parents.has(f.package)),
    unfilteredUnlisted: allFlagged.filter((f) => f.direct && !parents.has(f.package)).length,
    exposureCount: every.length,
    narrowed: allFlagged.some((f) => !visible.has(f.package)),
    unfilteredTotal: unfilteredListed.size,
    unfilteredRows: every.filter((r) => r.unfiltered > 0).length,
    unattributed: unattributedOf(model, visibleFlagged),
  };
}

/** `unattributed`'s flagged packages among `flagged`, in the document's order; each once. */
function unattributedOf<F extends RadiusFinding>(
  model: RadiusSource<F>,
  flagged: readonly F[],
): readonly F[] {
  const byName = new Map(flagged.map((f) => [f.package, f]));
  const names = new Set(model.report.unattributed.map((entry) => entry.package));
  return [...names].flatMap((name) => {
    const found = byName.get(name);
    return found === undefined ? [] : [found];
  });
}

/** `exposure` lists only requirements with something flagged counted under them, so the line also
 *  counts the flagged ones it leaves out. */
export function radiusCountPhrase<F extends RadiusFinding>(layout: RadiusLayout<F>): string {
  const head = countPhrase(
    layout.rows.length,
    layout.exposureCount,
    "direct requirement",
    "direct requirements",
  );
  if (layout.unfilteredUnlisted === 0) return head;
  const ones = layout.unfilteredUnlisted === 1 ? "flagged one" : "flagged ones";
  return `${head} on the exposure list, plus ${String(layout.unlisted.length)} of ${String(
    layout.unfilteredUnlisted,
  )} ${ones} with nothing flagged counted under ${layout.unfilteredUnlisted === 1 ? "it" : "them"}`;
}

// ---------------------------------------------------------------------------------------------
// The chain tree an open row draws
// ---------------------------------------------------------------------------------------------

export interface TreeNode<F extends RadiusFinding = RadiusFinding> {
  readonly finding: F;
  /** 0 for a package whose nearest listed ancestor is the row's requirement itself. */
  readonly depth: number;
  /** Unflagged hops between its tree parent and it, in chain order. */
  readonly via: readonly string[];
  /** Whether it is the last child of its tree parent. */
  readonly last: boolean;
  readonly rails: readonly boolean[];
}

/** The chain's hops before `pkg` itself (a chain may or may not end with the package). */
function hopsOf(chain: readonly string[], pkg: string): readonly string[] {
  return chain.at(-1) === pkg ? chain.slice(0, -1) : chain;
}

/** Each package hangs under the nearest hop of its S7 chain the row also lists; unflagged hops
 *  between are named "via". */
export function pulledTree<F extends RadiusFinding>(row: RadiusRow<F>): readonly TreeNode<F>[] {
  const listed = new Set(row.pulled.map((f) => f.package));
  const children = new Map<string, { finding: F; via: readonly string[] }[]>();
  for (const finding of row.pulled) {
    const hops = hopsOf(row.chains.get(finding.package) ?? [], finding.package);
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

  const out: TreeNode<F>[] = [];
  const seen = new Set<string>();
  const walk = (parent: string, depth: number, rails: readonly boolean[]): void => {
    const kids = [...(children.get(parent) ?? [])].sort((a, b) => a.finding.rank - b.finding.rank);
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

export interface RadiusAnswer<F extends RadiusFinding = RadiusFinding> {
  /** The rows the sentence names, in `exposure[]` order: as few as hold half the listed packages, at most 3. */
  readonly top: readonly RadiusRow<F>[];
  /** Distinct packages the named rows list. */
  readonly held: number;
  /** Distinct packages listed under any row. */
  readonly total: number;
  /** How many rows list anything. */
  readonly rows: number;
  readonly exposureCount: number;
}

export const ANSWER_MAX_ROWS = 3;

export function radiusAnswer<F extends RadiusFinding>(layout: RadiusLayout<F>): RadiusAnswer<F> | null {
  const listing = layout.rows.filter((r) => r.count > 0);
  if (listing.length === 0) return null;
  const total = new Set(listing.flatMap((r) => r.pulled.map((f) => f.package))).size;
  const top: RadiusRow<F>[] = [];
  const held = new Set<string>();
  for (const row of listing) {
    top.push(row);
    for (const f of row.pulled) held.add(f.package);
    if (held.size * 2 >= total || top.length === ANSWER_MAX_ROWS) break;
  }
  return { top, held: held.size, total, rows: listing.length, exposureCount: layout.exposureCount };
}

// ---------------------------------------------------------------------------------------------
// What is open
// ---------------------------------------------------------------------------------------------

/** Disclosure keys: a row's own packages and the one-each fold. */
export const rowKey = (pkg: string): string => `row:${pkg}`;
export const FOLD_SINGLES = "fold:singles";

export interface OpenInput {
  /** What the reader opened or closed; a key they never touched takes its default. */
  readonly disclosure: Readonly<Record<string, boolean>>;
  /** The open package: the row listing it opens, and so does the fold holding that row. */
  readonly pkg: string | null;
  /** Phone widths: the one-each fold starts closed there, open elsewhere. */
  readonly narrow: boolean;
}

/** The one row the open package opens, since S7 can list a package under several: a row the reader
 *  opened that lists it, else the first that lists it. */
function holderOf<F extends RadiusFinding>(layout: RadiusLayout<F>, input: OpenInput): string | null {
  const { pkg } = input;
  if (pkg === null) return null;
  const listing = [...layout.lead, ...layout.singles].filter((r) => r.pulled.some((f) => f.package === pkg));
  return (listing.find((r) => input.disclosure[rowKey(r.package)] === true) ?? listing[0])?.package ?? null;
}

export function isRowOpen<F extends RadiusFinding>(
  layout: RadiusLayout<F>,
  row: RadiusRow<F>,
  input: OpenInput,
): boolean {
  return input.disclosure[rowKey(row.package)] ?? row.package === holderOf(layout, input);
}

export function isSinglesOpen<F extends RadiusFinding>(layout: RadiusLayout<F>, input: OpenInput): boolean {
  const set = input.disclosure[FOLD_SINGLES];
  if (set !== undefined) return set;
  const holder = holderOf(layout, input);
  return !input.narrow || layout.singles.some((r) => r.package === input.pkg || r.package === holder);
}
