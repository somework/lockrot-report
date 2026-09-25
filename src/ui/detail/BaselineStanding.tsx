import type { ComponentChildren } from "preact";
import type { Finding } from "../../model/types";
import { baselineStep, type BaselineStep } from "../../domain/baseline";
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

/**
 * The step in words. Only what the document records: which file, which verdict it accepted, which
 * verdict the run found. For an accepted package with a gate on the run, lockrot's own documented
 * counting rule — `--fail-on` counts only what the baseline does not accept — and never what the
 * build did, which the document does not say (the header's gate popover ends on the same caveat).
 */
function sentence(step: BaselineStep, path: string, gated: boolean): ComponentChildren {
  if (step.status === "new") {
    return `Not in ${path}: new since it was written.`;
  }
  if (step.status === "worsened") {
    // The pills and the status word above already say it got worse; the sentence says what moved.
    return step.previous === null ? (
      <>
        {path} accepted a milder verdict; it is <span className="mono">{step.current}</span> now.
      </>
    ) : (
      <>
        {path} accepted it as <span className="mono">{step.previous}</span>; it is{" "}
        <span className="mono">{step.current}</span> now.
      </>
    );
  }
  if (step.status === "known") {
    const accepted =
      step.previous === null ? (
        <>Already accepted in {path}.</>
      ) : (
        <>
          Already accepted in {path} as <span className="mono">{step.previous}</span>.
        </>
      );
    return gated ? (
      <>
        {accepted} lockrot&apos;s <span className="mono">--fail-on</span> does not count it.
      </>
    ) : (
      accepted
    );
  }
  // A status this renderer does not know (a newer lockrot's): stated as written, nothing inferred.
  return (
    <>
      {path} says <span className="mono">{step.status}</span>.
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
  const failOn = model.report.run.failOn;
  const gated = failOn !== null && failOn !== "none";
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
      <p className="detail-baseline">{sentence(step, path, gated)}</p>
    </section>
  );
}
