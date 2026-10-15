import { useState } from "preact/hooks";
import type { Finding, RepositoryMetadata, Run } from "../../model/report2";
import {
  branchTimeline,
  laneWords,
  TIMELINE_WORDS,
  xOfYears,
  type AgeGuide,
  type BranchLane,
  type BranchTimelineRow,
} from "../../domain/branchTimeline";
import { toneClass } from "../common/common";
import "../detail/timeline.css";
import "../detail/timeline-forced.css";

// A CSS custom property through CSSOM, never a `style="…"` string the page's CSP would refuse.
const at = (name: string, x: number): Record<string, string> => ({ [name]: `${x}%` });

/** Past this many characters a php constraint may wrap (timeline.css, `.is-long`). */
const LONG_PHP = 14;

const GUIDE_TONE = { warn: "med", high: "crit" } as const;
const LEVEL_TONE = { warn: "med", high: "crit" } as const;

function Sr({ children }: { children: string }) {
  return <span className="detail-timeline-sr">{children}</span>;
}

function Guides({ guides, span }: { guides: readonly AgeGuide[]; span: number }) {
  return (
    <>
      {guides.map((guide) => (
        <span
          key={guide.level}
          className={`detail-timeline-guide is-${guide.level} ${toneClass(GUIDE_TONE[guide.level])}`}
          style={at("--x", xOfYears(guide.years, span))}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

interface LaneProps {
  lane: BranchLane;
  span: number;
  guides: readonly AgeGuide[];
  level: "warn" | "high" | null;
  folded?: boolean;
}

function LaneRow({ lane, span, guides, level, folded = false }: LaneProps) {
  const tone = lane.installed && level !== null ? LEVEL_TONE[level] : null;
  const classes = [
    "detail-timeline-row",
    ...(lane.installed ? ["is-mine"] : []),
    ...(lane.newest ? ["is-newest"] : []),
    ...(folded ? ["is-folded"] : []),
    ...(tone === null ? [] : ["is-toned", toneClass(tone)]),
  ].join(" ");
  const words = laneWords(lane);
  return (
    <div role="row" className={classes} data-branch={lane.branch}>
      <span role="rowheader" className="detail-timeline-branch">
        {lane.branch}
        {lane.installed && <Sr>{TIMELINE_WORDS.yours}</Sr>}
        {lane.newest && <Sr>{TIMELINE_WORDS.newest}</Sr>}
      </span>
      <span
        role="cell"
        className="detail-timeline-strip"
        style={lane.years === null ? undefined : at("--x", xOfYears(lane.years, span))}
        title={words}
      >
        <Guides guides={guides} span={span} />
        {lane.years !== null && (
          <>
            <span className="detail-timeline-tail" aria-hidden="true" />
            <span className="detail-timeline-dot" aria-hidden="true" />
          </>
        )}
        <Sr>{words}</Sr>
      </span>
      <span role="cell" className="detail-timeline-latest">
        {lane.version}
      </span>
      <span
        role="cell"
        className={
          lane.php !== null && lane.php.length > LONG_PHP
            ? "detail-timeline-php is-long"
            : "detail-timeline-php"
        }
      >
        {lane.php ?? (
          <>
            <span aria-hidden="true">—</span>
            <Sr>{TIMELINE_WORDS.noPhp}</Sr>
          </>
        )}
      </span>
    </div>
  );
}

function FoldRows({
  fold,
  span,
  guides,
  open,
  onToggle,
}: {
  fold: Extract<BranchTimelineRow, { kind: "fold" }>;
  span: number;
  guides: readonly AgeGuide[];
  open: boolean;
  onToggle: () => void;
}) {
  const xs = fold.lanes.flatMap((l) => (l.years === null ? [] : [xOfYears(l.years, span)]));
  const first = fold.lanes.at(-1);
  const last = fold.lanes[0];
  return (
    <>
      <div role="row" className={`detail-timeline-row detail-timeline-fold${open ? " is-open" : ""}`}>
        <span role="rowheader" className="detail-timeline-branch">
          <button type="button" className="detail-timeline-fold-btn" aria-expanded={open} onClick={onToggle}>
            {fold.lanes.length} {fold.which}
            <Sr>{` ${fold.which === "older" ? TIMELINE_WORDS.older : TIMELINE_WORDS.between}`}</Sr>
          </button>
        </span>
        <span role="cell" className="detail-timeline-strip">
          <Guides guides={guides} span={span} />
          {!open && xs.length > 0 && (
            <>
              <span
                className="detail-timeline-rug"
                style={{ "--lo": `${Math.min(...xs)}%`, "--hi": `${Math.max(...xs)}%` }}
                aria-hidden="true"
              />
              {xs.map((x, i) => (
                <span key={i} className="detail-timeline-rug-tick" style={at("--x", x)} aria-hidden="true" />
              ))}
            </>
          )}
        </span>
        <span role="cell" className="detail-timeline-range">
          {first?.branch} – {last?.branch}
        </span>
      </div>
      {open &&
        fold.lanes.map((lane) => (
          <LaneRow key={lane.branch} lane={lane} span={span} guides={guides} level={null} folded />
        ))}
    </>
  );
}

/** The 0.13 timeline redrawn from report-2 (SPEC §7.9.8): bars are published years, `summaryId`
 *  names the Release branches line that is the table's text equivalent. */
export function BranchTimeline2({
  finding,
  metadata,
  run,
  summaryId,
}: {
  finding: Finding;
  metadata: RepositoryMetadata | null;
  run: Run;
  summaryId: string;
}) {
  const [openFolds, setOpenFolds] = useState<readonly string[]>([]);
  const timeline = branchTimeline(finding, metadata, run);
  if (timeline === null) return null;
  const { span, guides } = timeline;
  const toggle = (which: string): void => {
    setOpenFolds((open) => (open.includes(which) ? open.filter((w) => w !== which) : [...open, which]));
  };

  const lanes = timeline.rows.flatMap((row) => (row.kind === "lane" ? [row.lane] : row.lanes));

  return (
    <>
      <div role="table" className="detail-timeline-grid d2-timeline" aria-describedby={summaryId}>
        <div role="row" className="detail-timeline-row detail-timeline-head">
          <span role="columnheader">{TIMELINE_WORDS.branch}</span>
          <span role="columnheader" className="detail-timeline-strip-head">
            <Sr>{TIMELINE_WORDS.strip}</Sr>
            {guides.map((guide) => (
              <span
                key={guide.level}
                className={`detail-timeline-guide-cap is-${guide.level} ${guide.level === "high" && guides.length > 1 ? "is-left" : "is-right"} ${toneClass(GUIDE_TONE[guide.level])}`}
                style={at("--x", xOfYears(guide.years, span))}
                aria-hidden="true"
              >
                {TIMELINE_WORDS.years.replace("{n}", String(guide.years))}
              </span>
            ))}
          </span>
          <span role="columnheader">{TIMELINE_WORDS.latest}</span>
          <span role="columnheader">{TIMELINE_WORDS.php}</span>
        </div>
        {timeline.rows.map((row) =>
          row.kind === "lane" ? (
            <LaneRow
              key={row.lane.branch}
              lane={row.lane}
              span={span}
              guides={guides}
              level={timeline.installedLevel}
            />
          ) : (
            <FoldRows
              key={row.which}
              fold={row}
              span={span}
              guides={guides}
              open={openFolds.includes(row.which)}
              onToggle={() => {
                toggle(row.which);
              }}
            />
          ),
        )}
        <div className="detail-timeline-row detail-timeline-axis-row" aria-hidden="true">
          <span />
          <span className="detail-timeline-axis">
            <span className="detail-timeline-year is-first" style={at("--x", 0)}>
              {TIMELINE_WORDS.years.replace("{n}", String(span))}
            </span>
            <span className="detail-timeline-today">0</span>
          </span>
        </div>
      </div>
      <div className="detail-timeline-key" aria-hidden="true">
        {lanes.some((l) => l.installed) && (
          <span className="detail-timeline-key-item">
            <span className="detail-timeline-swatch is-mine" />
            {TIMELINE_WORDS.you}
          </span>
        )}
        {lanes.some((l) => l.newest) && (
          <span className="detail-timeline-key-item">
            <span className="detail-timeline-swatch is-newest" />
            {TIMELINE_WORDS.newestKey}
          </span>
        )}
        <span className="detail-timeline-key-item">
          <span className="detail-timeline-swatch-line" />
          {TIMELINE_WORDS.line}
        </span>
        {guides.length > 0 && (
          <span className="detail-timeline-key-item">
            <span className="detail-timeline-swatch-guide" />
            {TIMELINE_WORDS.guide}
          </span>
        )}
      </div>
    </>
  );
}
