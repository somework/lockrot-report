/**
 * Which findings each tab lists, the filters that narrow that list, and the left-hand rail's
 * groups — ported from legacy's `population()`, `matches()`'s rail-selection steps, `SORTS` and
 * `renderRail()` (`report.js:312-394,548-593`; js-2.md §2-3,10-11).
 *
 * The query-string half of filtering (free text, `verdict:`, `signal:`, …) lives in `query.ts`;
 * this module owns the other half — the rail's own button state (`State.filters`) — and the
 * per-view population and ordering rules that decide what a tab shows at all.
 */

import type { Finding, Model, Priority, View } from "../model/types";
import { PRIORITIES } from "../model/types";
import { FILTER_GROUPS, type Filters, type FilterGroup, type SortKey, type State } from "../state/types";
import { matchesFinding, parseQuery } from "./query";
import { fixShapeOf, type FixShape } from "./advisories";
import { placedOnRadius } from "./radius";
// `vocab.ts` is another agent's file (DESIGN.md §3); these three names are its documented exports.
import { isFlagged, SIGNAL_NAMES, VERDICT_ORDER } from "./vocab";

// -------------------------------------------------------------------------------------------
// Population
// -------------------------------------------------------------------------------------------

function flaggedFindings(model: Model): readonly Finding[] {
  return model.report.findings.filter((f) => isFlagged(f.verdict, model.report.run.flaggedVerdicts));
}

/**
 * The findings a tab draws from, before any filter narrows it (`population()`, `report.js:312-317`).
 * The Run tab describes the run, not its packages, so it (and any view this renderer does not
 * know) has nothing to filter — an empty population, which is also what tells the rail and the
 * search box to hide themselves for that tab.
 */
export function population(model: Model, view: View): readonly Finding[] {
  switch (view) {
    case "findings":
    case "radius":
      return flaggedFindings(model);
    case "advisories":
      return model.report.findings.filter((f) => f.advisories.length > 0);
    case "packages":
      return model.report.findings;
    case "run":
      return [];
  }
}

// -------------------------------------------------------------------------------------------
// The rail's own selections (legacy `matches()` steps 8-14, report.js:223-238)
// -------------------------------------------------------------------------------------------

/**
 * A finding's baseline bucket for the "Since" rail group, or `null` when it has none. Fixes
 * critic.md M19: legacy bucketed a finding with **no** baseline entry at all — every ok/finished/
 * unknown package, since `BaselineComparison` only ever records a status for a flagged finding —
 * under "known" (`baselineState(f) !== "new" && !== "worsened"` is true for `null` too), so
 * "Already accepted" silently counted every healthy package. Here "known" means the baseline
 * itself said so, nothing else does. Exported for `domain/baseline.ts`'s delta line, which counts
 * the same buckets the rail does.
 */
export function sinceBucket(f: Finding): "new" | "worsened" | "known" | null {
  if (f.baseline === null) return null;
  const status = f.baseline.status;
  if (status === "new") return "new";
  if (status === "worsened") return "worsened";
  if (status === "known") return "known";
  return null;
}

function passesRail(filters: Filters, f: Finding): boolean {
  if (filters.sev.length > 0 && !f.advisories.some((advisory) => filters.sev.includes(advisory.severity))) {
    return false;
  }
  if (
    filters.fix.length > 0 &&
    !f.advisories.some((advisory) => filters.fix.includes(fixShapeOf(advisory)))
  ) {
    return false;
  }
  if (filters.prio.length > 0 && !filters.prio.includes(f.priority)) return false;
  if (filters.verdict.length > 0 && !filters.verdict.includes(f.verdict)) return false;
  if (filters.signal.length > 0) {
    const ids = f.signals.map((signal) => signal.id);
    if (!filters.signal.some((id) => ids.includes(id))) return false;
  }
  const since = sinceBucket(f);
  if (filters.since.length > 0 && (since === null || !filters.since.includes(since))) return false;
  // Each scope button is independent and ANDed, so selecting both halves of a pair (direct +
  // transitive, or require + require-dev) together yields nothing — kept as-is (DESIGN.md §5).
  if (filters.scope.includes("direct") && !f.direct) return false;
  if (filters.scope.includes("transitive") && f.direct) return false;
  if (filters.scope.includes("prod") && f.dev) return false;
  if (filters.scope.includes("dev") && !f.dev) return false;
  return true;
}

// -------------------------------------------------------------------------------------------
// Ordering (legacy `viewFindings`'s priority grouping and `SORTS`, report.js:448-478,548-593)
// -------------------------------------------------------------------------------------------

