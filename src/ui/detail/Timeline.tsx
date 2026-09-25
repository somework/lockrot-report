import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { ExplainLock, ExplainMetadata } from "../../model/types";
import { ageZone, releaseThresholds } from "../../domain/age";
import { day, plural } from "../../domain/format";
import {
  agePhrase,
  timelineModel,
  yearsSince,
  type TimelineLane,
  type TimelineModel,
  type TimelineRow,
} from "../../domain/timeline";
import type { Tone } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { useReport } from "../context";
import "./detail.css";

/** A threshold guide on the shared axis: the run's release warn/high years, measured back from
 *  today, drawn in the tone an age past it takes (`domain/age.ts#ageZone`) — so the colour of the
 *  reader's own line has a visible scale beside it, not only the sentence above (PD-TIMELINE-4). */
interface Guide {
  readonly years: number;
  readonly tone: Tone;
  readonly x: number;
}

/** Past this many characters a php constraint may wrap (detail.css, `.detail-timeline-php`). */
const LONG_CONSTRAINT = 14;

/** A CSS custom property as a Preact style object — CSSOM, never a `style="…"` string the page's
 *  CSP would refuse (DESIGN.md §1.3). */
function at(name: string, x: number): Record<string, string> {
  return { [name]: `${x}%` };
}

function Sr({ children }: { children: ComponentChildren }) {
  return <span className="detail-timeline-sr">{children}</span>;
}

