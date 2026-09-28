/**
 * The baseline surfaces' arithmetic (PD-BASELINE-1..6, DESIGN.md §5): counts over what the report
 * records — `report.baseline`, each finding's `baseline` state and `gate` — and nothing else. Which
 * findings reach `run.fail_on` is each finding's own `gate.reaches_fail_on`, never the page's rank.
 */

import type { Finding, Model, Verdict } from "../model/types";
import { PRIORITIES } from "../model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type Filters } from "../state/types";
import { applyFilters, population, sinceBucket } from "./filters";
import { VERDICT_ORDER } from "./vocab";

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

// -------------------------------------------------------------------------------------------
// The gate tally
// -------------------------------------------------------------------------------------------

function reachesFailOn(f: Finding): boolean {
  return f.gate?.reachesFailOn === true;
}

function exemptByBaseline(f: Finding): boolean {
  return f.gate?.exemptBy === "baseline";
}

function notExempt(f: Finding): boolean {
  return reachesFailOn(f) && (f.gate?.exemptBy ?? null) === null;
}

export interface GateTally {
  readonly failOn: string;
  /** `run.fail_on_kind` as written; null where the document does not say. */
  readonly kind: string | null;
  /** Findings whose gate says they reach `failOn`, whatever the baseline says about them. */
  readonly reached: number;
  /** Of those, the ones nothing exempts; `null` when the run carried no baseline. */
  readonly notAccepted: number | null;
  /** Each exemption other than the baseline among those reaching, once, as written. */
  readonly otherExemptions: readonly string[];
}

/** The header's descriptive tally beside the gate fact, or `null` when no gate field states it. */
export function gateTally(model: Model): GateTally | null {
  const { run, gate, baseline } = model.report;
  if (run.failOn === null || run.failOn === "none" || gate === null) return null;
  const reached = model.report.findings.filter(reachesFailOn);
  const exemptions = reached.map((f) => f.gate?.exemptBy ?? "baseline").filter((by) => by !== "baseline");
  return {
    failOn: run.failOn,
    kind: run.failOnKind,
    reached: reached.length,
    notAccepted: baseline === null ? null : reached.filter(notExempt).length,
    otherExemptions: [...new Set(exemptions)],
  };
}

/** `keys` in `order`, each once, keeping only the ones present. */
function inOrder(order: readonly string[], keys: readonly string[]): readonly string[] {
  return order.filter((key) => keys.includes(key));
}

/** The rail group that stands for a kind of threshold, over the findings in `set`. */
function levelFilters(kind: string | null, set: readonly Finding[]): Partial<Filters> | null {
  switch (kind) {
    case "unchecked":
      return { signal: ["S10"] };
    case "priority":
      return {
        prio: inOrder(
          PRIORITIES,
          set.map((f) => f.priority),
        ),
      };
    case "verdict":
      return {
        verdict: inOrder(
          VERDICT_ORDER,
          set.map((f) => f.verdict),
        ),
      };
    default:
      return null;
  }
}

/**
 * The rail filters that list exactly the tally's `notAccepted` findings on the Findings tab — the
 * Since buckets they sit in, ANDed with the rail group the threshold's kind stands for — or `null`
 * when no combination of the rail's own groups lists that set and nothing else. Checked, not assumed:
 * the filters are run over the Findings population and must return the same findings, so the header
 * never offers a link whose list disagrees with the count it is drawn on.
 */
export function gateFocus(model: Model): Filters | null {
  const tally = gateTally(model);
  if (tally === null || tally.notAccepted === null) return null;
  const set = model.report.findings.filter(notExempt);
  if (set.length === 0) return null;

  const buckets = set.map(sinceBucket);
  if (buckets.some((bucket) => bucket === null)) return null;
  const since = inOrder(
    ["new", "worsened"],
    buckets.filter((b): b is "new" | "worsened" => b !== null),
  );
  const level = levelFilters(tally.kind, set);
  if (level === null) return null;
  const filters: Filters = { ...EMPTY_FILTERS, ...level, since };

  const listed = applyFilters(model, { ...INITIAL_STATE, filters }, "findings");
  const same = listed.length === set.length && listed.every((f) => set.includes(f));
  return same ? filters : null;
}

/**
 * What a finding's own gate says about this run: the baseline exempts it, or it fails the run.
 * Null for everything else — no gate, not reaching, an exemption this page does not know, or a run
 * that applies no fail-on (`fails` false with nothing exempting it).
 */
export function gateOutcome(finding: Finding): "accepted" | "fails" | null {
  if (exemptByBaseline(finding)) return "accepted";
  return finding.gate?.fails === true ? "fails" : null;
}
