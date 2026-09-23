import { useReport } from "../context";
import { PriorityLedger } from "./PriorityLedger";
import { VerdictLedger } from "./VerdictLedger";
import { AdvisoryLedger } from "./AdvisoryLedger";
import { LibyearsLedger } from "./LibyearsLedger";
import "./ledger.css";

/**
 * The four-block summary strip atop the page: priority, verdict and advisory-severity
 * distributions, plus the libyears figure. Ported from legacy `renderLedger()`
 * (`report.js:243-305`).
 *
 * Its CONTENT is computed once from the model and never reacts to a filter — DESIGN.md §5 calls
 * this out as the "boot-only ledger" parity legacy keeps (it ran once, at boot, and was never
 * re-rendered, `report.js:1135`). Each child component reads `model` and `state.filters` straight
 * from context, so a re-render only ever changes which legend buttons read as pressed, never the
 * bars or counts beside them.
 *
 * Hidden on the Run tab, the same way legacy's `.ledger` element is (`report.js:889`): that tab
 * describes the run itself, not its packages, so a package distribution has nothing to show there.
 */
export function Ledger() {
  const { state } = useReport();
  if (state.view === "run") return null;

  return (
    <div className="ledger">
      <PriorityLedger />
      <VerdictLedger />
      <AdvisoryLedger />
      <LibyearsLedger />
    </div>
  );
}
