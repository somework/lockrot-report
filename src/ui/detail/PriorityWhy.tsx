import type { ComponentChildren } from "preact";
import type { Finding, KnownPriority } from "../../model/types";
import { priorityWhy, type PriorityStep } from "../../domain/priority";
import { toneClass } from "../common/common";
import { TONE, type Tone } from "../../domain/vocab";
import "./detail-lead.css";

/** The four rungs, left to right, and the short word each column is captioned with. */
const RUNGS: readonly (readonly [KnownPriority, string])[] = [
  ["critical", "crit"],
  ["high", "high"],
  ["medium", "med"],
  ["low", "low"],
];

function rungIndex(priority: string): number {
  return RUNGS.findIndex(([p]) => p === priority);
}

/** A rung's centre as a percentage of the track, for the SVG path between two rows. */
function rungX(index: number): number {
  return (index + 0.5) * (100 / RUNGS.length);
}

const WORDS = ["no", "one", "two", "three"];

/** "no rule moved it off critical", "one rule moved it down from critical", "two rules applied and
 *  cancelled out, so it stays high" — counted from the same steps the ladder draws, and said in
 *  priority words, the ones the track is captioned with, rather than the verdict's. */
function aside(steps: readonly PriorityStep[]): string {
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (first === undefined || last === undefined) return "";
  const applied = steps.slice(1).filter((step) => step.applied).length;
  if (applied === 0) return `no rule moved it off ${first.to}`;
  const rules = `${WORDS[applied] ?? applied} rule${applied === 1 ? "" : "s"}`;
  if (last.to === first.to) return `${rules} applied and cancelled out, so it stays ${first.to}`;
  const direction = rungIndex(last.to) > rungIndex(first.to) ? "down" : "up";
  return `${rules} moved it ${direction} from ${first.to}`;
}

/**
 * "Why this is <priority>" as a ladder (PD-DETAIL-7, DESIGN.md §5): one row per rule
 * `domain/priority.ts#priorityWhy` evaluates, in its order, with the rule's own sentence on the left
 * and, on a CRIT · HIGH · MED · LOW track on the right, the rung the ladder is on after it. A rule
 * that applied draws a filled dot in that rung's tone; one that did not draws a hollow dot where the
 * ladder already was, so "no step down" is visible as a straight line, not an absence. The last row
 * is the document's own `finding.priority` (critic.md M30), never a recomputation of the last step.
 *
 * The track is decoration for a reader who scans; the sentences carry the whole meaning, so the
 * SVG and the dots are hidden from assistive technology and each row's text stands on its own.
 */
export function PriorityWhy({ finding }: { finding: Finding }) {
  const steps = priorityWhy(finding);
  if (steps.length === 0) return null;
  const finalIndex = rungIndex(finding.priority);
  const lastIndex = rungIndex(steps[steps.length - 1]?.to ?? finding.priority);

  return (
    <section className="detail-section detail-why">
      <h3>
        Why this is {finding.priority}
        <span className="detail-why-aside">{aside(steps)}</span>
      </h3>
      <div className="detail-ladder">
        <span className="detail-ladder-corner" aria-hidden="true" />
        <span className="detail-ladder-head" aria-hidden="true">
          {RUNGS.map(([priority, word]) => (
            <span key={priority} className={toneClass(TONE(priority))}>
              {word}
            </span>
          ))}
        </span>
        {steps.map((step, index) => (
          <LadderRow
            key={step.rule}
            text={
              step.note === null ? (
                step.text
              ) : (
                <>
                  {step.text} <span className="detail-ladder-note">{step.note}</span>
                </>
              )
            }
            state={step.applied ? "applied" : "quiet"}
            tone={TONE(step.to)}
            index={rungIndex(step.to)}
            prev={index === 0 ? null : rungIndex(steps[index - 1]?.to ?? step.to)}
            last={false}
          />
        ))}
        <LadderRow
          text={
            <>
              So: <b>{finding.priority}</b>.
            </>
          }
          state="result"
          tone={TONE(finding.priority)}
          index={finalIndex === -1 ? lastIndex : finalIndex}
          prev={lastIndex}
          last
        />
      </div>
    </section>
  );
}

function LadderRow({
  text,
  state,
  tone,
  index,
  prev,
  last,
}: {
  text: ComponentChildren;
  state: "applied" | "quiet" | "result";
  tone: Tone;
  index: number;
  prev: number | null;
  last: boolean;
}) {
  const x = rungX(Math.max(index, 0));
  return (
    <>
      <p className={`detail-ladder-text is-${state}${state === "result" ? ` ${toneClass(tone)}` : ""}`}>
        {text}
      </p>
      <span className={`detail-ladder-track${state === "result" ? " is-result" : ""}`} aria-hidden="true">
        <svg className="detail-ladder-svg" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
          {prev !== null && prev !== -1 && (
            <path
              className="detail-ladder-line"
              d={`M${rungX(prev)} 0 L${x} 50`}
              vector-effect="non-scaling-stroke"
            />
          )}
          {!last && (
            <path
              className="detail-ladder-line"
              d={`M${x} 50 L${x} 100`}
              vector-effect="non-scaling-stroke"
            />
          )}
        </svg>
        {index !== -1 && <span className={`detail-ladder-dot at-${index} is-${state} ${toneClass(tone)}`} />}
      </span>
    </>
  );
}
