import type { ComponentChildren } from "preact";
import { day } from "../../domain/format";
import { agePhrase, type TimelineLane, type TimelineRow } from "../../domain/timeline";
import type { Tone } from "../../domain/vocab";
import { toneClass } from "../common/common";
import { useReport } from "../context";

/** A threshold guide on the shared axis: the run's release warn or high years, measured back from
 *  today, drawn in the tone an age past it takes (`domain/age.ts#ageZone`) — so the colour of the
 *  reader's own line has a visible scale beside it, not only the sentence above (PD-TIMELINE-4).
 *  `level` also picks the line's pattern, dashed or dotted, so the two stay apart without colour. */
export interface Guide {
  readonly years: number;
  readonly level: "warn" | "high";
  readonly tone: Tone;
  readonly x: number;
}

/** What the first row is called: the newest, or — when a lower branch released after it — the
 *  highest (`TimelineModel.topReleasedLast`). */
export type TopWord = "newest" | "highest";

/** Past this many characters a php constraint may wrap (timeline.css, `.detail-timeline-php`). */
export const LONG_CONSTRAINT = 14;

/** A CSS custom property as a Preact style object — CSSOM, never a `style="…"` string the page's
 *  CSP would refuse (DESIGN.md §1.3). */
export function at(name: string, x: number): Record<string, string> {
  return { [name]: `${x}%` };
}

export function Sr({ children }: { children: ComponentChildren }) {
  return <span className="detail-timeline-sr">{children}</span>;
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
          className={`detail-timeline-guide is-${guide.level} ${toneClass(guide.tone)}`}
          style={at("--x", guide.x)}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/**
 * The guides' own captions, in the header cell right above where their lines start: the older
 * guide's caption sits left of its line and the younger's right of it, so the two can never run
 * into each other however close a long axis draws them. On the guide, not in the key: a key entry
 * "┃3 ┃5 years ago" read as a count, and a year label beside a guide read as that guide's year.
 * One caption says "ago" ("5y ago", then "3y" reads the same way): the older one when its side of
 * the strip has the room, else the younger one when its side has. `--room` is a caption's own side
 * as a share of the strip, `--other` the older caption's, and timeline.css turns them into a width
 * that is either all of " ago" or none of it — the strip's width is the browser's to decide.
 */
export function GuideCaptions({ guides }: { guides: readonly Guide[] }) {
  const oldest = Math.max(...guides.map((guide) => guide.years));
  const older = guides.length > 1 ? guides.find((guide) => guide.years === oldest) : undefined;
  return (
    <>
      {guides.map((guide) => {
        const left = guide === older;
        const room: Record<string, string> = {
          "--x": `${guide.x}%`,
          "--room": String(left ? guide.x : 100 - guide.x),
          ...(older !== undefined && !left ? { "--other": String(older.x) } : {}),
        };
        return (
          <span
            key={guide.years}
            className={`detail-timeline-guide-cap is-${guide.level} ${left ? "is-left" : "is-right"} ${toneClass(
              guide.tone,
            )}`}
            style={room}
            aria-hidden="true"
          >
            {guide.years}y<span className="detail-timeline-guide-ago"> ago</span>
          </span>
        );
      })}
    </>
  );
}

export function LaneRow({
  lane,
  tone,
  guides,
  releasesOnly,
  topWord,
  folded = false,
}: {
  lane: TimelineLane;
  tone: Tone | null;
  guides: readonly Guide[];
  releasesOnly: boolean;
  topWord: TopWord;
  folded?: boolean;
}) {
  const { now } = useReport();
  const ago = agePhrase(lane.date, now);
  const version = lane.snapshot ? "snapshot" : lane.label;
  // A plain release's version is its own name, so its third cell says when it came out instead —
  // every table keeps the same four columns (PD-TIMELINE-3).
  const third = releasesOnly ? day(lane.date) : lane.snapshot ? "snapshot" : lane.showLabel ? lane.label : "";

  return (
    <div role="row" className={rowClass(lane, tone, folded)}>
      <span role="rowheader" className="detail-timeline-branch">
        {lane.branch}
        {lane.installed && <Sr>, yours</Sr>}
        {lane.newest && <Sr>, the {topWord}</Sr>}
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
      <span role="cell" className="detail-timeline-latest">
        {third}
      </span>
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
 * what a screen reader walks (PD-TIMELINE-9). Nothing rescales on opening — the axis already spans
 * every folded branch.
 */
export function FoldRows({
  fold,
  open,
  onToggle,
  guides,
  releasesOnly,
  topWord,
}: {
  fold: Extract<TimelineRow, { kind: "fold" }>;
  open: boolean;
  onToggle: () => void;
  guides: readonly Guide[];
  releasesOnly: boolean;
  topWord: TopWord;
}) {
  const xs = fold.lanes.map((lane) => lane.x);
  const dates = fold.lanes.map((lane) => day(lane.date)).sort();
  const first = fold.lanes[fold.lanes.length - 1];
  const last = fold.lanes[0];
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
            {fold.lanes.length} {fold.which}
            <Sr> {fold.which === "older" ? nouns : `${nouns}, between the ${topWord} and yours`}</Sr>
          </button>
        </span>
        <span role="cell" className="detail-timeline-strip">
          <Guides guides={guides} />
          {!open && (
            <>
              <span
                className="detail-timeline-rug"
                style={{ "--lo": `${Math.min(...xs)}%`, "--hi": `${Math.max(...xs)}%` }}
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
            topWord={topWord}
            folded
          />
        ))}
    </>
  );
}
