/**
 * The baseline surfaces' arithmetic (PD-BASELINE-1..4, DESIGN.md §5): counts over what the report
 * already records — `report.baseline`, each finding's `baseline` state and `run.fail_on` — and
 * nothing else. No judgement is made here that lockrot did not already make: a finding's status
 * (new, worsened, known) and the verdict the baseline accepted it at are lockrot's own, read as
 * given; the gate tally only counts findings against lockrot's documented `--fail-on` order
 * (`FailOn::reaches()` in lockrot), and never says whether the run passed or failed.
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

/** lockrot's `FailOn::UNCHECKED`: a threshold met by any finding carrying S10. */
const UNCHECKED = "unchecked";

function verdictReaches(verdict: Verdict, threshold: Verdict): boolean {
  const at = VERDICT_ORDER.indexOf(verdict);
  return at !== -1 && at <= VERDICT_ORDER.indexOf(threshold);
}

function priorityReaches(priority: string, threshold: string): boolean {
  const order: readonly string[] = PRIORITIES;
  const at = order.indexOf(priority);
  // `none` is a priority but no threshold; a priority this renderer does not know reaches nothing.
  return at !== -1 && priority !== "none" && at <= order.indexOf(threshold);
}

/**
 * How `failOn` reads one finding, or `null` when `failOn` is `none` or a value this renderer does
 * not know (a newer lockrot's) — then the page counts nothing rather than guess at its order.
 */
function reachesFn(failOn: string): ((f: Finding) => boolean) | null {
  if (failOn === UNCHECKED) return (f) => f.signals.some((signal) => signal.id === "S10");
  if (failOn !== "none" && (PRIORITIES as readonly string[]).includes(failOn)) {
    return (f) => priorityReaches(f.priority, failOn);
  }
  if (VERDICT_ORDER.includes(failOn) && failOn !== "unknown") {
    return (f) => verdictReaches(f.verdict, failOn);
  }
  return null;
}

export interface GateTally {
  readonly failOn: string;
  /** Findings at or above `failOn`, whatever the baseline says about them. */
  readonly reached: number;
  /**
   * Of those, the ones the baseline does not already accept (new, worsened, or no entry) — the set
   * lockrot measures `--fail-on` against when a baseline is present. `null` when the run carried
   * no baseline, or the findings carry no per-finding state to count it from.
   */
  readonly notAccepted: number | null;
}

/** The header's descriptive tally beside the gate fact, or `null` when there is nothing to count. */
export function gateTally(model: Model): GateTally | null {
  const failOn = model.report.run.failOn;
  if (failOn === null) return null;
  const reaches = reachesFn(failOn);
  if (reaches === null) return null;
  const reached = model.report.findings.filter(reaches);
  const counted = model.report.baseline !== null && findingsCarryBaseline(model);
  return {
    failOn,
    reached: reached.length,
    notAccepted: counted ? reached.filter((f) => f.baseline?.status !== "known").length : null,
  };
}

/** `keys` in `order`, each once, keeping only the ones present. */
function inOrder(order: readonly string[], keys: readonly string[]): readonly string[] {
  return order.filter((key) => keys.includes(key));
}

/**
 * The rail filters that list exactly the tally's `notAccepted` findings on the Findings tab — the
 * Since buckets they sit in, ANDed with the priorities (or verdicts, or S10) that reach `failOn` —
 * or `null` when no combination of the rail's own groups lists that set and nothing else. Checked,
 * not assumed: the filters are run over the Findings population and must return the same findings,
 * so the header never offers a link whose list disagrees with the count it is drawn on. Filters
 * only; nothing here ranks, advises or says what the run's exit code was.
 */
export function gateFocus(model: Model): Filters | null {
  const failOn = model.report.run.failOn;
  const reaches = failOn === null ? null : reachesFn(failOn);
  if (failOn === null || reaches === null || model.report.baseline === null) return null;
  // The same set `gateTally` counts as `notAccepted` — a finding with no state included — so a
  // finding the Since filter cannot select makes this null below rather than silently dropping out.
  const set = model.report.findings.filter((f) => reaches(f) && f.baseline?.status !== "known");
  if (set.length === 0) return null;

  const buckets = set.map(sinceBucket);
  if (buckets.some((bucket) => bucket === null)) return null;
  const since = inOrder(
    ["new", "worsened"],
    buckets.filter((b): b is "new" | "worsened" => b !== null),
  );
  const level: Partial<Filters> =
    failOn === UNCHECKED
      ? { signal: ["S10"] }
      : (PRIORITIES as readonly string[]).includes(failOn)
        ? {
            prio: inOrder(
              PRIORITIES,
              set.map((f) => f.priority),
            ),
          }
        : {
            verdict: inOrder(
              VERDICT_ORDER,
              set.map((f) => f.verdict),
            ),
          };
  const filters: Filters = { ...EMPTY_FILTERS, ...level, since };

  const listed = applyFilters(model, { ...INITIAL_STATE, filters }, "findings");
  const same = listed.length === set.length && listed.every((f) => set.includes(f));
  return same ? filters : null;
}
