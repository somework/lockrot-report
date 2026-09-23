import { useReport } from "../context";
import { toneClass } from "../common/common";
import { plural } from "../../domain/format";
import { population } from "../../domain/filters";
import { allAdvisories, sevTone } from "../../domain/advisories";
import { SEVERITIES } from "../../model/types";
import "./ledger.css";

/**
 * Every advisory's severity, across every package the run checked — ported from legacy
 * `renderLedger()`'s advisory block (`report.js:273-291`). Like `VerdictLedger`, a severity bucket
 * with a zero count is skipped rather than shown at zero; a report with no advisories at all shows
 * the muted fallback line legacy did (`report.js:291`), instead of an empty bar and legend.
 *
 * `packagesWithAdvisories` reuses `population(model, "advisories")` — the same population the
 * Advisories tab and the search bar's count line read (`domain/filters.ts`) — rather than
 * recomputing "packages with at least one advisory" a second way, so the two numbers can never
 * drift apart.
 */
export function AdvisoryLedger() {
  const { model, state, dispatch } = useReport();
  const advisories = allAdvisories(model);
  const packagesWithAdvisories = population(model, "advisories").length;

  const counts: Partial<Record<(typeof SEVERITIES)[number], number>> = {};
  for (const { advisory } of advisories) {
    counts[advisory.severity] = (counts[advisory.severity] ?? 0) + 1;
  }
  const shown = SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0);

  const label =
    advisories.length === 0
      ? "No advisory affects this lock"
      : `${plural(advisories.length, "advisory", "advisories")} on ${plural(packagesWithAdvisories, "package", "packages")}`;

  return (
    <div className="ledger-block">
      <span className="eyebrow">{label}</span>
      <div className="bar" role="img" aria-label="Advisory severity distribution">
        {shown.length === 0 ? (
          <span className={`bar-seg ${toneClass("none")}`} style={{ flexGrow: 1 }} />
        ) : (
          shown.map((sev) => (
            <span
              key={sev}
              className={`bar-seg ${toneClass(sevTone(sev))}`}
              style={{ flexGrow: counts[sev] ?? 0 }}
              title={`${sev}: ${counts[sev] ?? 0}`}
            />
          ))
        )}
      </div>
      <div className="legend">
        {shown.length === 0 ? (
          <span className="legend-empty">no advisory affects this lock</span>
        ) : (
          shown.map((sev) => {
            const on = state.filters.sev.includes(sev);
            return (
              <button
                key={sev}
                type="button"
                className={`legend-btn ${toneClass(sevTone(sev))}`}
                aria-pressed={on}
                onClick={() => {
                  dispatch({ type: "toggle", group: "sev", key: sev });
                }}
              >
                <i className="swatch" aria-hidden="true" />
                {sev} <i className="count">{counts[sev] ?? 0}</i>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
