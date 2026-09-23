import { useReport } from "../context";
import { fixed } from "../../domain/format";
import { libyearsItems } from "../../domain/libyears";
import "./ledger.css";

/** Verbatim from legacy's eyebrow tooltip (`report.html:67`). */
const TOOLTIP =
  "Years between the installed release and the newest stable release, summed over the measured " +
  "packages. Counts every drift, healthy patches included.";

/**
 * The libyears figure and its explanatory items. Ported from legacy `renderLedger()`'s libyears
 * block (`report.js:296-304`): the headline is prose, not a filter, so it is plain text rather
 * than a clickable legend, and it reads a dash whenever nothing could be measured — `measured`
 * itself, not `total`, decides that, since a `total` of exactly `0` from one fully-measured
 * package is a real answer, not a missing one. `libyearsItems` (domain/libyears.ts) supplies the
 * secondary phrases; this component only lays them out, one per `<span>` as legacy did.
 */
export function LibyearsLedger() {
  const { model } = useReport();
  const block = model.report.libyears;
  const figure = block && block.measured ? (fixed(block.total, 1) ?? "—") : "—";
  const items = libyearsItems(block);

  return (
    <div className="ledger-block">
      <span className="eyebrow" title={TOOLTIP}>
        Libyears behind
      </span>
      <p className="figure">{figure}</p>
      <div className="legend libyears-line">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}
