/**
 * The header's gate fact (PD-SUMMARY-2, PD-BASELINE-5, DESIGN.md §5): the rule the run was given,
 * worded from `run.fail_on`, `run.fail_on_kind`, `run.strict_network`, `run.mode` and the root
 * `gate`, and the count of findings whose own `gate` reaches it. It never says whether the run failed.
 */

import type { Model, RunSettings } from "../model/types";
import { gateTally, type GateTally } from "./baseline";
import { plural } from "./format";
import { failOnThreshold } from "./run";

export interface GateFact {
  readonly label: string;
  readonly text: string;
}

const STRICT = "--strict-network also fails the run when a network lookup fails.";
const HINT =
  "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.";

/** The rule clause after "it": the Run row's words for a known kind, the kind as written otherwise. */
function rule(run: RunSettings): string {
  const threshold = failOnThreshold(run);
  const reach = `fails on findings that reach ${run.failOn ?? ""}`;
  if (run.failOnKind === null || threshold === null) return reach;
  return threshold.startsWith("fails ")
    ? threshold
    : `${reach}, another kind of threshold (${run.failOnKind})`;
}

/** What the tally counts, as a verb phrase agreeing with `n`. `short` is the header's form, beside a
 *  label that already names the value. */
export function reachWords(tally: GateTally, n: number, short = false): string {
  const one = n === 1;
  if (tally.kind === "unchecked") {
    return short ? "carry S10" : `${one ? "carries" : "carry"} a check that did not run (S10)`;
  }
  if (tally.kind === "priority" || tally.kind === "verdict") {
    return short ? "at or above" : `${one ? "is" : "are"} at or above ${tally.failOn}`;
  }
  return short ? "reach it" : `${one ? "reaches" : "reach"} ${tally.failOn}`;
}

/** The popover's count sentence: the same numbers as the tally beside the button, in words. */
function tallySentence(tally: GateTally, path: string): string {
  const reached = `${plural(tally.reached, "finding", "findings")} in this report ${reachWords(tally, tally.reached)}`;
  if (tally.notAccepted === null) return `${reached}.`;
  const verb = tally.notAccepted === 1 ? "is" : "are";
  const outside =
    tally.otherExemptions.length === 0
      ? `not already accepted in ${path}`
      : `neither accepted in ${path} nor exempt for another reason (${tally.otherExemptions.join(", ")})`;
  return `${reached}; ${tally.notAccepted} of them ${verb} ${outside}.`;
}

function judgedText(model: Model, tally: GateTally | null): string {
  const { run, gate, baseline } = model.report;
  const failOn = run.failOn ?? "";
  const strict = run.strictNetwork === true ? ` ${STRICT}` : "";
  const counted = tally === null ? "" : ` ${tallySentence(tally, baseline?.path || "the baseline")}`;
  const caveat = " The page does not record the run's exit code.";
  if (gate?.failOnApplied === false) {
    const as = run.mode === null ? "" : ` as a ${run.mode} run`;
    return `This run was told --fail-on=${failOn}, but${as} it judged no finding against it, so no finding fails it.${strict}${counted}${caveat}`;
  }
  const unless = baseline === null ? "" : ", unless the baseline already accepts the finding";
  return `This run was told --fail-on=${failOn}: it ${rule(run)}${unless}.${strict}${counted}${caveat}`;
}

/** The gate fact's label and popover text, or `null` when the document states no fail-on. */
export function gateFact(model: Model): GateFact | null {
  const { run } = model.report;
  if (run.failOn === null) return null;
  if (run.failOn === "none") {
    const opening = "This run was told --fail-on=none: it fails on no finding";
    return run.strictNetwork === true
      ? {
          label: "gate: strict network",
          text: `${opening}, but --strict-network fails the run when a network lookup fails. This page lists what it saw. ${HINT}`,
        }
      : { label: "no gate", text: `${opening}, and this page lists what it saw. ${HINT}` };
  }
  return { label: `gate: ${run.failOn}`, text: judgedText(model, gateTally(model)) };
}
