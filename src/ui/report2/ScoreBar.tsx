import type { Run, Score } from "../../model/report2";
import { gradeTone } from "../../domain/findingRow2";
import { scoreBar, type BarSegment } from "../../domain/scoreBar";
import { toneClass } from "../common/common";
import "./scoreBar.css";

/** One block is two points: the bar's only renderer constant (SPEC §7.9.9). */
const BLOCK_POINTS = 2;
/** A segment this many blocks wide prints its number where colour cannot carry it (forced colours,
 *  paper). */
const LABEL_BLOCKS = 6;

const share = (fraction: number): string => `${fraction * 100}%`;

/** The segment classes the detail sheet's Why bar reuses. */
export function segmentClass(segment: Pick<BarSegment, "role" | "band">): string {
  return `sbar-seg is-${segment.role} ${toneClass(gradeTone(segment.band))}`;
}

/**
 * The stacked score bar (SPEC §7.9.5). Hidden from a screen reader: the row's text holds the total
 * and the group head the grade. `score.text` is a tooltip only, never a name.
 */
export function ScoreBar({ score, run }: { score: Score; run: Run }) {
  const bar = scoreBar(score, run);
  return (
    <span className={bar.over ? "sbar is-over" : "sbar"} aria-hidden="true" title={score.text}>
      {bar.ticks.map((tick) => (
        <span key={tick.floor} className="sbar-tick" style={{ left: share(tick.at) }} />
      ))}
      <span className="sbar-fill">
        {bar.segments.map((segment, i) => (
          <span
            key={`${i}-${segment.flag}`}
            className={segment.cut ? `${segmentClass(segment)} is-cut` : segmentClass(segment)}
            style={{ width: `max(var(--sbar-seg-min), ${share(segment.width)})` }}
          >
            {segment.contribution >= LABEL_BLOCKS * BLOCK_POINTS && (
              <span className="sbar-n">{segment.contribution}</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
