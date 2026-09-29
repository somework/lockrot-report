/** Which findings each tab lists, the rail's filters and groups, and each tab's order. The
 *  query-string half of filtering lives in `query.ts`. */

import type { Finding, Model, Priority, View } from "../model/types";
import { PRIORITIES } from "../model/types";
import { FILTER_GROUPS, type Filters, type FilterGroup, type SortKey, type State } from "../state/types";
import { matchesFinding, parseQuery } from "./query";
import { fixShapeOf, type FixShape } from "./advisories";
import { placedOnRadius } from "./radius";
// `vocab.ts` is another agent's file (DESIGN.md §3); these three names are its documented exports.
import { isFlagged, isKnownSignalId, SIGNAL_NAMES, VERDICT_ORDER, vocabTable } from "./vocab";

// -------------------------------------------------------------------------------------------
// Population
// -------------------------------------------------------------------------------------------

function flaggedFindings(model: Model): readonly Finding[] {
  return model.report.findings.filter((f) => isFlagged(f.verdict, model.report.run.flaggedVerdicts));
}

/** The Run tab has no population: the rail and search box hide there. */
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
// The rail's own selections
// -------------------------------------------------------------------------------------------

/** "known" only when the baseline said so: a package with no baseline entry is in no bucket. */
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
  if (filters.gate.includes("fails") && f.gate?.fails !== true) return false;
  // Scope buttons are ANDed, so both halves of a pair select nothing (DESIGN.md §5).
  if (filters.scope.includes("direct") && !f.direct) return false;
  if (filters.scope.includes("transitive") && f.direct) return false;
  if (filters.scope.includes("prod") && f.dev) return false;
  if (filters.scope.includes("dev") && !f.dev) return false;
  return true;
}

// -------------------------------------------------------------------------------------------
// Ordering
// -------------------------------------------------------------------------------------------

/** Grouped in `PRIORITIES` order; an unknown priority is appended after the known groups, never
 *  dropped. */
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

/** `numeric: true`, so "2.0.0" sorts before "10.0.0". */
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

export function applyFilters(model: Model, state: State, view: View): readonly Finding[] {
  const terms = parseQuery(state.q);
  const filtered = population(model, view).filter(
    (f) => matchesFinding(f, terms) && passesRail(state.filters, f),
  );
  if (view === "findings") return orderByPriorityGroup(filtered);
  if (view === "packages") return sortPackages(filtered, state.sort, state.sortDesc);
  return filtered;
}

/** Findings with an advisory whose verdict is `ok` or `finished`, so never on Findings, narrowed by
 *  the same search and rail as the list they are named above. */
export function quietAdvisoryFindings(model: Model, state: State): readonly Finding[] {
  const terms = parseQuery(state.q);
  return model.report.findings.filter(
    (f) =>
      f.advisories.length > 0 &&
      (f.verdict === "ok" || f.verdict === "finished") &&
      matchesFinding(f, terms) &&
      passesRail(state.filters, f),
  );
}

/** In the tab's population but kept off its list by the search or the rail (PD-DETAIL-4); false for
 *  a package the tab never lists. */
export function hiddenByFilters(model: Model, state: State, pkg: string): boolean {
  const inTab = population(model, state.view).some((f) => f.package === pkg);
  if (!inTab) return false;
  return !applyFilters(model, state, state.view).some((f) => f.package === pkg);
}

// -------------------------------------------------------------------------------------------
// The rail itself
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

/** As a click turns it on: ANDed in Scope, ORed in every other group. */
function withRowOn(filters: Filters, group: FilterGroup, key: string): Filters {
  const current = filters[group];
  return current.includes(key) ? filters : { ...filters, [group]: [...current, key] };
}

/** Blast radius counts only the flagged findings it has a place for (PD-RAIL-1). */
interface RailScope {
  readonly state: State;
  readonly here: readonly Finding[];
  readonly terms: ReturnType<typeof parseQuery>;
}

function countUnder(scope: RailScope, filters: Filters): number {
  return scope.here.filter((f) => matchesFinding(f, scope.terms) && passesRail(filters, f)).length;
}

/**
 * The list's length with the row on (PD-RAIL-2): in an ORed group with a selection, the union, so
 * the count is the list a click gives. An off row is shown only when its own share, beside the
 * other filters, lists something.
 */
function rowCount(scope: RailScope, group: FilterGroup, key: string): { count: number; shown: boolean } {
  const filters = scope.state.filters;
  const count = countUnder(scope, withRowOn(filters, group, key));
  if (filters[group].includes(key)) return { count, shown: true };
  const own =
    group === "scope" || filters[group].length === 0
      ? count
      : countUnder(scope, { ...filters, [group]: [key] });
  return { count, shown: own > 0 };
}

/**
 * A row matching nothing is left out unless it is selected, so what is on can always be turned off.
 */
function groupOf(
  scope: RailScope,
  group: FilterGroup,
  title: string,
  rows: readonly (readonly [key: string, label: string])[],
): RailGroup | null {
  const selected = scope.state.filters[group];
  const shown = rows.flatMap(([key, label]) => {
    const { count, shown: visible } = rowCount(scope, group, key);
    return visible ? [{ key, label, count, on: selected.includes(key) }] : [];
  });
  return shown.length === 0 ? null : { group, title, rows: shown };
}