/**
 * The Findings tab groups by priority in the fixed `PRIORITIES` order; the rendered order is
 * simply that grouping, each bucket keeping the relative order its findings arrived in.
 *
 * Legacy iterated only the five known priorities and silently skipped any finding whose priority
 * wasn't one of them (`report.js:466-471`) — which would drop it from the page entirely. DESIGN.md
 * §2's rule that an unknown enum value is "kept and rendered neutrally, never dropped" overrides
 * that for this port: a finding with an unrecognised priority is appended after the five known
 * groups instead of vanishing.
 */
function orderByPriorityGroup(findings: readonly Finding[]): readonly Finding[] {
  const buckets = new Map<Priority, Finding[]>();
  for (const f of findings) {
    const bucket = buckets.get(f.priority);
    if (bucket) bucket.push(f);
    else buckets.set(f.priority, [f]);
  }
  const known = PRIORITIES.flatMap((p) => buckets.get(p) ?? []);
  const knownSet: readonly string[] = PRIORITIES;
  const unknown = [...buckets.keys()]
    .filter((p) => !knownSet.includes(p))
    .flatMap((p) => buckets.get(p) ?? []);
  return [...known, ...unknown];
}

function sortKeyValue(f: Finding, key: SortKey): string | number {
  switch (key) {
    case "package":
      return f.package;
    case "version":
      return f.version;
    case "libyears":
      return f.libyears === null ? -1 : f.libyears;
    case "verdict": {
      const index = VERDICT_ORDER.indexOf(f.verdict);
      return index === -1 ? 99 : index;
    }
    case "priority":
      return (PRIORITIES as readonly string[]).indexOf(f.priority);
    case "reached":
      return (f.direct ? "0" : "1") + (f.dev ? "1" : "0");
    case "signals":
      return -f.signals.length;
    case "data":
      return f.dataDate ?? "";
  }
}

/**
 * The Packages tab's column comparator (`SORTS`, `report.js:548-557`). One deliberate deviation
 * (per this task's brief, not a DESIGN.md-numbered fix): `package` and `version` compare with
 * `localeCompare(..., {numeric:true})` instead of legacy's plain `<`/`>`, so `"2.0.0"` sorts before
 * `"10.0.0"` rather than after it.
 */
