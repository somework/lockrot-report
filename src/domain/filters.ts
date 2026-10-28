/** The rail's row shape, the signal ids' order, and the active-filters line (PD-RAIL-4). Which
 *  findings each tab lists lives in `list.ts`. */

import { FILTER_GROUPS, type Filters, type FilterGroup } from "../state/types";
import { fixLabel, signalName } from "./pageVocabulary";

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

export interface ActiveFilter {
  readonly group: FilterGroup;
  readonly key: string;
  /** "New" or "critical" alone does not say which list of words it came from. */
  readonly groupLabel: string;
  /** The value, in the words the control that turned it on uses. */
  readonly label: string;
}

/** The rail titles without their dynamic parts: no " (packages)" unit and no baseline path. */
const GROUP_LABELS: Readonly<Record<FilterGroup, string>> = {
  prio: "Priority",
  verdict: "Grade",
  scope: "Scope",
  signal: "Signal",
  sev: "Severity",
  fix: "Fix",
  since: "Since baseline",
  gate: "This run",
  flag: "Flag",
  accepted: "Accepted flags",
};

/** A rail row: the fragment key, then the words the row and its chip print. */
export type Row = readonly [key: string, label: string];

export const SCOPE_ROWS: readonly Row[] = [
  ["direct", "Direct"],
  ["transitive", "Transitive"],
  ["prod", "require"],
  ["dev", "require-dev"],
  ["unnamed", "not in composer.json"],
];
export const SINCE_ROWS: readonly Row[] = [
  ["new", "New"],
  ["worsened", "Worsened"],
  ["known", "Known"],
];
/** The This run key of accepted derivation 10. */
export const READY_KEY = "ready";
/** The This run key of the held filter (`isHeld`). */
export const HELD_KEY = "held";
/** The This run key of the findings that need another way out (`needsAnotherWayOut`). */
export const WAY_OUT_KEY = "wayout";
export const FAILS_ROW: Row = ["fails", "Fails this run"];
export const READY_ROW: Row = [READY_KEY, "Ready to run"];
export const HELD_ROW: Row = [HELD_KEY, "Held"];
export const WAY_OUT_ROW: Row = [WAY_OUT_KEY, "Another way out"];
const GATE_ROWS: readonly Row[] = [FAILS_ROW, READY_ROW, HELD_ROW, WAY_OUT_ROW];

const rowLabel = (rows: readonly Row[], key: string): string => rows.find(([id]) => id === key)?.[1] ?? key;

function activeLabel(group: FilterGroup, key: string): string {
  switch (group) {
    case "scope":
      return rowLabel(SCOPE_ROWS, key);
    case "signal": {
      const name = signalName(key);
      return name === key ? key : `${key} ${name}`;
    }
    case "since":
      return rowLabel(SINCE_ROWS, key);
    case "gate":
      return rowLabel(GATE_ROWS, key);
    case "fix":
      return fixLabel(key);
    default:
      return key;
  }
}

/** Every rail and ledger selection, in fragment group order, then the order chosen (PD-RAIL-4); the
 *  search text is not one, nor the accepted toggle, which narrows no list. */
export function activeFilters(filters: Filters): readonly ActiveFilter[] {
  return FILTER_GROUPS.filter((group) => group !== "accepted").flatMap((group) =>
    filters[group].map((key) => ({
      group,
      key,
      groupLabel: GROUP_LABELS[group],
      label: activeLabel(group, key),
    })),
  );
}
