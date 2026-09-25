import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { population } from "../../domain/filters";
import { plural } from "../../domain/format";
import { RANKED_PRIORITIES, sharePhrase, waffleRuns } from "../../domain/summary";
import { rollupClauses, scopeRollup } from "../../domain/share";
import { CleanMark } from "./CleanMark";
import { Waffle } from "./Waffle";
import "./ledger.css";

/** A clause with its counts set as figures: "51 in production, 18 dev-only". */
function Clause({ text }: { text: string }) {
  return (
    <span className="lead-scope-part">
      {text.split(/(\d+)/).map((piece, i) => (i % 2 === 1 ? <b key={i}>{piece}</b> : piece))}
    </span>
  );
}

/**
 * The flagged packages split two ways under the chips (PD-SUMMARY-9): where they are installed
 * (`Finding.dev`) and how they get in (`Finding.direct`) — "51 in production, 18 dev-only · 20
 * required directly, 49 pulled in". The rail's Scope counts, in one line a phone reader sees
 * without opening Filters. Words, not a mark: the waffle beside it already draws the 69.
 */
function ScopeLine({ clauses }: { clauses: readonly string[] }) {
  if (clauses.length === 0) return null;
  return (
    <p className="lead-scope">
      <span className="lead-scope-parts">
        {clauses.map((clause, i) => (
          <span key={clause} className="lead-scope-item">
            <span className="lead-scope-sep" aria-hidden="true">
              {i > 0 ? "·" : ""}
            </span>
            <Clause text={clause} />
            {i < clauses.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </p>
  );
}

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
 *   advisory chips (a reader should see the whole scale, not just what fired); a zero chip dims —
 *   except in a lock with no packages at all, which has no scale to show and gets no chips;
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
        {!clean && <ScopeLine clauses={rollupClauses(scopeRollup(flagged))} />}
        {/* No chips for an empty lock: four disabled "0" filters there had nothing to filter. */}
        {!empty && (
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
        )}
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
