import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { population } from "../../domain/filters";
import { pluralNoun } from "../../domain/format";
import "./ledger.css";

/** The four priorities a finding can actually carry (`none` is a package with no rot verdict at
 *  all, and legacy never gives it a bar segment or a legend button — `report.js:250-251`). */
const SHOWN_PRIORITIES = ["critical", "high", "medium", "low"] as const;

/**
 * The report's priority distribution, over the packages the run actually flagged. Ported from
 * legacy `renderLedger()`'s priority block (`report.js:249-258`), with three deliberate differences:
 *
 * - every one of the four priorities gets a legend button even at a count of zero, unlike the
 *   verdict and advisory ledgers beside it (this task's brief; the asymmetry is intentional, not
 *   an oversight — a reader scanning the row should see the whole scale, not just what fired);
 * - the eyebrow's tooltip is corrected for critic.md M29: legacy's static
 *   `title="Every verdict except ok and finished"` sits on a count (`FLAGGED.length`) that also
 *   excludes `unknown` — a package lockrot could not check is not a finding either. The text here
 *   names all three exclusions, so it matches the number it labels;
 * - a priority this renderer does not know (a future lockrot) still gets a bar segment and legend
 *   button, appended after the four known ones at a neutral tone — DESIGN.md §2's forward-
 *   compatibility contract, same reasoning as `VerdictLedger`. `"none"` is never included: it is a
 *   package with no rot verdict at all, not an unknown priority.
 */
export function PriorityLedger() {
  const { model, state, dispatch } = useReport();
  const counts = model.report.priorities;
  const flaggedCount = population(model, "findings").length;
  const known = new Set<string>(SHOWN_PRIORITIES);
  const unknown = Object.keys(counts).filter((p) => !known.has(p) && p !== "none" && (counts[p] ?? 0) > 0);
  const shown: readonly string[] = [...SHOWN_PRIORITIES, ...unknown];
  const bars = shown.filter((p) => (counts[p] ?? 0) > 0);

  return (
    <div className="ledger-block">
      <span className="eyebrow" title="Every verdict except ok, finished and unknown">
        Priority of the <span className="ledger-figure">{flaggedCount}</span> flagged{" "}
        {pluralNoun(flaggedCount, "package", "packages")}
      </span>
      <div className="bar" role="img" aria-label="Priority distribution">
        {bars.length === 0 ? (
          <span className={`bar-seg ${toneClass("none")}`} style={{ flexGrow: 1 }} />
        ) : (
          bars.map((p) => (
            <span
              key={p}
              className={`bar-seg ${toneClass(TONE(p))}`}
              style={{ flexGrow: counts[p] ?? 0 }}
              title={`${p}: ${counts[p] ?? 0}`}
            />
          ))
        )}
      </div>
      <div className="legend">
        {shown.map((p) => (
          <LegendButton
            key={p}
            tone={TONE(p)}
            pressed={state.filters.prio.includes(p)}
            label={p}
            count={counts[p] ?? 0}
            onToggle={() => {
              dispatch({ type: "toggle", group: "prio", key: p });
            }}
          />
        ))}
      </div>
    </div>
  );
}
