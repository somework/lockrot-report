/** Which report-2 findings each tab lists, the rail's filters and groups, and each tab's order
 *  (SPEC §7.9.5, §7.9.6, §7.9.7). The search grammar lives in `query2.ts`. */

import type { View } from "../model/types";
import type { Finding, Report2 } from "../model/report2";
import { isSecurityVulnerable } from "../model/report2";
import type { Filters, FilterGroup, SortKey, State } from "../state/types";
import { advisoryRows } from "./advisoryRows";
import { acceptedFlagIds, countedFlagIds } from "./countedFlags";
import { matchesFinding2, parseQuery2, type Term2 } from "./query2";
import type { RailGroup } from "./filters";

type Row = readonly [key: string, label: string];

const byRank = (findings: readonly Finding[]): Finding[] => [...findings].sort((a, b) => a.rank - b.rank);

/** The Run tab has no population: the rail and search box hide there. */
export function population2(report: Report2, view: View): readonly Finding[] {
  const graded: readonly string[] = report.run.graded_verdicts;
  switch (view) {
    case "findings":
    case "radius":
      return report.findings.filter((f) => graded.includes(f.verdict));
    case "advisories":
      return report.findings.filter((f) => isSecurityVulnerable(f.security));
    case "packages":
      return report.findings;
    case "run":
      return [];
  }
}

function passesRail2(filters: Filters, f: Finding): boolean {
  if (filters.verdict.length > 0 && !filters.verdict.includes(f.verdict)) return false;
  if (filters.flag.length > 0 && !countedFlagIds(f).some((id) => filters.flag.includes(id))) return false;
  const rows = advisoryRows(f);
  if (filters.sev.length > 0 && !rows.some((row) => filters.sev.includes(row.severity))) return false;
  if (filters.fix.length > 0 && !rows.some((row) => filters.fix.includes(row.fix.kind))) return false;
  if (filters.signal.length > 0 && !f.signals.some((signal) => filters.signal.includes(signal.id)))
    return false;
  const since = f.baseline?.status;
  if (filters.since.length > 0 && (since === undefined || !filters.since.includes(since))) return false;
  if (filters.gate.includes("fails") && !f.gate.fails) return false;
  // Scope buttons are ANDed, so both halves of a pair select nothing (DESIGN.md §5).
  if (filters.scope.includes("direct") && !f.direct) return false;
  if (filters.scope.includes("transitive") && f.direct) return false;
  if (filters.scope.includes("prod") && f.dev) return false;
  if (filters.scope.includes("dev") && !f.dev) return false;
  return !(filters.scope.includes("unnamed") && f.named_in.length > 0);
}

/** An unmeasured libyears or age takes the lowest place, and an unreached package sorts as the
 *  deepest. */
function sortValue(f: Finding, key: SortKey): string | number {
  switch (key) {
    case "package":
    case "version":
      return f[key];
    case "verdict":
    case "priority":
      return f.rank;
    case "score":
      return f.score.total;
    case "flags":
      return f.flags.length;
    case "libyears":
      return f.libyears ?? -1;
    case "age":
      return f.age.installed?.years ?? -1;
    case "reached":
      return (f.depth ?? Number.MAX_SAFE_INTEGER) * 2 + (f.dev ? 1 : 0);
    case "signals":
      return -f.signals.length;
    case "data":
      return f.data_date ?? "";
  }
}

function compare(a: Finding, b: Finding, key: SortKey): number {
  const x = sortValue(a, key);
  const y = sortValue(b, key);
  if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, undefined, { numeric: true });
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Findings, Advisories and Blast radius keep `rank`; All packages sorts by its column, ties in
 *  `rank` order. */
export function applyFilters2(report: Report2, state: State, view: View): readonly Finding[] {
  const terms = parseQuery2(state.q);
  const kept = byRank(population2(report, view)).filter(
    (f) => matchesFinding2(f, terms) && passesRail2(state.filters, f),
  );
  if (view !== "packages") return kept;
  const sign = state.sortDesc ? -1 : 1;
  return kept.sort((a, b) => sign * compare(a, b, state.sort));
}

/** In the tab's population but kept off its list by the search or the rail (PD-DETAIL-4). */
export function hiddenByFilters2(report: Report2, state: State, pkg: string): boolean {
  if (!population2(report, state.view).some((f) => f.package === pkg)) return false;
  return !applyFilters2(report, state, state.view).some((f) => f.package === pkg);
}

/** The rows each tab draws, top to bottom, for `j`/`k`. Only Findings and All packages have rows. */
export function renderedPackages2(report: Report2, state: State, view: View): readonly string[] {
  if (view !== "findings" && view !== "packages") return [];
  return applyFilters2(report, state, view).map((f) => f.package);
}

