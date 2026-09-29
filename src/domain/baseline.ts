/**
 * The baseline surfaces' arithmetic (PD-BASELINE-1..4, DESIGN.md §5): counts over what the report
 * records — `report.baseline` and each finding's `baseline` state — and nothing else.
 */

import type { Finding, Model, Verdict } from "../model/types";
import { population, sinceBucket } from "./filters";

/** The Findings tab's delta line: how the flagged list stands against the baseline file. */
export interface BaselineDelta {
  readonly path: string;
  readonly new: number;
  readonly worsened: number;
  readonly known: number;
  /** Baseline entries whose package is no longer in the lock (lockrot's `stale`), in its order. */
  readonly gone: readonly string[];
  /**
   * Whether the findings carry their own baseline state, so each count is also a filter over the
   * list below it. A document with only the summary block gives counts nobody can filter by.
   */
  readonly filterable: boolean;
}

/** True when at least one finding carries lockrot's per-finding baseline state. */
export function findingsCarryBaseline(model: Model): boolean {
  return model.report.findings.some((f) => f.baseline !== null);
}

/**
 * The delta line's numbers, or `null` when the run compared nothing against a baseline. With
 * per-finding state they are counted over the Findings tab's own population, the same set the
 * "Since" rail group counts, so a count and the list it filters to never disagree; without it they
 * are the summary block's, as lockrot wrote them.
 */
export function baselineDelta(model: Model): BaselineDelta | null {
  const summary = model.report.baseline;
  if (summary === null) return null;
  const filterable = findingsCarryBaseline(model);
  if (!filterable) {
    return {
      path: summary.path,
      new: summary.new,
      worsened: summary.worsened,
      known: summary.known,
      gone: summary.stale,
      filterable,
    };
  }
  const counts = { new: 0, worsened: 0, known: 0 };
  for (const f of population(model, "findings")) {
    const bucket = sinceBucket(f);
    if (bucket !== null) counts[bucket] += 1;
  }
  return { path: summary.path, ...counts, gone: summary.stale, filterable };
}

/** A finding's standing against the baseline, as the detail states it: what the baseline accepted
 *  (null for a finding it has no entry for) and what the run found now. */
export interface BaselineStep {
  readonly status: "new" | "worsened" | "known" | (string & {});
  readonly previous: Verdict | null;
  readonly current: Verdict;
}

export function baselineStep(finding: Finding): BaselineStep | null {
  const baseline = finding.baseline;
  if (baseline === null) return null;
  return { status: baseline.status, previous: baseline.previousVerdict, current: finding.verdict };
}

/**
 * What a finding's own gate says about this run: the baseline exempts it, another exemption does
 * (`exempt_by` as written, which the caller shows), or it fails the run. Null for everything else —
 * no gate, not reaching, or a run that applies no fail-on (`fails` false with nothing exempting it).
 */
export function gateOutcome(finding: Finding): "accepted" | "exempt" | "fails" | null {
  if (finding.gate?.exemptBy === "baseline") return "accepted";
  if ((finding.gate?.exemptBy ?? null) !== null) return "exempt";
  return finding.gate?.fails === true ? "fails" : null;
}
