import type { AgeAxis as AgeAxisData } from "../../domain/age";
import "./views.css";
import "./ledger-rows.css";

/** 0-100, clamped: a bar or a guide past the axis' own edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** The one place the axis is captioned (PD-ROWS-4); one `role="img"` with the thresholds spelled
 *  out. */
export function AgeAxis({
  axis,
  caption = "Years since release",
  whose = "",
}: {
  axis: AgeAxisData;
  /** The head's visible words; Blast radius says whose ages its column shows. */
  caption?: string;
  /** Said after "age axis" to a screen reader, as `caption` says it on screen. */
  whose?: string;
}) {
  const label = `age axis${whose ? ` (${whose})` : ""}: years since the last release, 0 to ${axis.max} and more; warn at ${axis.warn} years, high at ${axis.high} years`;
  return (
    <span className="fhead-age" role="columnheader" aria-label={caption} title={label}>
      <span className="fhead-axis" aria-hidden="true">
        <span className="fhead-axis-label">{caption}</span>
        <span className="fhead-tick is-start">0</span>
        <span className="fhead-tick is-warn tone-med" style={{ left: pct(axis.warn, axis.max) }}>
          {axis.warn}y
        </span>
        <span className="fhead-tick is-high tone-crit" style={{ left: pct(axis.high, axis.max) }}>
          {axis.high}y
        </span>
        <span className="fhead-tick is-end">{axis.max}y+</span>
      </span>
    </span>
  );
}
