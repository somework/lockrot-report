/** The rail's row shape, the signal ids' order, and the active-filters line (PD-RAIL-4). Which
 *  findings each tab lists lives in `list.ts`. */

import { FILTER_GROUPS, type Filters, type FilterGroup } from "../state/types";
import { SIGNAL_NAMES, vocabTable } from "./vocab";

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

/** Short enough for the rail's width (PD-RAIL-3). A `vocabTable`, so an id such as `toString`
 *  finds nothing. */
const RAIL_SIGNAL_LABELS: Readonly<Record<string, string>> = vocabTable({
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

function signalLabel(id: string): string {
  return RAIL_SIGNAL_LABELS[id] ?? SIGNAL_NAMES[id] ?? "";
}

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
  flag: "Flag",
  accepted: "Accepted flags",
};

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  direct: "Direct",
  transitive: "Transitive",
  prod: "require",
  dev: "require-dev",
  unnamed: "not in composer.json",
};
const SINCE_LABELS: Readonly<Record<string, string>> = {
  new: "New",
  worsened: "Worsened",
  known: "Known",
};

function activeLabel(group: FilterGroup, key: string): string {
  switch (group) {
    case "scope":
      return SCOPE_LABELS[key] ?? key;
    case "signal": {
      const label = signalLabel(key);
      return label === "" ? key : `${key} ${label}`;
    }
    case "since":
      return SINCE_LABELS[key] ?? key;
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