/**
 * "Release branches", answer first (PD-TIMELINE-1..8, DESIGN.md §5): two sentences that say where
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
  const toneOf = (lane: TimelineLane): Tone | null =>
    thresholds === null ? null : ageZone(yearsSince(lane.date, now), thresholds.warn, thresholds.high);
  const guides: Guide[] =
    thresholds === null
      ? []
      : [
          { years: thresholds.warn, tone: "med" as const },
          { years: thresholds.high, tone: "crit" as const },
        ].flatMap((guide) => {
          const x = timeline.xOfYearsAgo(guide.years);
          return x === null ? [] : [{ ...guide, x }];
        });
  const toggle = (which: string): void => {
    setOpenFolds((open) => (open.includes(which) ? open.filter((w) => w !== which) : [...open, which]));
  };
  const noun = timeline.releasesOnly ? "release" : "branch";

  return (
    <section className="detail-section detail-timeline">
      <h3>{timeline.releasesOnly ? "Release history" : "Release branches"}</h3>
      <Answer
        timeline={timeline}
        installedVersion={installedVersion}
        tone={timeline.mine ? toneOf(timeline.mine) : null}
      />
      <div
        role="table"
        className={timeline.releasesOnly ? "detail-timeline-grid is-releases" : "detail-timeline-grid"}
        aria-label={`${timeline.releasesOnly ? "Releases" : "Release branches"}, ${
          timeline.sortedBy === "version" ? "newest version first" : "most recent release first"
        }`}
      >
        <div role="row" className="detail-timeline-row detail-timeline-head">
          <span
            role="columnheader"
            aria-sort="descending"
            title={timeline.sortedBy === "version" ? "newest version first" : "most recent release first"}
          >
            {noun}
            <span className="detail-timeline-order" aria-hidden="true">
              ↓
            </span>
          </span>
          <span role="columnheader">
            <Sr>time since the last release, on one axis ending today</Sr>
          </span>
          {!timeline.releasesOnly && <span role="columnheader">latest</span>}
          <span role="columnheader">PHP</span>
        </div>
        {timeline.rows.map((row) =>
          row.kind === "lane" ? (
            <LaneRow
              key={row.lane.branch}
              lane={row.lane}
              tone={row.lane.installed ? toneOf(row.lane) : null}
              guides={guides}
              releasesOnly={timeline.releasesOnly}
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
              releasesOnly={timeline.releasesOnly}
            />
          ),
        )}
        {/* The axis sits under the rows, not in the header: "today" above the rule butted into the
            LATEST header beside it and read as one phrase ("today LATEST"). Decorative — every row's
            own cell already carries its date for a screen reader. */}
        <div className="detail-timeline-row detail-timeline-axis-row" aria-hidden="true">
          <span />
          <span className="detail-timeline-axis">
            {timeline.ticks.map((tick, index) => (
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
      </div>
      <Key timeline={timeline} guides={guides} />
    </section>
  );
}

/** The two answer sentences. Every number is a date lockrot wrote or the time between it and `now`. */
function Answer({
  timeline,
  installedVersion,
  tone,
}: {
  timeline: TimelineModel;
  installedVersion: string;
  tone: Tone | null;
}) {
  const { now } = useReport();
  const { mine, top, releasesOnly } = timeline;
  const noun = releasesOnly ? "release" : "branch";
  const nouns = releasesOnly ? "releases" : "branches";
  const age = (lane: TimelineLane) => (
    <b className={tone === null ? "detail-timeline-age" : `detail-timeline-age is-toned ${toneClass(tone)}`}>
      {agePhrase(lane.date, now)}
    </b>
  );
  const name = (text: string) => <b className="detail-timeline-name">{text}</b>;
  const newestFacts = (
    <>
      <b className="mono detail-timeline-go">{top.branch}</b>,{" "}
      {top.showLabel ? (
        <>
          released <span className="mono">{top.label}</span> on{" "}
        </>
      ) : (
        "released on "
      )}
      <span className="nowrap">{day(top.date)}</span>{" "}
      <span className="nowrap">({agePhrase(top.date, now)} ago)</span>
      {top.php !== null && (
        <>
          {" "}
          and requires php{" "}
          <span className={top.php.length > LONG_CONSTRAINT ? "mono" : "mono nowrap"}>{top.php}</span>
        </>
      )}
      .
    </>
  );

  let lead: ComponentChildren;
  let sub: ComponentChildren;
  if (mine?.snapshot) {
    lead = (
      <>
        You’re on {name(mine.branch)}, a branch snapshot, not a release, dated {age(mine)} ago.
      </>
    );
    sub = (
      <>
        The newest release {noun} is {newestFacts}
      </>
    );
  } else if (mine === null) {
    lead = (
      <>
        You’re on {name(installedVersion)}; none of these {nouns} is marked as yours.
      </>
    );
    sub = (
      <>
        The newest {noun} is {newestFacts}
      </>
    );
  } else if (timeline.newerCount === 0) {
    const others = timeline.lanes.length - 1;
    lead = (
      <>
        You’re on the newest {noun}, {name(mine.branch)}.{" "}
        {releasesOnly ? <>It came out {age(mine)} ago.</> : <>Its last release was {age(mine)} ago.</>}
      </>
    );
    sub =
      others === 1 ? (
        <>
          Nothing newer has been released; the only other {noun},{" "}
          <span className="mono">{timeline.lanes[1]?.branch}</span>, is older.
        </>
      ) : (
        <>Nothing newer has been released; the other {plural(others, noun, nouns)} are older.</>
      );
  } else {
    lead = (
      <>
        You’re on {name(mine.branch)}. Its last release was {age(mine)} ago.
      </>
    );
    sub =
      timeline.newerCount === 1 ? (
        <>
          There is <b>1 newer {noun}</b>: {newestFacts}
        </>
      ) : (
        <>
          There are <b>{plural(timeline.newerCount, `newer ${noun}`, `newer ${nouns}`)}</b>. The newest is{" "}
          {newestFacts}
        </>
      );
  }

  return (
    <>
      <p className="detail-timeline-answer">{lead}</p>
      <p className="detail-timeline-sub">{sub}</p>
    </>
  );
}

function rowClass(lane: TimelineLane, tone: Tone | null, folded: boolean): string {
  const classes = ["detail-timeline-row"];
  if (lane.installed) classes.push("is-mine");
  if (lane.snapshot) classes.push("is-snapshot");
  if (lane.newest) classes.push("is-newest");
  if (folded) classes.push("is-folded");
  if (tone !== null) classes.push("is-toned", toneClass(tone));
  return classes.join(" ");
}

function Guides({ guides }: { guides: readonly Guide[] }) {
  return (
    <>
      {guides.map((guide) => (
        <span
          key={guide.years}
          className={`detail-timeline-guide ${toneClass(guide.tone)}`}
          style={at("--x", guide.x)}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function LaneRow({
  lane,
  tone,
  guides,
  releasesOnly,
  folded = false,
}: {
  lane: TimelineLane;
  tone: Tone | null;
  guides: readonly Guide[];
  releasesOnly: boolean;
  folded?: boolean;
}) {
  const { now } = useReport();
  const ago = agePhrase(lane.date, now);
  const version = lane.snapshot ? "snapshot" : lane.label;

  return (
    <div role="row" className={rowClass(lane, tone, folded)}>
      <span role="rowheader" className="detail-timeline-branch">
        {lane.branch}
        {lane.installed && <Sr>, yours</Sr>}
        {lane.newest && <Sr>, the newest</Sr>}
      </span>
      <span
        role="cell"
        className="detail-timeline-strip"
        style={at("--x", lane.x)}
        title={`${version} · ${day(lane.date)} · ${ago} ago`}
      >
        <Guides guides={guides} />
        <span className="detail-timeline-tail" aria-hidden="true" />
        <span className="detail-timeline-dot" aria-hidden="true" />
        <Sr>
          {lane.snapshot ? "snapshot dated" : "last release"} {day(lane.date)}, {ago} ago
        </Sr>
      </span>
      {!releasesOnly && (
        <span role="cell" className="detail-timeline-latest">
          {lane.snapshot ? "snapshot" : lane.showLabel ? lane.label : ""}
        </span>
      )}
      <span
        role="cell"
        className={
          lane.php !== null && lane.php.length > LONG_CONSTRAINT
            ? "detail-timeline-php is-long"
            : "detail-timeline-php"
        }
      >
        {lane.php ?? (
          <>
            <span aria-hidden="true">—</span>
            <Sr>none recorded</Sr>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * A fold: one row standing for several branches, with a tick per branch on the same axis (a rug),
 * and a button that inserts their own rows below it. A button inside the row header rather than a
 * native `<details>`: a `<details>` cannot be a table row, and the table's row/cell structure is
 * what a screen reader walks (PD-TIMELINE-6). Nothing rescales on opening — the axis already spans
 * every folded branch.
 */
function FoldRows({
  fold,
  open,
  onToggle,
  guides,
  releasesOnly,
}: {
  fold: Extract<TimelineRow, { kind: "fold" }>;
  open: boolean;
  onToggle: () => void;
  guides: readonly Guide[];
  releasesOnly: boolean;
}) {
  const xs = fold.lanes.map((lane) => lane.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const dates = fold.lanes.map((lane) => day(lane.date)).sort();
  const first = fold.lanes[fold.lanes.length - 1];
  const last = fold.lanes[0];
  const count = fold.lanes.length;
  const nouns = releasesOnly ? "releases" : "branches";

  return (
    <>
      <div
        role="row"
        className={
          open
            ? "detail-timeline-row detail-timeline-fold is-open"
            : "detail-timeline-row detail-timeline-fold"
        }
      >
        <span role="rowheader" className="detail-timeline-branch">
          <button type="button" className="detail-timeline-fold-btn" aria-expanded={open} onClick={onToggle}>
            {count} {fold.which}
            <Sr> {fold.which === "older" ? nouns : `${nouns}, between the newest and yours`}</Sr>
          </button>
        </span>
        <span role="cell" className="detail-timeline-strip">
          <Guides guides={guides} />
          {!open && (
            <>
              <span
                className="detail-timeline-rug"
                style={{ "--lo": `${lo}%`, "--hi": `${hi}%` }}
                aria-hidden="true"
              />
              {fold.lanes.map((lane) => (
                <span
                  key={lane.branch}
                  className="detail-timeline-rug-tick"
                  style={at("--x", lane.x)}
                  aria-hidden="true"
                />
              ))}
            </>
          )}
          <Sr>
            last released between {dates[0]} and {dates[dates.length - 1]}
          </Sr>
        </span>
        <span role="cell" className="detail-timeline-range">
          {first?.branch} – {last?.branch}
        </span>
      </div>
      {open &&
        fold.lanes.map((lane) => (
          <LaneRow
            key={lane.branch}
            lane={lane}
            tone={null}
            guides={guides}
            releasesOnly={releasesOnly}
            folded
          />
        ))}
    </>
  );
}

/** One line, only for what this timeline draws: the reader's marker (a ring, or a diamond for a
 *  snapshot — one shape in every case, never an age colour), the newest branch's, the line, and
 *  the threshold guides with the years they stand for. */
function Key({ timeline, guides }: { timeline: TimelineModel; guides: readonly Guide[] }) {
  const mine = timeline.mine;
  return (
    <p className="detail-timeline-key">
      {mine !== null && (
        <span className="detail-timeline-key-item">
          <span
            className={
              mine.snapshot ? "detail-timeline-swatch is-snapshot" : "detail-timeline-swatch is-mine"
            }
            aria-hidden="true"
          />
          you
        </span>
      )}
      {timeline.top.newest && (
        <span className="detail-timeline-key-item">
          <span className="detail-timeline-swatch is-newest" aria-hidden="true" />
          newest
        </span>
      )}
      <span className="detail-timeline-key-item">
        <span className="detail-timeline-swatch-line" aria-hidden="true" />
        time since its last release
      </span>
      {guides.length > 0 && (
        <span className="detail-timeline-key-item">
          {guides.map((guide, index) => (
            <span key={guide.years} className="detail-timeline-key-guide">
              <span className={`detail-timeline-swatch-guide ${toneClass(guide.tone)}`} aria-hidden="true" />
              {guide.years}
              {index === guides.length - 1 ? " years ago" : ""}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}
