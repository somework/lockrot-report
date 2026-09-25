import { useReport } from "../context";
import { LegendButton } from "../common/common";
import { TONE } from "../../domain/vocab";
import { population } from "../../domain/filters";
import { rankVerdicts } from "../../domain/summary";
import "./ledger.css";

/**
 * Why the flagged packages are flagged: one bar per flagged verdict, most common first, each bar
 * the verdict's own filter chip (PD-SUMMARY-7, DESIGN.md §5). The verdicts the run does not flag
 * (`ok`, `finished`, `unknown`) follow as one quiet line of chips: the old single bar was 70% `ok`
 * green, which drowned the six that matter. Bars scale to the longest one, not to the flagged
 * total, so the ranking is what reads first.
 *
 * Kept from legacy's verdict block (`report.js:260-271`): a verdict with no package is skipped,
 * not shown at zero; a verdict this renderer does not know still gets a chip at `TONE()`'s neutral
 * fallback (DESIGN.md §2) — a bar when the run's own `flagged_verdicts` names it, the quiet line
 * otherwise. Which verdicts count as flagged is the run's list, the same one the Findings tab reads.
 */
export function VerdictLedger() {
  const { model, state, dispatch } = useReport();
  const { flagged, quiet } = rankVerdicts(model.report.counts, model.report.run.flaggedVerdicts);
  const flaggedCount = population(model, "findings").length;
  const longest = Math.max(1, ...flagged.map((entry) => entry.count));
  const chip = (verdict: string, count: number, share?: number) => (
    <LegendButton
      key={verdict}
      tone={TONE(verdict)}
      dim={share === undefined}
      pressed={state.filters.verdict.includes(verdict)}
      label={verdict}
      count={count}
      share={share}
      onToggle={() => {
        dispatch({ type: "toggle", group: "verdict", key: verdict });
      }}
    />
  );

  return (
    <div className="ledger-block ledger-verdicts">
      <p className="eyebrow ledger-head">
        {flagged.length === 0
          ? "Verdicts"
          : `Why the ${flaggedCount} ${flaggedCount === 1 ? "is" : "are"} flagged`}
        {flagged.length > 1 && <span className="ledger-head-note">most common first</span>}
      </p>
      {/* A clean report has no bar to draw; its quiet line below is the whole story. */}
      {flagged.length > 0 && (
        <div className="verdict-bars">
          {flagged.map((entry) => chip(entry.verdict, entry.count, entry.count / longest))}
        </div>
      )}
      {quiet.length > 0 && (
        <div className="legend ledger-quiet">
          <span className="ledger-quiet-label">Not flagged</span>
          {quiet.map((entry) => chip(entry.verdict, entry.count))}
        </div>
      )}
    </div>
  );
}
