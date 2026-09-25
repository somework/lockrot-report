import type { Finding } from "../../model/types";
import { priorityWhy } from "../../domain/priority";
import { toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import "./detail.css";

/**
 * "Why this is <priority>": the ladder `priorityWhy` rebuilds, as the plain sentences it now
 * returns — a first-time-reader walk found the old rendering (a mono, bordered chip per step,
 * chained by arrows) read as "a code-style chip, then the word critical", explaining nothing to a
 * reader (`domain/priority.ts`'s own comment has the finding). Omitted entirely when the ladder has
 * no steps — a finding whose verdict never entered `PRIORITY_BASE`, or whose priority is already
 * `"none"` (critic.md M30: for every document this renderer reads today, that means every finding
 * this component is ever asked to explain does have steps; the empty case only guards a foreign or
 * hand-built document).
 *
 * The final "So: …" names `finding.priority` itself, not a recomputation of the last step — legacy
 * never clamped its ladder either, and printing the document's own value here is what critic.md M30
 * asks a port to keep doing. Its tone class is the one thing the old chip styling carried worth
 * keeping: the same colour a priority pill or a row's stripe already gives that word elsewhere.
 */
export function PriorityWhy({ finding }: { finding: Finding }) {
  const steps = priorityWhy(finding);
  if (steps.length === 0) return null;

  return (
    <section className="detail-section">
      <h3>Why this is {finding.priority}</h3>
      <div className="detail-why">
        {steps.map((step) => (
          <p key={step.text} className="detail-why-step">
            {step.text}
          </p>
        ))}
        <p className="detail-why-result">
          So: <b className={toneClass(TONE(finding.priority))}>{finding.priority}</b>.
        </p>
      </div>
    </section>
  );
}