// -------------------------------------------------------------------------------------------
// The rail
// -------------------------------------------------------------------------------------------

interface Scope {
  readonly filters: Filters;
  readonly here: readonly Finding[];
  readonly terms: readonly Term2[];
}

function countUnder(scope: Scope, filters: Filters): number {
  return scope.here.filter((f) => matchesFinding2(f, scope.terms) && passesRail2(filters, f)).length;
}

/** The list a click on the row gives: ANDed in Scope, the union in every other group (PD-RAIL-2).
 *  An off row shows only when its own share lists something. */
function groupOf(scope: Scope, group: FilterGroup, title: string, rows: readonly Row[]): RailGroup | null {
  const selected = scope.filters[group];
  const shown = rows.flatMap(([key, label]) => {
    const on = selected.includes(key);
    const count = countUnder(scope, on ? scope.filters : { ...scope.filters, [group]: [...selected, key] });
    const own =
      on || group === "scope" || selected.length === 0
        ? count
        : countUnder(scope, { ...scope.filters, [group]: [key] });
    return on || own > 0 ? [{ key, label, count, on }] : [];
  });
  return shown.length === 0 ? null : { group, title, rows: shown };
}

const SINCE_ROWS: readonly Row[] = [
  ["new", "New"],
  ["worsened", "Worsened"],
  ["known", "Known"],
];
/** The one key of the accepted group: a view toggle that hides the accepted pills (SPEC §7.9.7). */
export const HIDE_ACCEPTED = "hide";
const SCOPE_ROWS: readonly Row[] = [
  ["direct", "Direct"],
  ["transitive", "Transitive"],
  ["prod", "require"],
  ["dev", "require-dev"],
  ["unnamed", "not in composer.json"],
];

function runFails2(report: Report2): boolean {
  return report.gate.fails && report.findings.some((f) => f.gate.fails);
}

/** Filters no package, so its count is the listed rows whose pills it shows or hides. */
function acceptedToggle(scope: Scope): RailGroup {
  const listed = countUnder(
    { ...scope, here: scope.here.filter((f) => acceptedFlagIds(f).length > 0) },
    scope.filters,
  );
  const on = scope.filters.accepted.includes(HIDE_ACCEPTED);
  return {
    group: "accepted",
    title: "Accepted flags",
    rows: [{ key: HIDE_ACCEPTED, label: "Hide accepted flags", count: listed, on }],
  };
}

/** Since, This run, Flag, Accepted flags and Scope, each where it has a row. */
export function railGroups2(report: Report2, state: State): readonly RailGroup[] {
  const here = population2(report, state.view);
  const scope: Scope = { filters: state.filters, here, terms: parseQuery2(state.q) };
  const baseline = report.baseline;
  const groups = [
    baseline !== null && here.some((f) => f.baseline !== null)
      ? groupOf(scope, "since", `Since ${baseline.path}`, SINCE_ROWS)
      : null,
    runFails2(report) ? groupOf(scope, "gate", "This run", [["fails", "Fails this run"]]) : null,
    groupOf(
      scope,
      "flag",
      "Flag",
      report.run.flag_ids.map((id): Row => [id, id]),
    ),
    here.some((f) => acceptedFlagIds(f).length > 0) ? acceptedToggle(scope) : null,
    groupOf(scope, "scope", "Scope", SCOPE_ROWS),
  ];
  return groups.filter((group): group is RailGroup => group !== null);
}

// -------------------------------------------------------------------------------------------
// The address
// -------------------------------------------------------------------------------------------

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

/**
 * The filters a report-2 address may carry. A 0.13 link opens on report-2 terms (SPEC §7.9.7):
 * `prio=` as `verdict=`, and a flag named in `verdict=` as `flag=`. A `gate` key stays only when
 * some package fails the run, and `accepted` keeps only its toggle. Returns `filters` itself when
 * nothing changes.
 */
export function fitFilters2(report: Report2, filters: Filters): Filters {
  const flagIds: readonly string[] = report.run.flag_ids;
  const named = filters.verdict.filter((key) => flagIds.includes(key));
  const gate = runFails2(report) ? filters.gate.filter((key) => key === "fails") : [];
  const accepted = filters.accepted.filter((key) => key === HIDE_ACCEPTED);
  if (
    filters.prio.length === 0 &&
    named.length === 0 &&
    gate.length === filters.gate.length &&
    accepted.length === filters.accepted.length
  )
    return filters;
  return {
    ...filters,
    accepted,
    prio: [],
    verdict: union(
      filters.verdict.filter((key) => !flagIds.includes(key)),
      filters.prio,
    ),
    flag: union(filters.flag, named),
    gate,
  };
}
