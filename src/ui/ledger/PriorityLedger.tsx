import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { population } from "../../domain/filters";
import { plural } from "../../domain/format";
import { RANKED_PRIORITIES, sharePhrase, waffleRuns } from "../../domain/summary";
import { CleanMark } from "./CleanMark";
import { Waffle } from "./Waffle";
import "./ledger.css";

/**
 * The summary band's lead: the one answer a first-time reader needs — how many packages are
 * flagged, out of how many — as the loudest thing on the page, with the priority chips that
 * filter by it and a waffle of every package beside it (DESIGN.md §5 PD-SUMMARY-6). It replaced
 * both the counts sentence above the ledger and the ledger's own priority bar, which said the same
 * thing twice.
 *
 * Kept from the priority block it grew out of (legacy `renderLedger()`, `report.js:249-258`):
 *
 * - every one of the four priorities gets a chip even at a count of zero, unlike the verdict and
 *   advisory chips (a reader should see the whole scale, not just what fired); a zero chip dims;
 * - the eyebrow's tooltip names all three verdicts the count excludes (critic.md M29);
 * - a priority this renderer does not know (a future lockrot) still gets a chip, after the four
 *   known ones, at `TONE()`'s neutral fallback (DESIGN.md §2); `none` never does.
 *
 * The figure is the Findings tab's own population, so the two can never disagree.
 */
export function PriorityLedger() {
  const { model, state, dispatch } = useReport();
  const counts = model.report.priorities;
  const flagged = population(model, "findings");
  const total = model.report.packagesChecked ?? model.report.findings.length;
  const known = new Set<string>(RANKED_PRIORITIES);
  const unknown = Object.keys(counts).filter((p) => !known.has(p) && p !== "none" && (counts[p] ?? 0) > 0);
  const shown: readonly string[] = [...RANKED_PRIORITIES, ...unknown];
  const clean = flagged.length === 0;
  const empty = total === 0 && clean;

  return (
    <div className={empty ? "ledger-lead is-empty" : clean ? "ledger-lead is-clean" : "ledger-lead"}>
      <div className="lead-answer">
        <span className="eyebrow" title="Every verdict except ok, finished and unknown">
          Flagged packages
        </span>
        {empty ? (
          // A lock with no packages is not a clean bill of health, just nothing to judge: no tick,
          // no green, and no "nothing flagged in 0 packages" to puzzle over.
          <p className="lead-figure">
            <span className="lead-clean lead-empty">No packages in this lock</span>
          </p>
        ) : clean ? (
          <p className={`lead-figure ${toneClass("none")}`}>
            <CleanMark size={30} />
            <span className={`lead-clean ${toneClass("none")}`}>
              Nothing flagged in {plural(total, "package", "packages")}
            </span>
          </p>
        ) : (
          <p className="lead-figure">
            <span className="lead-num">{flagged.length}</span>
            <span className="lead-of">
              <span className="lead-of-line">of {plural(total, "package", "packages")}</span>{" "}
              <span className="lead-of-line">
                flagged <span className="lead-share">· {sharePhrase(flagged.length, total)} of the lock</span>
              </span>
            </span>
          </p>
        )}
        <div className="legend lead-chips">
          {shown.map((p) => (
            <LegendButton
              key={p}
              tone={TONE(p)}
              dim={(counts[p] ?? 0) === 0}
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
      {/* Drawn for any lock with a package in it: four packages are four squares, the same size
          as a big lock's, so the lead never leaves its right-hand side empty for a small one. */}
      {total > 0 && (
        <figure className="lead-waffle">
          <Waffle runs={waffleRuns(flagged)} total={total} />
          <figcaption className="lead-waffle-cap">
            One square per package
            {!clean && (
              <span className="lead-waffle-key">
                <i className="waffle-cell waffle-rest" aria-hidden="true" />
                {Math.max(0, total - flagged.length)} not flagged
              </span>
            )}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