function comparePackages(a: Finding, b: Finding, key: SortKey): number {
  if (key === "package") return a.package.localeCompare(b.package, undefined, { numeric: true });
  if (key === "version") return a.version.localeCompare(b.version, undefined, { numeric: true });
  const x = sortKeyValue(a, key);
  const y = sortKeyValue(b, key);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

function sortPackages(findings: readonly Finding[], sort: SortKey, desc: boolean): readonly Finding[] {
  const sign = desc ? -1 : 1;
  return [...findings].sort((a, b) => sign * comparePackages(a, b, sort));
}

/**
 * The findings a tab actually shows, filtered by the query box and the rail, in the order they are
 * rendered: priority-grouped for Findings, sorted for Packages, population order (query-filtered,
 * rail-filtered) for everything else — Radius and Advisories re-derive their own row order from
 * this set (`radius.ts`, and the advisory-row sort in `advisories.ts`), and Run has no population
 * to filter at all.
 */
export function applyFilters(model: Model, state: State, view: View): readonly Finding[] {
  const terms = parseQuery(state.q);
  const filtered = population(model, view).filter(
    (f) => matchesFinding(f, terms) && passesRail(state.filters, f),
  );
  if (view === "findings") return orderByPriorityGroup(filtered);
  if (view === "packages") return sortPackages(filtered, state.sort, state.sortDesc);
  return filtered;
}

/**
 * Whether `pkg` belongs to `state.view`'s own population but the search box or a rail filter keeps
 * it off the list there (PD-DETAIL-4, DESIGN.md §5) — the one fact `DetailHeader`'s "Hidden by the
 * current filters." note and the search status line (`ui/search/SearchBar.tsx`) both read, so
 * neither can say something the other doesn't. False for a package the tab never lists at all (an
 * `ok` package on the Findings tab, say), which is a different fact this does not claim.
 */
export function hiddenByFilters(model: Model, state: State, pkg: string): boolean {
  const inTab = population(model, state.view).some((f) => f.package === pkg);
  if (!inTab) return false;
  return !applyFilters(model, state, state.view).some((f) => f.package === pkg);
}

// -------------------------------------------------------------------------------------------
// The rail itself (legacy `renderRail()`, report.js:319-394)
// -------------------------------------------------------------------------------------------

export interface RailRow {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly on: boolean;
}

export interface RailGroup {
  readonly group: FilterGroup;
  readonly title: string;
  readonly rows: readonly RailRow[];
}

function hasBaseline(model: Model): boolean {
  return model.report.baseline !== null && model.report.findings.some((f) => f.baseline !== null);
}

/**
 * The filters a rail row's count is taken under (PD-RAIL-2, DESIGN.md §5): everything the reader
 * has already chosen — the search box, the ledger's chips, the other rail groups — with this row
 * selected in its own group. A Scope button ANDs with the Scope buttons already on, so it is added
 * to them; every other group ORs its rows, so the row stands in for the group's selection, and the
 * count is the row's own share rather than the group's union.
 */
function facetFilters(filters: Filters, group: FilterGroup, key: string): Filters {
  if (group === "scope") {
    return filters.scope.includes(key) ? filters : { ...filters, scope: [...filters.scope, key] };
  }
  return { ...filters, [group]: [key] };
}

/** What a rail row counts over: the tab's population, with Blast radius narrowed to the flagged
 *  findings that tab has a place for (PD-RAIL-1, radius.ts#placedOnRadius), and the query parsed. */
interface RailScope {
  readonly state: State;
  readonly here: readonly Finding[];
  readonly terms: ReturnType<typeof parseQuery>;
}

function facetCount(scope: RailScope, group: FilterGroup, key: string): number {
  const filters = facetFilters(scope.state.filters, group, key);
  return scope.here.filter((f) => matchesFinding(f, scope.terms) && passesRail(filters, f)).length;
}

/**
 * One group's rows: the count each would list once selected, under every other active filter
 * (PD-RAIL-2). A row that would list nothing is left out unless it is selected — a reader must
 * always be able to turn off what is on — and a group left with no rows is left out whole.
 */
function groupOf(
  scope: RailScope,
  group: FilterGroup,
  title: string,
  rows: readonly (readonly [key: string, label: string])[],
): RailGroup | null {
  const selected = scope.state.filters[group];
  const shown = rows
    .map(([key, label]) => ({ key, label, count: facetCount(scope, group, key), on: selected.includes(key) }))
    .filter((row) => row.count > 0 || row.on);
  return shown.length === 0 ? null : { group, title, rows: shown };
}

const SINCE_ROWS: readonly (readonly [string, string])[] = [
  ["new", "New"],
  ["worsened", "Worsened"],
  ["known", "Already accepted"],
];

const SCOPE_ROWS: readonly (readonly [string, string])[] = [
  ["direct", "Direct"],
  ["transitive", "Transitive"],
  ["prod", "require"],
  ["dev", "require-dev"],
];

/**
 * The rail's own short names for S1–S10 (PD-RAIL-3): the rail is 200–210px wide, and five of the
 * glossary's names ("release predates the target PHP", "no push to the repository", …) broke over
 * two lines there, so the list of checks read as a ragged block. Each button's `title` still gives
 * the full definition (`SIGNAL_DEFS`); an id without an entry here takes its `SIGNAL_NAMES` name.
 */
export const RAIL_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  S1: "marked abandoned",
  S2: "no stable release",
  S3: "repository archived",
  S4: "no recent push",
  S5: "predates target PHP",
  S6: "branch snapshot",
  S7: "pulls in flagged",
  S8: "branch stopped",
  S9: "security advisories",
  S10: "a check did not run",
};

/** `S<n>` sorts by `n` (the M2 fix: numeric id order, so S10 lands after S9 instead of between S1
 *  and S2); any id that isn't `S<digits>` sorts after all of those, alphabetically among itself.
 *  Exported for `domain/rows.ts`'s key-fact pick (PD-ROWS-1), which ties on this same order
 *  instead of restating it. */
export function signalSortKey(id: string): readonly [number, string] {
  const match = /^S(\d+)$/.exec(id);
  const digits = match?.[1];
  return digits !== undefined ? [Number(digits), ""] : [Number.MAX_SAFE_INTEGER, id];
}

function signalLabel(id: string): string {
  return RAIL_SIGNAL_LABELS[id] ?? SIGNAL_NAMES[id] ?? "";
}

/** Every id that fired on the tab's population, whatever else is selected — which rows exist does
 *  not depend on the other filters; only their counts do. A signal id counts a package once,
 *  however many times it fired on it (PD-RAIL-1). */
function signalRows(here: readonly Finding[]): readonly (readonly [string, string])[] {
  const ids = [...new Set(here.flatMap((f) => f.signals.map((signal) => signal.id)))];
  ids.sort((a, b) => {
    const [an, as] = signalSortKey(a);
    const [bn, bs] = signalSortKey(b);
    return an !== bn ? an - bn : as.localeCompare(bs);
  });
  return ids.map((id) => [id, signalLabel(id)]);
}

