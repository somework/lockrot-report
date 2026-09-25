import { useState } from "preact/hooks";
import type { ExplainLock, ExplainMetadata } from "../../model/types";
import { ageZone, releaseThresholds } from "../../domain/age";
import { timelineModel, yearsSince, type TimelineLane, type TimelineTick } from "../../domain/timeline";
import type { Tone } from "../../domain/vocab";
import { useReport } from "../context";
import { Answer, Key } from "./TimelineAnswer";
import { FoldRows, GuideCaptions, LaneRow, Sr, at, type Guide, type TopWord } from "./TimelineRows";
import "./timeline.css";

/** How close (in % of the axis) a year label may sit to a threshold guide before it is dropped: a
 *  year printed beside a dashed guide read as that guide's own date. The left-edge year stays. */
const NEAR_GUIDE = 10;

/**
 * "Release branches", answer first (PD-TIMELINE-1..9, DESIGN.md §5): two sentences that say where
 * the reader is and what is newer, then one row per branch that matters on one shared time axis
 * ending at a "today" rule — the line from each dot to that rule is the time since that branch's
 * last release. Rows sort newest version first; the reader's own row and the newest one carry the
 * weight, everything older than the reader's folds into one row. `domain/timeline.ts` decides all
 * of that; this only draws it. Renders nothing when fewer than two rows would be drawn.
 */
export function Timeline({
  metadata,
  lock,
  installedVersion,
}: {
  metadata: ExplainMetadata | null;
  lock: ExplainLock | null;
  installedVersion: string;
}) {
  const { model, now } = useReport();
  const [openFolds, setOpenFolds] = useState<readonly string[]>([]);
  const timeline = timelineModel(metadata?.branches ?? [], lock, installedVersion, now);
  if (timeline === null) return null;

  const thresholds = releaseThresholds(model.report.run.thresholds);
  // A snapshot's date is a checkout, not a release: it never takes the release-age tone.
  const toneOf = (lane: TimelineLane): Tone | null =>
    thresholds === null || lane.snapshot
      ? null
      : ageZone(yearsSince(lane.date, now), thresholds.warn, thresholds.high);
  const guides: Guide[] =
    thresholds === null
      ? []
      : [
          { years: thresholds.warn, level: "warn" as const, tone: "med" as const },
          { years: thresholds.high, level: "high" as const, tone: "crit" as const },
        ].flatMap((guide) => {
          const x = timeline.xOfYearsAgo(guide.years);
          return x === null ? [] : [{ ...guide, x }];
        });
  const toggle = (which: string): void => {
    setOpenFolds((open) => (open.includes(which) ? open.filter((w) => w !== which) : [...open, which]));
  };
  const { releasesOnly } = timeline;
  const topWord: TopWord = timeline.topReleasedLast ? "newest" : "highest";
  const order = timeline.sortedBy === "version" ? "newest version first" : "most recent release first";

  return (
    <section className="detail-section detail-timeline">
      <h3>{releasesOnly ? "Release history" : "Release branches"}</h3>
      <Answer
        timeline={timeline}
        installedVersion={installedVersion}
        tone={timeline.mine ? toneOf(timeline.mine) : null}
        topWord={topWord}
      />
      <div
        role="table"
        className="detail-timeline-grid"
        aria-label={`${releasesOnly ? "Releases" : "Release branches"}, ${order}`}
      >
        <div role="row" className="detail-timeline-row detail-timeline-head">
          <span role="columnheader" aria-sort="descending" title={order}>
            {releasesOnly ? "release" : "branch"}
            <span className="detail-timeline-order" aria-hidden="true">
              ↓
            </span>
          </span>
          <span role="columnheader" className="detail-timeline-strip-head">
            <Sr>time since the last release, on one axis ending today</Sr>
            <GuideCaptions guides={guides} />
          </span>
          <span role="columnheader">{releasesOnly ? "released" : "latest"}</span>
          <span role="columnheader">PHP</span>
        </div>
        {timeline.rows.map((row) =>
          row.kind === "lane" ? (
            <LaneRow
              key={row.lane.branch}
              lane={row.lane}
              tone={row.lane.installed ? toneOf(row.lane) : null}
              guides={guides}
              releasesOnly={releasesOnly}
              topWord={topWord}
            />
          ) : (
            <FoldRows
              key={row.which}
              fold={row}
              open={openFolds.includes(row.which)}
              onToggle={() => {
                toggle(row.which);
              }}
              guides={guides}
              releasesOnly={releasesOnly}
              topWord={topWord}
            />
          ),
        )}
        <Axis ticks={timeline.ticks} guides={guides} />
      </div>
      <Key timeline={timeline} topWord={topWord} />
    </section>
  );
}

/** The axis sits under the rows, not in the header: "today" above the rule butted into the LATEST
 *  header beside it and read as one phrase ("today LATEST"). Each year hangs from a hairline tick,
 *  so its label is tied to a point on the axis rather than to the nearest guide. Decorative — every
 *  row's own cell already carries its date for a screen reader. */
function Axis({ ticks, guides }: { ticks: readonly TimelineTick[]; guides: readonly Guide[] }) {
  const shown = ticks.filter(
    (tick, index) => index === 0 || guides.every((guide) => Math.abs(guide.x - tick.x) > NEAR_GUIDE),
  );
  return (
    <div className="detail-timeline-row detail-timeline-axis-row" aria-hidden="true">
      <span />
      <span className="detail-timeline-axis">
        {shown.map((tick, index) => (
          <span
            key={tick.year}
            className={index === 0 ? "detail-timeline-year is-first" : "detail-timeline-year"}
            style={at("--x", tick.x)}
          >
            {tick.year}
          </span>
        ))}
        <span className="detail-timeline-today">today</span>
      </span>
    </div>
  );
}