const SINCE_ROWS: readonly (readonly [string, string])[] = [
  ["new", "New"],
  ["worsened", "Worsened"],
  ["known", "Already accepted"],
];

const GATE_ROWS: readonly (readonly [string, string])[] = [["fails", "Fails this run"]];

/** Only a run that failed has findings to list by it. */
function runFails(model: Model): boolean {
  return model.report.gate?.fails === true;
}

/**
 * The filters an address may carry for this report: a `gate` key only when the run failed, and then
 * only `fails`. A link written for a failing run, opened on a passing one, lists every row instead
 * of none with no rail row to turn it off.
 */
export function filtersFor(model: Model, filters: Filters): Filters {
  const gate = runFails(model) ? filters.gate.filter((key) => key === "fails") : [];
  return gate.length === filters.gate.length ? filters : { ...filters, gate };
}

const SCOPE_ROWS: readonly (readonly [string, string])[] = [
  ["direct", "Direct"],
  ["transitive", "Transitive"],
  ["prod", "require"],
  ["dev", "require-dev"],
];

/** Short enough for the rail's width (PD-RAIL-3); the `title` gives the full definition. A
 *  `vocabTable`, so an id such as `toString` finds nothing. */
export const RAIL_SIGNAL_LABELS: Readonly<Record<string, string>> = vocabTable({
  S1: "marked abandoned",
  S2: "no recent release",
  S3: "repository archived",
  S4: "no recent push",
  S5: "predates target PHP",
  S6: "snapshot or untagged",
  S7: "pulls in flagged",
  S8: "branch stopped",
  S9: "security advisories",
  S10: "a check did not run",
});

/**
 * Numeric id order (S10 after S9); anything that is not `S<digits>` sorts after, alphabetically.
 */
export function signalSortKey(id: string): readonly [number, string] {
  const match = /^S(\d+)$/.exec(id);
  const digits = match?.[1];
  return digits !== undefined ? [Number(digits), ""] : [Number.MAX_SAFE_INTEGER, id];
}

function signalLabel(id: string): string {
  return RAIL_SIGNAL_LABELS[id] ?? SIGNAL_NAMES[id] ?? "";
}

/** Every signal id the findings carry, each once, in the rail's order (`signalSortKey`). */
function firedIds(findings: readonly Finding[]): string[] {
  const ids = [...new Set(findings.flatMap((f) => f.signals.map((signal) => signal.id)))];
  return ids.sort((a, b) => {
    const [an, as] = signalSortKey(a);
    const [bn, bs] = signalSortKey(b);
    return an !== bn ? an - bn : as.localeCompare(bs);
  });
}

/** The ids with no name here, in the rail's order, as written. */
export function unknownSignalIds(findings: readonly Finding[]): readonly string[] {
  return firedIds(findings).filter((id) => !isKnownSignalId(id));
}

/** Which rows exist does not depend on other filters, only their counts; an id counts a package
 *  once. */
function signalRows(here: readonly Finding[]): readonly (readonly [string, string])[] {
  return firedIds(here).map((id) => [id, signalLabel(id)]);
}

const FIX_GROUP_TEXT: readonly (readonly [FixShape, string])[] = [
  ["branch", "A release on this branch"],
  ["move", "Moving to another branch"],
  ["none", "No fix listed"],
  ["unchecked", "Fix not checked"],
];

/** Counts packages, not advisories: the packages a selected row keeps (PD-RAIL-1). */
function fixRows(here: readonly Finding[]): readonly (readonly [string, string])[] {
  const shapes = new Set(here.flatMap((f) => f.advisories.map(fixShapeOf)));
  return FIX_GROUP_TEXT.filter(([shape]) => shapes.has(shape));
}

/** Since (with a baseline), This run (when it failed), Scope, Signal (if any fired), fix cost (with an advisory). Every count
 *  is what the list shows once that row is added to everything else selected (PD-RAIL-1/2). */
export function railGroups(model: Model, state: State): readonly RailGroup[] {
  const everyone = population(model, state.view);
  const here = state.view === "radius" ? placedOnRadius(model, everyone) : everyone;
  const scope: RailScope = { state, here, terms: parseQuery(state.q) };

  const groups = [
    model.report.baseline !== null && hasBaseline(model)
      ? groupOf(scope, "since", `Since ${model.report.baseline.path}`, SINCE_ROWS)
      : null,
    runFails(model) ? groupOf(scope, "gate", "This run", GATE_ROWS) : null,
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
  /** "New" or "critical" alone does not say which list of words it came from. */
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
  gate: "This run",
};

const SCOPE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(SCOPE_ROWS);
const SINCE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(SINCE_ROWS);
const FIX_LABELS: Readonly<Record<string, string>> = Object.fromEntries(FIX_GROUP_TEXT);
const GATE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(GATE_ROWS);

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
    case "gate":
      return GATE_LABELS[key] ?? key;
    default:
      return key;
  }
}

/** Every rail and ledger selection, in fragment group order, then the order chosen (PD-RAIL-4); the
 *  search text is not one. */
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
