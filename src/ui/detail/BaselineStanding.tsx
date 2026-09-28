import type { ComponentChildren } from "preact";
import type { Finding } from "../../model/types";
import { baselineStep, gateOutcome, type BaselineStep } from "../../domain/baseline";
import { Pill } from "../common/common";
import { useReport } from "../context";
import "../views/baseline.css";

/** The step drawn: the verdict the baseline accepted (or "no entry"), an arrow, the verdict now,
 *  then the status in lockrot's own word ("accepted" for its `known`). The sentence under it
 *  carries the same facts in words, so the drawing is `aria-hidden` rather than read twice. */
function Step({ step }: { step: BaselineStep }) {
  const quiet = step.status === "known";
  return (
    <div className="bl-step" aria-hidden="true">
      {step.previous === null ? <span className="bl-none">no entry</span> : <Pill word={step.previous} />}
      <span className="bl-arrow">→</span>
      <Pill word={step.current} />
      <span className={quiet ? "bl-state bl-state-quiet" : "bl-state"}>
        {step.status === "known" ? "accepted" : step.status}
      </span>
    </div>
  );
}

/** What the finding's own gate says about this run beyond the baseline: it fails, or another
 *  exemption, shown as written, keeps it from failing. */
function gateWords(finding: Finding): ComponentChildren {
  const outcome = gateOutcome(finding);
  if (outcome === "fails") return " It fails this run.";
  if (outcome !== "exempt") return null;
  return (
    <>
      {" "}
      Exempt for another reason (<code className="mono">{finding.gate?.exemptBy}</code>), so it does not fail
      this run.
    </>
  );
}

/** The step in words, and what the finding's own gate says about this run — nothing when it says
 *  nothing, since the page does not read an outcome off the baseline status. */
function sentence(step: BaselineStep, path: string, finding: Finding): ComponentChildren {
  const outcome = gateOutcome(finding);
  const gate = gateWords(finding);
  if (step.status === "new") {
    return (
      <>
        Not in {path}: new since it was written.{gate}
      </>
    );
  }
  if (step.status === "worsened") {
    // The pills and the status word above already say it got worse; the sentence says what moved.
    return step.previous === null ? (
      <>
        {path} accepted a milder verdict; it is <span className="mono">{step.current}</span> now.{gate}
      </>
    ) : (
      <>
        {path} accepted it as <span className="mono">{step.previous}</span>; it is{" "}
        <span className="mono">{step.current}</span> now.{gate}
      </>
    );
  }
  const accepted = outcome === "accepted" ? ", so it does not fail this run." : ".";
  if (step.status === "known") {
    return step.previous === null ? (
      <>
        Already accepted in {path}
        {accepted}
        {gate}
      </>
    ) : (
      <>
        Already accepted in {path} as <span className="mono">{step.previous}</span>
        {accepted}
        {gate}
      </>
    );
  }
  // A status this renderer does not know (a newer lockrot's): stated as written.
  return (
    <>
      {path} says <span className="mono">{step.status}</span>.
      {outcome === "accepted" && " Accepted by the baseline, so it does not fail this run."}
      {gate}
    </>
  );
}

/**
 * "Against the baseline" (PD-BASELINE-3, DESIGN.md §5): the first section under the answer, since
 * a reviewer with a baseline opens a package to see whether it is theirs to deal with — ported from
 * legacy's `bstate` branch (`report.js:798-803`), with the step itself drawn as previous → current.
 * Omitted entirely for a finding the baseline says nothing about.
 */
export function BaselineStanding({ finding }: { finding: Finding }) {
  const { model } = useReport();
  const step = baselineStep(finding);
  if (step === null) return null;
  const path = model.report.baseline?.path || "the baseline";
  // Drawn only when something moved: an accepted package still at the verdict it was accepted at
  // (most of them, on a run with a baseline) gets the sentence alone, so two identical pills never
  // sit above the priority reasoning of every package the baseline already covers.
  const moved =
    step.status === "new" ||
    step.status === "worsened" ||
    (step.status === "known" && step.previous !== null && step.previous !== step.current);

  return (
    <section className="detail-section">
      <h3>Against the baseline</h3>
      {moved && <Step step={step} />}
      <p className="detail-baseline">{sentence(step, path, finding)}</p>
    </section>
  );
}
