import { Fragment } from "preact";
import { sameScalePairs, thresholdGroups, type ThresholdPair } from "../../domain/run";
import { useReport } from "../context";
import "./ledger-rows.css";
import "./run.css";

/** What each pair's years are counted from, and the checks that read it (domain/age.ts: S2 and S8
 *  are measured against the release pair, S4 against the push pair). A subject this page does not
 *  know is named as the document names it. */
const SUBJECTS: Readonly<Record<string, { readonly what: string; readonly checks: string }>> = {
  release: { what: "since the last release", checks: "S2 · S8" },
  push: { what: "since the last push", checks: "S4" },
};

/** 0-100 on the shared scale, clamped. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** One subject's name, what its years count from, and the checks that read it. */
function SubjectName({ pair }: { pair: ThresholdPair }) {
  const subject = SUBJECTS[pair.subject];
  return (
    <span className="run-thr-name">
      <span className="run-thr-subject">{pair.subject}</span>
      {subject !== undefined && <span className="run-thr-what">{subject.what}</span>}
      {subject !== undefined && <span className="run-thr-checks mono">{subject.checks}</span>}
    </span>
  );
}

/**
 * One scale for every pair that shares both numbers (`sameScalePairs`): the caution band from warn
 * to high and the critical band past high, under the same dashed warn and dotted high guides a
 * Findings row draws, captioned 0 · warn · high · the edge exactly as the Findings column head
 * captions its axis; the subjects it holds for stacked beside it, so two identical scales are not
 * drawn twice. One `role="img"` carries the fact.
 */
function PairScale({ pairs, max }: { pairs: readonly ThresholdPair[]; max: number }) {
  const [pair] = pairs;
  if (pair === undefined) return null;
  const whats = pairs.map((p) => `years ${SUBJECTS[p.subject]?.what ?? p.subject}`).join(" and ");
  const keys = pairs.flatMap((p) => [p.warnName, p.highName]);
  const label = `${whats}: warn at ${pair.warn} years, high at ${pair.high} years (${keys.join(", ")})`;
  const shared = pairs.length > 1;
  return (
    <li className="run-thr-row">
      {/* Two subjects on one scale: a bracket gathers them, pointing at the scale they share. */}
      <span className={shared ? "run-thr-names is-shared" : "run-thr-names"}>
        {pairs.map((p) => (
          <SubjectName key={p.subject} pair={p} />
        ))}
      </span>
      <span className="run-thr-scale" role="img" aria-label={label} title={label}>
        <span className="run-thr-track" aria-hidden="true">
          <span
            className="run-thr-zone tone-med"
            style={{ left: pct(pair.warn, max), width: pct(Math.max(0, pair.high - pair.warn), max) }}
          />
          <span className="run-thr-zone tone-crit" style={{ left: pct(pair.high, max), right: "0" }} />
          <span className="age-guide is-warn" style={{ left: pct(pair.warn, max) }} />
          <span className="age-guide is-high" style={{ left: pct(pair.high, max) }} />
        </span>
        <span className="run-thr-ticks" aria-hidden="true">
          <span className="run-thr-tick is-start">0</span>
          <span className="run-thr-tick tone-med" style={{ left: pct(pair.warn, max) }}>
            {pair.warn}y
          </span>
          <span className="run-thr-tick tone-crit" style={{ left: pct(pair.high, max) }}>
            {pair.high}y
          </span>
          <span className="run-thr-tick is-end">{max}y+</span>
        </span>
      </span>
      <span className="run-thr-words" aria-hidden="true">
        <span>
          {shared && (pairs.length === 2 ? "both: " : `all ${pairs.length}: `)}
          warn at <b>{pair.warn}</b> · high at <b>{pair.high}</b> years
        </span>
        <span className="run-thr-keys mono">
          {keys.map((key, index) => (
            <Fragment key={key}>
              <span className="run-thr-key">
                {key}
                {index < keys.length - 1 && " ·"}
              </span>{" "}
            </Fragment>
          ))}
        </span>
      </span>
    </li>
  );
}

/**
 * "Thresholds in force" (PD-RUN-2, DESIGN.md §5): each warn/high pair the run recorded drawn on one
 * shared scale with the Findings list's own guides and edge rule, so "3y · 5y" here is the same
 * picture as the column head a reader just left; a threshold that is not half of a pair is listed
 * as given. Renders nothing for a run that recorded none.
 */
export function RunThresholds() {
  const { model } = useReport();
  const groups = thresholdGroups(model.report.run.thresholds);
  if (groups.pairs.length === 0 && groups.others.length === 0) {
    return (
      <section className="sect">
        <h3>Thresholds in force</h3>
        <p className="run-null-line">This run recorded no thresholds.</p>
      </section>
    );
  }
  return (
    <section className="sect">
      <h3>Thresholds in force</h3>
      {groups.pairs.length > 0 && (
        <ul className="run-thr">
          {sameScalePairs(groups.pairs).map((pairs) => (
            <PairScale key={pairs.map((p) => p.subject).join(" ")} pairs={pairs} max={groups.max} />
          ))}
        </ul>
      )}
      {groups.others.length > 0 && (
        <dl className="run-thr-others">
          {groups.others.map(([name, years]) => (
            <div key={name}>
              <dt className="mono">{name}</dt>
              <dd>{years} years</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
