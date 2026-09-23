import type { ExplainMetadata } from "../../model/types";
import { day } from "../../domain/format";
import { timelineLayout, type TimelineLane } from "../../domain/timeline";
import { useReport } from "../context";
import "./detail.css";

/** `lane.newest` is suppressed on the installed branch (`timeline.ts`'s own doc comment) — a
 *  package can only be "still releasing" on a branch it has moved off of. */
function laneClassName(lane: TimelineLane): string {
  const classes = ["detail-timeline-lane"];
  if (lane.installed) classes.push("detail-timeline-lane-installed");
  if (lane.newest && !lane.installed) classes.push("detail-timeline-lane-newest");
  return classes.join(" ");
}

/**
 * "Release branches": the branch/release timeline, ported from legacy `timeline()`
 * (`report.js:669-709`). `timelineLayout` (domain/timeline.ts) already applies the C2 and M26 fixes;
 * this only lays out the numbers it returns. Renders nothing when fewer than two branches carry a
 * date — the same threshold legacy used to skip the whole section.
 */
export function Timeline({
  metadata,
  installedVersion,
}: {
  metadata: ExplainMetadata | null;
  installedVersion: string;
}) {
  const { now } = useReport();
  const layout = timelineLayout(metadata?.branches ?? [], now);
  if (layout.lanes.length === 0) return null;

  return (
    <section className="detail-section">
      <h3>Release branches</h3>
      <div className="detail-timeline">
        <div className="detail-timeline-axis">
          {layout.ticks.map((tick) => (
            <span key={tick.year} className="detail-timeline-tick" style={{ left: `${tick.x}%` }}>
              {tick.year}
            </span>
          ))}
        </div>
        {layout.lanes.map((lane) => {
          // A label past the axis's midpoint would run off the right edge; legacy flips it to grow
          // leftward from the same point instead (report.js:688-689). The other end is pinned to
          // the track's edge, so a long label is cut short rather than drawn over its neighbours.
          const labelPastMidpoint = lane.x > 62;
          const labelStyle = labelPastMidpoint
            ? { left: "0%", right: `${100 - lane.x + 2}%` }
            : { left: `${lane.x + 2}%`, right: "0%" };

          return (
            <div key={lane.branch} className={laneClassName(lane)}>
              <span className="detail-timeline-branch">{lane.branch}</span>
              <span className="detail-timeline-track">
                <span className="detail-timeline-dot" style={{ left: `${lane.x}%` }} />
                <span
                  className={labelPastMidpoint ? "detail-timeline-label is-flipped" : "detail-timeline-label"}
                  style={labelStyle}
                >
                  {lane.label} · {day(lane.date)}
                  {lane.php !== null && ` · php ${lane.php}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="detail-timeline-legend">
        <span className="detail-timeline-legend-item">
          <span className="detail-timeline-swatch detail-timeline-swatch-installed" />
          you are on {installedVersion}
        </span>
        <span className="detail-timeline-legend-item">
          <span className="detail-timeline-swatch detail-timeline-swatch-newest" />
          branch still releasing
        </span>
        <span className="detail-timeline-legend-item">one dot = that branch's newest dated release</span>
      </div>
    </section>
  );
}
