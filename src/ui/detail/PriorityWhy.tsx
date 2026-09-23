import type { Finding } from "../../model/types";
import { priorityWhy } from "../../domain/priority";
import "./detail.css";

/**
 * "Why this is <priority>": the ladder `priorityWhy` rebuilds, rendered as the step chain legacy
 * drew (`report.js:728-735`). Omitted entirely when the ladder has no steps — a finding whose
 * verdict never entered `PRIORITY_BASE`, or whose priority is already `"none"` (critic.md M30: for
 * every document this renderer reads today, that means every finding this component is ever asked
 * to explain does have steps; the empty case only guards a foreign or hand-built document).
 *
 * The final bold word is `finding.priority` itself, not a recomputation of the last step — legacy
 * never clamped its ladder either, and printing the document's own value here is what critic.md M30
 * asks a port to keep doing.
 */
export function PriorityWhy({ finding }: { finding: Finding }) {
  const steps = priorityWhy(finding);
  if (steps.length === 0) return null;

  return (
    <section className="detail-section">
      <h3>Why this is {finding.priority}</h3>
      <div className="detail-why">
        {steps.map((step, index) => (
          <span key={step.text} className="detail-why-step">
            {index > 0 && (
              <span className="detail-why-arrow" aria-hidden="true">
                →
              </span>
            )}
            {step.text}
          </span>
        ))}
        <b className="detail-why-result">{finding.priority}</b>
      </div>
    </section>
  );
}
