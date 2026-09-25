import { useReport } from "../context";
import { fixed } from "../../domain/format";
import { libyearsItems } from "../../domain/libyears";
import { libyearsSplit } from "../../domain/summary";
import "./ledger.css";

/** Verbatim from legacy's eyebrow tooltip (`report.html:67`). */
const TOOLTIP =
  "Years between the installed release and the newest stable release, summed over the measured " +
  "packages. Counts every drift, healthy patches included.";

/**
 * The libyears figure, and what it is made of (PD-SUMMARY-9, DESIGN.md §5): a two-part bar, the
 * project's own direct requirements solid and what they pull in hatched, both in neutral ink —
 * libyears is years, not packages, so the priority and severity tones would claim a meaning it
 * does not have. The transitive part is the total less the direct part, both from the document.
 *
 * Legacy's figure rule stands (`report.js:296-304`): a dash whenever nothing could be measured —
 * `measured` decides, since a total of exactly `0` from one measured package is a real answer.
 * The scope line is `libyearsItems`' first phrase, so the wording stays the one legacy used.
 */
export function LibyearsLedger() {
  const { model, dispatch } = useReport();
  const block = model.report.libyears;
  const figure = block && block.measured ? (fixed(block.total, 1) ?? "—") : "—";
  const split = libyearsSplit(block);
  const scope = libyearsItems(block)[0];
  const worst = block && block.measured ? block.furthestBehind : null;

  return (
    <div className="ledger-block ledger-libyears">
      <span className="eyebrow ledger-head" title={TOOLTIP}>
        Libyears
      </span>
      <p className="ledger-fig">
        <span className="ledger-fig-num">{figure}</span>{" "}
        {figure !== "—" && <span className="ledger-fig-unit">libyears behind</span>}
      </p>
      {split && (
        <>
          <span className="libyears-bar" aria-hidden="true">
            {/* Lengths are data, so they go through the CSSOM (DESIGN.md §1.3). */}
            {/* A part of zero draws nothing, not a 3px stub that reads as "a little". */}
            {split.direct > 0 && <span className="libyears-direct" style={{ flexGrow: split.direct }} />}
            {split.transitive > 0 && (
              <span className="libyears-transitive" style={{ flexGrow: split.transitive }} />
            )}
          </span>
          <p className="libyears-parts">
            <span>
              <b className="mono">{fixed(split.direct, 1)}</b> your direct requirements
            </span>
            <span>
              <b className="mono">{fixed(split.transitive, 1)}</b> pulled in by them
            </span>
          </p>
        </>
      )}
      {/* A document with no libyears block at all still says why the figure is a dash. */}
      {!block && <p className="ledger-note">This run did not report libyears.</p>}
      {scope !== undefined && (
        <p className="ledger-note">
          {scope.charAt(0).toUpperCase() + scope.slice(1)}.
          {worst && (
            <>
              {" "}
              Furthest behind:{" "}
              <button
                type="button"
                className="ledger-pkg"
                onClick={() => {
                  dispatch({ type: "select", pkg: worst.package });
                }}
              >
                {worst.package}
              </button>{" "}
              {/* "4.0.4 at 5.8." stays on one line: split, "at" dangled and the figure read alone. */}
              <span className="nowrap">
                <span className="mono">{worst.version}</span>
                {fixed(worst.libyears, 1) !== null && (
                  <>
                    {" "}
                    at <b className="mono">{fixed(worst.libyears, 1)}</b>
                  </>
                )}
                .
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