const FIX_GROUP_TEXT: readonly (readonly [FixShape, string])[] = [
  ["branch", "A release on this branch"],
  ["move", "Moving to another branch"],
  ["none", "No fix listed"],
];

/**
 * PD-RAIL-1: each fix shape counts the packages with at least one advisory of that shape — exactly
 * the packages `passesRail` keeps when the row is selected — not the advisories. Legacy counted
 * advisories (`report.js:376-383`) while filtering packages, so spomky-labs/otphp's two
 * other-branch advisories read "Moving to another branch 2" over a list of one row. A package whose
 * advisories take two shapes counts once under each, as it is listed under either.
 */
function fixRows(here: readonly Finding[]): readonly (readonly [string, string])[] {
  const shapes = new Set(here.flatMap((f) => f.advisories.map(fixShapeOf)));
  return FIX_GROUP_TEXT.filter(([shape]) => shapes.has(shape));
}

/**
 * The rail's groups, in legacy's fixed emission order: Since (only with a baseline), Scope, Signal
 * (only if any signal fired), What the fix costs (only with ≥1 advisory). The ledger's own
 * priority/verdict/severity legends are a different UI surface (`renderLedger()`, not
 * `renderRail()`) and are not part of this list.
 *
 * PD-RAIL-1: every count is the packages the list shows once that row is selected, so on Blast
 * radius only the flagged findings that tab has a place for count — not the flagged direct
 * requirements with no card (radius.ts#placedOnRadius). PD-RAIL-2: "once that row is selected"
 * means with everything else the reader chose still on — legacy counted the whole population
 * whatever else was selected (DESIGN.md M18), so "Direct 20" sat beside a list of 3.
 */
export function railGroups(model: Model, state: State): readonly RailGroup[] {
  const everyone = population(model, state.view);
  const here = state.view === "radius" ? placedOnRadius(model, everyone) : everyone;
  const scope: RailScope = { state, here, terms: parseQuery(state.q) };

  const groups = [
    model.report.baseline !== null && hasBaseline(model)
      ? groupOf(scope, "since", `Since ${model.report.baseline.path}`, SINCE_ROWS)
      : null,
    groupOf(scope, "scope", "Scope", SCOPE_ROWS),
    groupOf(scope, "signal", "Signal", signalRows(here)),
    groupOf(scope, "fix", "What the fix costs", fixRows(here)),
  ];
  return groups.filter((group): group is RailGroup => group !== null);
}

// -------------------------------------------------------------------------------------------
// The active-filters line (PD-RAIL-4)
// -------------------------------------------------------------------------------------------

export interface ActiveFilter {
  readonly group: FilterGroup;
  readonly key: string;
  /** Which kind of filter it is, said before the value ("Scope", "Signal"): "New" or "critical"
   *  alone does not say which of the page's several lists of words it came from. */
  readonly groupLabel: string;
  /** The value, in the words the control that turned it on uses. */
  readonly label: string;
}

const GROUP_LABELS: Readonly<Record<FilterGroup, string>> = {
  prio: "Priority",
  verdict: "Verdict",
  scope: "Scope",
  signal: "Signal",
  sev: "Severity",
  fix: "Fix",
  since: "Since baseline",
};

const SCOPE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(SCOPE_ROWS);
const SINCE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(SINCE_ROWS);
const FIX_LABELS: Readonly<Record<string, string>> = Object.fromEntries(FIX_GROUP_TEXT);

function activeLabel(group: FilterGroup, key: string): string {
  switch (group) {
    case "scope":
      return SCOPE_LABELS[key] ?? key;
    case "signal": {
      const label = signalLabel(key);
      return label === "" ? key : `${key} ${label}`;
    }
    case "fix":
      return FIX_LABELS[key] ?? key;
    case "since":
      return SINCE_LABELS[key] ?? key;
    default:
      return key;
  }
}

/**
 * Every selection that narrows the list, from the rail and the ledger's chips alike, in the order
 * the fragment writes the groups (`FILTER_GROUPS`) and, inside a group, the order they were chosen
 * — what the active-filters line under the search box lists, each removable on its own (PD-RAIL-4).
 * The search box's own text is not one of these: the line adds it itself.
 */
export function activeFilters(filters: Filters): readonly ActiveFilter[] {
  return FILTER_GROUPS.flatMap((group) =>
    filters[group].map((key) => ({
      group,
      key,
      groupLabel: GROUP_LABELS[group],
      label: activeLabel(group, key),
    })),
  );
}
