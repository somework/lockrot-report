import { plural } from "../../domain/format";
import { TONE } from "../../domain/vocab";
import { PRIORITIES, type Model } from "../../model/types";
import { toneClass } from "../common/common";
import { useReport } from "../context";
import "./ledger.css";

/**
 * What `SummaryCounts` needs from the model: how many packages the run checked, and which of the
 * four named priorities (never `none`, a package with no rot verdict at all) actually fired. Kept
 * as a plain function rather than a domain/ module, matching `PriorityLedger`'s own convention
 * (the ledger blocks compute their shown set inline, not through a shared helper) — this line and
 * that block read the same counts for two different reasons and would drift if forced to share one.
 */
function countsOf(model: Model) {
  const report = model.report;
  const total = report.packagesChecked ?? report.findings.length;
  const shown = PRIORITIES.filter((p) => p !== "none" && (report.priorities[p] ?? 0) > 0);

  return { total, shown, counts: report.priorities };
}

/**
 * The counts line's content, with no wrapping element of its own — DESIGN.md §8's phone fold
 * (App.tsx's `LedgerSlot`) puts this straight inside a `<summary>`, so a phone reader sees it
 * without unfolding anything; `SummaryBand` below wraps the same content in a `<p>` for the wide
 * band above the ledger.
 */
export function SummaryCounts() {
  const { model } = useReport();
  const { total, shown, counts } = countsOf(model);

  if (shown.length === 0) {
    return (
      <span className={`summary-clean ${toneClass("none")}`}>
        Nothing flagged in {plural(total, "package", "packages")}
      </span>
    );
  }

  return (
    <>
      {shown.map((p, index) => (
        <span key={p} className={`summary-count ${toneClass(TONE(p))}`}>
          {index > 0 && <span className="summary-dot"> · </span>}
          <b>{counts[p]}</b> {p}
        </span>
      ))}
      <span className="summary-of"> of {plural(total, "package", "packages")}</span>
    </>
  );
}

/**
 * The line above the ledger: how many packages carry each priority, out of how many the run
 * checked — DESIGN.md §8 calls this "the first five seconds". No gate content here; the run's
 * gate is a quiet fact in the header instead (Header.tsx, same section).
 *
 * A plain `<div>`, not a `<section>`: a `<section>` with an accessible name maps to the ARIA
 * `region` role, which would collide with the one landmark `getByRole("region")` is written
 * against on this page — the open package's detail pane (e2e/support/new.ts, tests/unit/ui/App.test.tsx#detailName).
 */
export function SummaryBand() {
  return (
    <div className="summary">
      <p className="summary-counts">
        <SummaryCounts />
      </p>
    </div>
  );
}
