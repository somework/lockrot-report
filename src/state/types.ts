import type { View } from "../model/types";

/**
 * The filter groups, in the order the fragment writes them. The order is part of the address format
 * users share (DESIGN.md §4), so it is fixed here and everything else derives from it.
 */
export const FILTER_GROUPS = [
  "prio",
  "verdict",
  "scope",
  "signal",
  "sev",
  "fix",
  "since",
  "gate",
  "flag",
  "accepted",
] as const;
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
  "score",
  "flags",
  "age",
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
  /**
   * What the reader opened or closed on the Blast radius tab (a row's packages, a fold), by key
   * (`domain/radius.ts#rowKey`). Like `sort`, not part of the fragment, whose format does not change
   * (DESIGN.md §4): a key never touched takes its default, which follows `pkg` — a link naming a
   * package opens the row and fold that list it (PD-RADIUS-3).
   */
  disclosure: Readonly<Record<string, boolean>>;
  /** The package open when the reader last changed tab: the Run tab's score example (SPEC §7.9.12).
   *  Not part of the fragment. */
  example: string | null;
  /** The id of a Run data section that the page opens at, as the fragment's `section` key holds it
   *  (SPEC §7.9.16). Null on every other view. */
  section: string | null;
}

/** Where a chart mark on Overview leads: a tab and the fragment keys it sets, nothing else. */
export interface LinkTarget {
  view: View;
  filters?: Partial<Filters>;
  q?: string;
  pkg?: string;
  /** The id of a Run data section that the link opens at. */
  section?: string;
}

export type Action =
  | { type: "view"; view: View; keepDetail?: boolean }
  | { type: "query"; q: string }
  | { type: "toggle"; group: FilterGroup; key: string }
  | { type: "clear" }
  /** A tab (Findings unless named) listed through exactly these rail filters; the query box set to
   *  `q`, else kept with `keepQuery`, else emptied; `pkg` open, else no detail. `section`: the id
   *  that the tab opens at, in place of its list. */
  | {
      type: "focus";
      filters: Filters;
      view?: View;
      keepQuery?: boolean;
      q?: string;
      pkg?: string;
      section?: string;
    }
  | { type: "sort"; key: SortKey }
  | { type: "select"; pkg: string | null }
  | { type: "disclose"; key: string; open: boolean }
  | { type: "restore"; state: State };

export const EMPTY_FILTERS: Filters = {
  prio: [],
  verdict: [],
  scope: [],
  signal: [],
  sev: [],
  fix: [],
  since: [],
  gate: [],
  flag: [],
  accepted: [],
};

/** The state an empty fragment opens: Overview, nothing filtered, nothing open. */
export const INITIAL_STATE: State = {
  view: "overview",
  q: "",
  pkg: null,
  sort: "verdict",
  sortDesc: false,
  filters: EMPTY_FILTERS,
  disclosure: {},
  example: null,
  section: null,
};
