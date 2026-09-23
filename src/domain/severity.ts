/**
 * Advisory severity normalisation (DESIGN.md §5 M1). Advisory feeds write severity as free text —
 * lockrot passes it through as `Advisory.severityRaw` unchanged — and legacy compared that raw
 * string against a four-value vocabulary, so anything spelled differently (`"Moderate"`, `"HIGH"`,
 * a feed's own `"moderate"` tier) fell through every bucket, every filter and the ledger's sev
 * legend at once (critic.md M1). Normalising once, here, is what lets the rest of the code treat
 * severity as one closed vocabulary instead of re-guessing the mapping at every read site.
 */

import { SEVERITIES, type Severity } from "../model/types";

/** The named severity buckets, ranked worst first; `unrated` is last on purpose (critic.md C1: the
 *  legacy sort put anything it didn't recognise first, by an accidental `indexOf === -1`). */
export const SEVERITY_ORDER: readonly Severity[] = SEVERITIES;

/**
 * Case-insensitive; `"moderate"` folds into `"medium"` (the tier name some advisory feeds use
 * instead of lockrot's four), and everything else — including a missing severity — becomes
 * `"unrated"` rather than being dropped.
 */
export function normalizeSeverity(raw: string | null): Severity {
  if (raw === null) return "unrated";
  switch (raw.toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "moderate":
      return "medium";
    case "low":
      return "low";
    default:
      return "unrated";
  }
}

/**
 * A normalised severity's position in SEVERITY_ORDER, for sorting. Every `Severity` value is one
 * of SEVERITY_ORDER's members by construction, so the `-1` branch is unreachable for a value that
 * actually has type `Severity`; it exists only so a defensive caller never gets `-1` back.
 */
export function severityRank(severity: Severity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}
