import { useReport } from "../context";
import { filterTitle, LegendButton, toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { population } from "../../domain/filters";
import { priorityRunsByVerdict, rankVerdicts, type WaffleRun } from "../../domain/summary";
import "./ledger.css";

/**
 * One flagged verdict as a row of the ranked chart: its word, its bar, its count — and still the
 * verdict's own filter toggle, a native `<button aria-pressed>` like every chip (PD-LEDGER-2).
 *
 * The bar is split by priority, in the priority tones the chips and waffle above it use, so a
 * colour on this band always means a priority (PD-SUMMARY-7): a verdict's own tone reused the same
 * hues for a different fact, and "old-promise" drew in the yellow the chip row calls "medium".
 * A part the findings do not account for (a document whose counts outrun its list) is drawn in
 * neutral ink rather than guessed at.
 *
 * The bar and its parts are `aria-hidden`; the accessible name stays "left-behind 23", the same
 * "label count" every chip has, which the e2e suite clicks by.
 */
function VerdictBar({
  verdict,
  count,
  runs,
  share,
  pressed,
  onToggle,
}: {
  verdict: string;
  count: number;
  runs: readonly WaffleRun[];
  share: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  const accounted = runs.reduce((sum, run) => sum + run.count, 0);
  const rest = Math.max(0, count - accounted);

  return (
    <button
      type="button"
      className="legend-btn legend-btn-bar"
      aria-pressed={pressed}
      title={filterTitle(verdict, pressed)}
      onClick={onToggle}
    >
      {verdict}{" "}
      <span className="legend-track" aria-hidden="true">
        {/* Lengths are data, so they go through the CSSOM (DESIGN.md §1.3), never a style string. */}
        <span className="legend-fill" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}>
          {runs.map((run) => (
            <span
              key={run.priority}
              className={`legend-seg ${toneClass(TONE(run.priority))}`}
              style={{ flexGrow: run.count }}
            />
          ))}
          {rest > 0 && <span className="legend-seg legend-seg-rest" style={{ flexGrow: rest }} />}
        </span>
      </span>
      <i className="count">{count}</i>
    </button>
  );
}

/**
 * Why the flagged packages are flagged: one bar per flagged verdict, most common first, each bar
 * the verdict's own filter chip (PD-SUMMARY-7, DESIGN.md §5). The verdicts the run does not flag
 * (`ok`, `finished`, `unknown`) follow as one quiet line of chips: the old single bar was 70% `ok`
 * green, which drowned the six that matter.
 *
 * Bars share one scale, set by the longest, but a package is never drawn wider than a fixed unit
 * (`--unit`, ledger.css): the chart track is only as long as the longest bar needs, so "1" in a
 * two-package lock is a short bar, not the full width of the column.
 *
 * Kept from legacy's verdict block (`report.js:260-271`): a verdict with no package is skipped,
 * not shown at zero; a verdict this renderer does not know still gets a chip at `TONE()`'s neutral
 * fallback (DESIGN.md §2) — a bar when the run's own `flagged_verdicts` names it, the quiet line
 * otherwise. Which verdicts count as flagged is the run's list, the same one the Findings tab reads.
 */
export function VerdictLedger() {
  const { model, state, dispatch } = useReport();
  const { flagged, quiet } = rankVerdicts(model.report.counts, model.report.run.flaggedVerdicts);
  const flaggedFindings = population(model, "findings");
  const flaggedCount = flaggedFindings.length;
  const runs = priorityRunsByVerdict(flaggedFindings);
  const longest = Math.max(1, ...flagged.map((entry) => entry.count));
  const toggle = (verdict: string) => () => {
    dispatch({ type: "toggle", group: "verdict", key: verdict });
  };

  return (
    <div className="ledger-block ledger-verdicts">
      <p className="eyebrow ledger-head">
        {flagged.length === 0
          ? "Verdicts"
          : `Why the ${flaggedCount} ${flaggedCount === 1 ? "is" : "are"} flagged`}
        {flagged.length > 1 && <span className="ledger-head-note">most common first</span>}
      </p>
      {flagged.length > 0 && (
        // `--longest` is a count, through the CSSOM like every other length here (DESIGN.md §1.3).
        <div className="verdict-bars" style={{ "--longest": String(longest) }}>
          {flagged.map((entry) => (
            <VerdictBar
              key={entry.verdict}
              verdict={entry.verdict}
              count={entry.count}
              runs={runs.get(entry.verdict) ?? []}
              share={entry.count / longest}
              pressed={state.filters.verdict.includes(entry.verdict)}
              onToggle={toggle(entry.verdict)}
            />
          ))}
        </div>
      )}
      {/* A clean report still says what the column would have held, before its quiet line. */}
      {flagged.length === 0 && quiet.length > 0 && (
        <p className="ledger-note">Nothing is flagged, so there is nothing to rank.</p>
      )}
      {quiet.length > 0 && (
        <div className="legend ledger-quiet">
          <span className="ledger-quiet-label">Not flagged</span>
          {quiet.map((entry) => (
            <LegendButton
              key={entry.verdict}
              tone={TONE(entry.verdict)}
              dim
              pressed={state.filters.verdict.includes(entry.verdict)}
              label={entry.verdict}
              count={entry.count}
              onToggle={toggle(entry.verdict)}
            />
          ))}
        </div>
      )}
      {/* An empty lock has no verdict at all: a line, not a blank column under a heading. */}
      {flagged.length === 0 && quiet.length === 0 && (
        <p className="ledger-note">No packages, so no verdicts.</p>
      )}
    </div>
  );
}
