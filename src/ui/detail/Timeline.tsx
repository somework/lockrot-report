import type { ExplainMetadata } from "../../model/types";
import { day } from "../../domain/format";
import { sameVersion, timelineLayout, type TimelineLane } from "../../domain/timeline";
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
/**
 * Whether a lane's label grows leftward from its dot rather than rightward: whichever side of the
 * track has more room. Legacy flipped only past 62%, and let a long label spill over the track's
 * edge; the rewrite clipped it at the edge instead, so a dot at 53% with its label on the right
 * lost the end of it ("… · p…"). Where neither side is wide enough, the label wraps.
 */
export function labelGrowsLeft(x: number): boolean {
  return x > 50;
}

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

  // PD-TIMELINE-4 (DESIGN.md §5): a legend entry is drawn only for a state a lane actually carries —
  // the same asymmetry `laneClassName` already reads off `installed`/`newest`, so a report with no
  // branch still releasing past the installed one never claims one in the legend either.
  const hasInstalled = layout.lanes.some((lane) => lane.installed);
  const hasNewestOther = layout.lanes.some((lane) => lane.newest && !lane.installed);

  return (
    <section className="detail-section">
      <h3>Release branches</h3>
      <div className="detail-timeline">
        <div className="detail-timeline-axis">
          {/* PD-TIMELINE-1: the C2 fix (domain/timeline.ts) deliberately keeps a first tick that
              plots left of the earliest dated release, sometimes at or below 0% — centered like
              every other tick (`translateX(-50%)`), half its own width fell outside the axis
              ("24" for "2024" at 1440, gone entirely at 390). Clamped at 0% and left-aligned instead of
              centered, it now grows rightward from the axis's own edge. */}
          {layout.ticks.map((tick, index) => (
            <span
              key={tick.year}
              className={
                index === 0 ? "detail-timeline-tick detail-timeline-tick-first" : "detail-timeline-tick"
              }
              style={{ left: `${Math.max(tick.x, 0)}%` }}
            >
              {tick.year}
            </span>
          ))}
        </div>
        {layout.lanes.map((lane) => {
          // The label grows toward whichever edge is further away, starting just past the dot.
          // It is in the flow of the track, so a label too long for its side wraps — the php
          // constraint moves to a second line — and the lane grows to hold it: nothing is cut.
          const labelPastMidpoint = labelGrowsLeft(lane.x);
          // The 2% gap is a track-relative offset; the dot it must clear is a fixed 9px circle plus,
          // on the installed lane, a 3px glow ring (detail.css) — a fixed footprint a percentage of a
          // narrow track can shrink below. The +8px floor clears that footprint (radius ~7.5px) at
          // every track width instead of only on a wide one.
          const labelStyle = labelPastMidpoint
            ? { marginRight: `calc(${100 - lane.x + 2}% + 8px)` }
            : { marginLeft: `calc(${lane.x + 2}% + 8px)` };

          // PD-TIMELINE-3 (DESIGN.md §5): a package with no maintained branches gives every release
          // its own "branch", named after that same tag — `datedTag`'s label repeats the branch
          // name back with a leading "v" ("0.0.3" branch, "v0.0.3" label). Printed only when it adds
          // information the branch name does not already carry.
          const showLabel = !sameVersion(lane.branch, lane.label);

          return (
            <div key={lane.branch} className={laneClassName(lane)}>
              <span className="detail-timeline-branch">{lane.branch}</span>
              <span className="detail-timeline-track">
                <span className="detail-timeline-dot" style={{ left: `${lane.x}%` }} />
                <span
                  className={labelPastMidpoint ? "detail-timeline-label is-flipped" : "detail-timeline-label"}
                  style={labelStyle}
                >
                  {showLabel ? `${lane.label} · ${day(lane.date)}` : day(lane.date)}
                  {/* A no-break space: a wrapped label keeps "php" next to its constraint. */}
                  {lane.php !== null && ` · php\u00a0${lane.php}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="detail-timeline-legend">
        {/* PD-TIMELINE-4 (DESIGN.md §5): a legend entry only for a state a lane actually carries —
            the same asymmetry `laneClassName` already reads off `installed`/`newest`, so a report
            with no branch still releasing past the installed one never claims one in the legend. */}
        {hasInstalled && (
          <span className="detail-timeline-legend-item">
            <span className="detail-timeline-swatch detail-timeline-swatch-installed" />
            you are on {installedVersion}
          </span>
        )}
        {hasNewestOther && (
          <span className="detail-timeline-legend-item">
            <span className="detail-timeline-swatch detail-timeline-swatch-newest" />
            branch still releasing
          </span>
        )}
        <span className="detail-timeline-legend-item">one dot = that branch's newest dated release</span>
      </div>
    </section>
  );
}
