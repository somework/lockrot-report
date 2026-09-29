import { useState } from "preact/hooks";
import type { ExplainMetadata } from "../../model/types";
import { ageZone, releaseThresholds } from "../../domain/age";
import {
  timelineModel,
  yearsSince,
  type SnapshotCommit,
  type TimelineLane,
  type TimelineTick,
} from "../../domain/timeline";
import type { Tone } from "../../domain/vocab";
import { useReport } from "../context";
import { Answer, DatedBy, Key } from "./TimelineAnswer";
import { FoldRows, GuideCaptions, LaneRow, Sr, at, type Guide, type TopWord } from "./TimelineRows";
import { placeYears } from "./timelineAxis";
import "./timeline.css";
import "./timeline-forced.css";

/** "Release branches", answer first (PD-TIMELINE-1..12, DESIGN.md §5); `domain/timeline.ts`
 *  decides the rows, this only draws them. */
export function Timeline({
  metadata,
  snapshot,
  installedVersion,
  ageToned = true,
}: {
  metadata: ExplainMetadata | null;
  snapshot: SnapshotCommit | null;
  installedVersion: string;
  /** False when the verdict does not rest on age: the age stays in ink here as it does above. */
  ageToned?: boolean;
}) {
  const { model, now } = useReport();
  const [openFolds, setOpenFolds] = useState<readonly string[]>([]);
  const timeline = timelineModel(metadata?.branches ?? [], snapshot, installedVersion, now);
  if (timeline === null) return null;

  const thresholds = releaseThresholds(model.report.run.thresholds);
  // A snapshot's date is a checkout, not a release: it never takes the release-age tone.
  const toneOf = (lane: TimelineLane): Tone | null =>
    thresholds === null || lane.snapshot || !ageToned
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
  const snapshotFirst = timeline.rows[0]?.kind === "lane" && timeline.rows[0].lane.snapshot;
  const order = snapshotFirst ? "snapshot first" : "highest first";

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
          <span role="columnheader" aria-sort={snapshotFirst ? "other" : "descending"} title={order}>
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
      <Key timeline={timeline} topWord={topWord} guides={guides.length > 0} />
      <DatedBy timeline={timeline} />
    </section>
  );
}

/** Under the rows, not in the header, where "today" would read as one phrase with "LATEST".
 *  Decorative: every row's own cell carries its date. */
function Axis({ ticks, guides }: { ticks: readonly TimelineTick[]; guides: readonly Guide[] }) {
  const years = placeYears(
    ticks,
    guides.map((guide) => guide.x),
  );
  return (
    <div className="detail-timeline-row detail-timeline-axis-row" aria-hidden="true">
      <span />
      <span className="detail-timeline-axis">
        {years.map((year) => (
          <span
            key={year.year}
            className={[
              "detail-timeline-year",
              `is-${year.place}`,
              ...year.keptAt.map((w) => `is-kept-${w}`),
            ].join(" ")}
            style={at("--x", year.x)}
          >
            {year.year}
          </span>
        ))}
        <span className="detail-timeline-today">today</span>
      </span>
    </div>
  );
}
