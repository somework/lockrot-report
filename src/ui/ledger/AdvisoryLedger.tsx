import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { plural } from "../../domain/format";
import { population } from "../../domain/filters";
import { advisoryCheckIncomplete, allAdvisories, sevTone } from "../../domain/advisories";
import { SEVERITIES } from "../../model/types";
import "./ledger.css";

/**
 * Every advisory's severity, across every package the run checked — ported from legacy
 * `renderLedger()`'s advisory block (`report.js:273-291`). Like `VerdictLedger`, a severity bucket
 * with a zero count is skipped rather than shown at zero; a report with no advisories at all shows
 * the muted fallback line legacy did (`report.js:291`), instead of an empty bar and legend —
 * PD-LEDGER-1 (DESIGN.md §5) splits that fallback in two, below.
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

  // PD-LEDGER-1 (DESIGN.md §5): "no advisory" was a finding whenever `advisories.length` was 0,
  // whether or not the check that would have found one ever ran. `advisoryCheckIncomplete` reads
  // the same run-wide facts (`network_failures`, `notes`) the Run tab's own notes list already
  // shows, so this line and that list can never disagree about whether the run says so.
  const incomplete = advisories.length === 0 && advisoryCheckIncomplete(model);
  const totalChecked = model.report.packagesChecked ?? model.report.findings.length;
  const checkedPhrase = plural(totalChecked, "package", "packages");

  const label =
    advisories.length === 0
      ? incomplete
        ? `No advisory found; ${checkedPhrase} could not be confirmed clear`
        : "No advisory affects this lock"
      : `${plural(advisories.length, "advisory", "advisories")} on ${plural(packagesWithAdvisories, "package", "packages")}`;

  return (
    <div className="ledger-block">
      <span className="eyebrow">{label}</span>
      <div className="bar" role="img" aria-label="Advisory severity distribution">
        {shown.length === 0 ? (
          // A green bar claims a clean check; a check that may not have run gets the same neutral
          // "low" tone an unknown verdict or priority already renders at (PriorityLedger,
          // VerdictLedger), never the affirmative "none" tone (PD-LEDGER-1).
          <span className={`bar-seg ${toneClass(incomplete ? "low" : "none")}`} style={{ flexGrow: 1 }} />
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
        {shown.length === 0
          ? // A genuinely clean run's own line already says so once, in the eyebrow above the bar
            // (`label`) — a walk found this legend repeating that exact sentence a second time, under
            // a bar with no segment for it to caption. The incomplete case still gets its own line
            // here: the eyebrow already named the count once, and repeating that a check may not have
            // run, right where the (empty) bar itself would otherwise draw a false "all clear", is
            // worth the second mention a truly clean run does not need.
            incomplete && (
              <span className="legend-empty">
                advisory check incomplete; {checkedPhrase} not confirmed clear
              </span>
            )
          : shown.map((sev) => (
              <LegendButton
                key={sev}
                tone={sevTone(sev)}
                pressed={state.filters.sev.includes(sev)}
                label={sev}
                count={counts[sev] ?? 0}
                onToggle={() => {
                  dispatch({ type: "toggle", group: "sev", key: sev });
                }}
              />
            ))}
      </div>
    </div>
  );
}
