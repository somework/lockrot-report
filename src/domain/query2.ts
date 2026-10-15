/** The search box's grammar on a report-2 document (SPEC §7.9.7): free words, `flag:`, `lead:`,
 *  `verdict:` (`priority:` reads as `verdict:`), `score:` and `direct:`/`dev:`. */

import type { Finding } from "../model/report2";
import { countedFlagIds } from "./countedFlags";

export interface Term2 {
  readonly field: "flag" | "lead" | "verdict" | "score" | "direct" | "dev" | null;
  readonly value: string;
}

const FIELD_PATTERN = /^(flag|lead|verdict|priority|score|direct|dev):(.+)$/i;
const TRUTHY_VALUES = new Set(["yes", "true", "1"]);
const SCORE_PATTERN = /^(>=|<=|>|<|=)?(\d+)$/;

export function parseQuery2(raw: string): Term2[] {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  return trimmed.split(/\s+/).map((part): Term2 => {
    const match = FIELD_PATTERN.exec(part);
    const key = match?.[1]?.toLowerCase();
    const value = match?.[2]?.toLowerCase();
    if (key === undefined || value === undefined) return { field: null, value: part.toLowerCase() };
    if (key === "direct" || key === "dev")
      return { field: key, value: TRUTHY_VALUES.has(value) ? "true" : "false" };
    if (key === "priority") return { field: "verdict", value };
    return { field: key as Term2["field"], value };
  });
}

function valuesOf(terms: readonly Term2[], field: Term2["field"]): readonly string[] {
  return terms.filter((term) => term.field === field).map((term) => term.value);
}

function lastBoolean(terms: readonly Term2[], field: "direct" | "dev"): boolean | null {
  const values = valuesOf(terms, field);
  const last = values[values.length - 1];
  return last === undefined ? null : last === "true";
}

/** A value that is not `[op]N` matches nothing, so a typo empties the list rather than ignoring it. */
function scoreMatches(total: number, value: string): boolean {
  const match = SCORE_PATTERN.exec(value);
  if (match === null) return false;
  const n = Number(match[2]);
  switch (match[1]) {
    case ">=":
      return total >= n;
    case "<=":
      return total <= n;
    case ">":
      return total > n;
    case "<":
      return total < n;
    default:
      return total === n;
  }
}

/** Every field ANDs; repeats widen `verdict:` and `lead:` and narrow `flag:`, which a finding can
 *  carry several of. `flag:` reads the counted flags, as the rail's flag group does. */
export function matchesFinding2(f: Finding, terms: readonly Term2[]): boolean {
  const haystack = `${f.package} ${f.version}`.toLowerCase();
  if (!valuesOf(terms, null).every((word) => haystack.includes(word))) return false;

  const verdicts = valuesOf(terms, "verdict");
  if (verdicts.length > 0 && !verdicts.includes(f.verdict)) return false;

  const leads = valuesOf(terms, "lead");
  if (leads.length > 0 && (f.lead === null || !leads.includes(f.lead))) return false;

  const counted = countedFlagIds(f);
  if (!valuesOf(terms, "flag").every((id) => counted.includes(id))) return false;

  if (!valuesOf(terms, "score").every((value) => scoreMatches(f.score.total, value))) return false;

  const direct = lastBoolean(terms, "direct");
  if (direct !== null && direct !== f.direct) return false;
  const dev = lastBoolean(terms, "dev");
  return dev === null || dev === f.dev;
}
