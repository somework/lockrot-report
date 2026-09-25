import type { View } from "../model/types";

/**
 * The filter groups, in the order the fragment writes them. The order is part of the address format
 * users share (DESIGN.md §4), so it is fixed here and everything else derives from it.
 */
export const FILTER_GROUPS = ["prio", "verdict", "scope", "signal", "sev", "fix", "since"] as const;
export type FilterGroup = (typeof FILTER_GROUPS)[number];

/** Selected keys per group, in the order they were selected (the fragment keeps that order). */
export type Filters = Readonly<Record<FilterGroup, readonly string[]>>;

/** The All packages table's columns, in display order. Sorting is not part of the fragment. */
export const SORT_KEYS = [
  "package",
  "version",
  "libyears",
  "verdict",
  "priority",
  "reached",
  "signals",
  "data",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface State {
  view: View;
  /** The search box as typed. `query.ts` trims and parses it; an all-whitespace query is no filter. */
  q: string;
  /**
   * The package whose detail is open, or null. Only the reader opens one (a click, Enter, `j`/`k`)
   * or the address names one; the page never picks a package by itself (PD-ROWS-9, DESIGN.md §5).
   */
  pkg: string | null;
  sort: SortKey;
  sortDesc: boolean;
  filters: Filters;
}

export type Action =
  | { type: "view"; view: View; keepDetail?: boolean }
  | { type: "query"; q: string }
  | { type: "toggle"; group: FilterGroup; key: string }
  | { type: "clear" }
  | { type: "sort"; key: SortKey }
  | { type: "select"; pkg: string | null }
  | { type: "restore"; state: State };

export const EMPTY_FILTERS: Filters = {
  prio: [],
  verdict: [],
  scope: [],
  signal: [],
  sev: [],
  fix: [],
  since: [],
};

export const INITIAL_STATE: State = {
  view: "findings",
  q: "",
  pkg: null,
  sort: "verdict",
  sortDesc: false,
  filters: EMPTY_FILTERS,
};
