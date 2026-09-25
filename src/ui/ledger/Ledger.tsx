import { Fragment } from "preact";
import { useReport } from "../context";
import { advisoryCheckIncomplete, allAdvisories } from "../../domain/advisories";
import { foldPeek, rankVerdicts } from "../../domain/summary";
import { PriorityLedger } from "./PriorityLedger";
import { VerdictLedger } from "./VerdictLedger";
import { AdvisoryLedger } from "./AdvisoryLedger";
import { LibyearsLedger } from "./LibyearsLedger";
import "./ledger.css";

/** The three supporting facts under the lead, in one row of columns separated by rules. */
function Tier() {
  return (
    <div className="ledger-tier">
      <VerdictLedger />
      <AdvisoryLedger />
      <LibyearsLedger />
    </div>
  );
}

/**
 * The phone fold's one line (DESIGN.md §8): what the folded tier holds, counted, so a reader can
 * tell from the closed summary whether it is worth a tap.
 */
function FoldSummary() {
  const { model } = useReport();
  const advisories = allAdvisories(model).length;
  const peek = foldPeek({
    reasons: rankVerdicts(model.report.counts, model.report.run.flaggedVerdicts).flagged.length,
    advisories,
    advisoryCheckIncomplete: advisories === 0 && advisoryCheckIncomplete(model),
    libyears: model.report.libyears,
  });

  return (
    <summary>
      <span className="ledger-fold-summary">
        <span className="ledger-fold-title">More about this lock</span>
        <span className="ledger-fold-peek">
          {/* The space before each dot sits outside the nowrap span: the one place a wrap may fall. */}
          {peek.map((part, index) => (
            <Fragment key={part}>
              {index > 0 && " "}
              <span>
                {index > 0 && "· "}
                {part}
              </span>
            </Fragment>
          ))}
        </span>
      </span>
    </summary>
  );
}

/**
 * The summary band atop the page (PD-SUMMARY-6, DESIGN.md §5): one answer, then three supporting
 * facts. The lead (`PriorityLedger`) is how many packages are flagged, as a figure, chips and a
 * waffle; the tier under it is why (the verdicts), the security advisories, and libyears. On a
 * phone (`narrow`) the lead stays in view and only the tier folds behind a `<details>`, so the
 * answer never costs a tap and the list still starts one screen down.
 *
 * Its CONTENT is computed once from the model and never reacts to a filter — DESIGN.md §5's
 * "boot-only ledger" parity (legacy ran it once, at boot, `report.js:1135`). A re-render only ever
 * changes which chips read as pressed, never a count or a mark beside them.
 *
 * Hidden on the Run tab, the same way legacy's `.ledger` element is (`report.js:889`): that tab
 * describes the run itself, not its packages.
 */
export function Ledger({ narrow = false }: { narrow?: boolean }) {
  const { state } = useReport();
  if (state.view === "run") return null;

  return (
    // PD-GLOSSARY-4/5 made a verdict pill's own word ("abandoned") an accessible button name too,
    // both in a Findings row and in the open detail — the same word this band's chips carry.
    // `aria-label` here is what tells them apart by role scope rather than by hoping no other
    // button on the page ever shares a chip's name.
    <div className="ledger" role="group" aria-label="Ledger">
      <PriorityLedger />
      {narrow ? (
        <details className="ledger-fold">
          <FoldSummary />
          <Tier />
        </details>
      ) : (
        <Tier />
      )}
    </div>
  );
}
