import { useReport } from "../context";
import { LegendButton, toneClass } from "../common/common";
import { plural } from "../../domain/format";
import { population } from "../../domain/filters";
import { advisoryCheckIncomplete, advisoryPackages, allAdvisories, sevTone } from "../../domain/advisories";
import { SEVERITIES } from "../../model/types";
import { CleanMark } from "./CleanMark";
import { CheckIncompleteTag } from "../common/CheckIncompleteTag";
import "./ledger.css";

/** How many packages the block names by hand before it points at the Advisories tab instead. */
const NAMED_PACKAGES = 3;

/**
 * Every advisory's severity, across every package the run checked — grown out of legacy
 * `renderLedger()`'s advisory block (`report.js:273-291`). Each advisory is one square
 * (PD-SUMMARY-8, DESIGN.md §5): the old full-width bar drew two advisories as big as 69 findings.
 * A severity with no advisory gets no chip; a report with none at all says so in words, with no
 * mark to caption, and PD-LEDGER-1 splits that sentence in two, below.
 *
 * `packagesWithAdvisories` reuses `population(model, "advisories")` — the same population the
 * Advisories tab and the search bar's count line read — so the numbers can never drift apart. The
 * "fixed by" line quotes each advisory's own `fixed_by`, verbatim; nothing here compares versions.
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
  // shows, so this line and that list can never disagree about whether the run says so. PD-ADV-7:
  // the same holds when it did find some — a count from a partial check is said to be one.
  const incomplete = advisoryCheckIncomplete(model);
  const totalChecked = model.report.packagesChecked ?? model.report.findings.length;
  const checkedPhrase = plural(totalChecked, "package", "packages");

  if (advisories.length === 0) {
    return (
      <div className="ledger-block ledger-advisories">
        <span className="eyebrow ledger-head">Security advisories</span>
        {incomplete ? (
          // Never the affirmative "none" tone: a check that may not have run is not a clean one.
          <>
            <CheckIncompleteTag />
            <p className={`ledger-fig ledger-fig-text ${toneClass("low")}`}>
              No advisory found; {checkedPhrase} could not be confirmed clear
            </p>
            <p className="ledger-note">The run's own notes say why, under Run data.</p>
          </>
        ) : (
          <p className={`ledger-fig ledger-all-clear ${toneClass("none")}`}>
            <CleanMark size={18} />
            <span className="ledger-fig-text">No advisory affects this lock</span>
          </p>
        )}
      </div>
    );
  }

  const packages = advisoryPackages(advisories);
  const named = packages.slice(0, NAMED_PACKAGES);

  return (
    <div className="ledger-block ledger-advisories">
      <span className="eyebrow ledger-head">Security advisories</span>
      <p className="ledger-fig">
        <span className="ledger-fig-num">{advisories.length}</span>{" "}
        <span className="ledger-fig-unit">
          {advisories.length === 1 ? "advisory" : "advisories"} on{" "}
          {plural(packagesWithAdvisories, "package", "packages")}
        </span>
      </p>
      {incomplete && (
        <p className="ledger-note ledger-partial">
          <CheckIncompleteTag /> This may not be every advisory; the run's own notes say why, under Run data.
        </p>
      )}
      {/* One square per advisory, most severe first (`allAdvisories` sorts them); `aria-hidden`
          since the chips below carry the same counts in words. */}
      <div className="advisory-squares" aria-hidden="true">
        {advisories.map(({ advisory }, index) => (
          <i
            key={`${advisory.id}-${index}`}
            className={`advisory-square ${toneClass(sevTone(advisory.severity))}`}
          />
        ))}
      </div>
      <div className="legend">
        {shown.map((sev) => (
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
      {/* Paragraphs, not a list: `role=listitem` is how the page's own rows are found (the e2e
          contract, print.css), and these lines are notes, not rows. */}
      <div className="ledger-note advisory-packages">
        {named.map((entry) => (
          <p key={entry.package}>
            <button
              type="button"
              className="ledger-pkg"
              onClick={() => {
                dispatch({ type: "select", pkg: entry.package });
              }}
            >
              {entry.package}
            </button>{" "}
            {entry.fixedBy.length > 0 ? (
              <>
                — fixed by <span className="mono">{entry.fixedBy.join(", ")}</span>
                {entry.someUnfixed && "; some list no fix"}
              </>
            ) : (
              "— no fix listed"
            )}
          </p>
        ))}
        {packages.length > named.length && (
          <p>
            and {plural(packages.length - named.length, "more package", "more packages")} on the Advisories
            tab
          </p>
        )}
      </div>
    </div>
  );
}
