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
          {/* A non-breaking space after the dot (ledger.css's `.summary-dot`): the leading space
              is the only place this line may wrap, so the dot must not have a second break point
              of its own right after it, or a tight fit could strand it at the end of a line. */}
          {index > 0 && <span className="summary-dot"> ·{" "}</span>}
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

/**
 * The ledger's own priority bar (`ledger.css`'s `.bar`/`.bar-seg`, `ui/ledger/PriorityLedger.tsx`),
 * echoed under the phone fold's counts line (`App.tsx#LedgerSlot`) so a phone reader sees a chart at
 * all before unfolding the ledger — PD-SUMMARY-1 gave that reader the counts in words; nothing
 * showed them the same distribution as a shape. `aria-hidden`: the counts line right beside it
 * already gives the same numbers, and this bar is not itself a control (no legend, no click) —
 * the real, interactive one is one tap away, inside the fold. `null` for a clean report, same as
 * `PriorityLedger`'s own empty read: no segment is more informative than none at all when nothing
 * fired.
 *
 * a11y review: `App.tsx#LedgerSlot` renders this straight inside a `<summary>`, which only allows
 * phrasing content (or a heading) — a `<div>` here made that markup invalid (harmless today, since
 * it is `aria-hidden`, but not if this component is ever reused inside another `<summary>`). A
 * `<span>` carries the same `.bar`/`display: flex` styling with no visual change. */
export function SummaryPriorityBar() {
  const { model } = useReport();
  const { shown, counts } = countsOf(model);
  if (shown.length === 0) return null;

  return (
    <span className="bar summary-bar" aria-hidden="true">
      {shown.map((p) => (
        <span key={p} className={`bar-seg ${toneClass(TONE(p))}`} style={{ flexGrow: counts[p] ?? 0 }} />
      ))}
    </span>
  );
}
