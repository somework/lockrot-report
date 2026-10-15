/** The stacked score bar's layout (SPEC §7.9.5): each term's width as a share of `bar_max`, laid
 *  cumulatively and clipped at its end, and the band ticks. Widths and places are fractions of the
 *  track; the drawing rules (the 4 px minimum, the mark) are the component's. */

import type { Grade, Run, Score } from "../model/report2";
import { isScoreGraded, isTermSecurity } from "../model/report2";
import { securityBand } from "./findingRow2";

export type SegmentRole = "lead" | "corroborating" | "security";

export interface BarSegment {
  readonly flag: string;
  readonly role: SegmentRole;
  readonly band: Grade | null;
  readonly contribution: number;
  /** The share of the track it covers once clipped. */
  readonly width: number;
  /** It crosses the track's end. */
  readonly cut: boolean;
}

export interface ScoreBarLayout {
  readonly segments: readonly BarSegment[];
  readonly over: boolean;
  /** Each tick's place as a share of the track. */
  readonly ticks: readonly number[];
}

const ROLES: readonly string[] = ["lead", "corroborating", "security"];

export function scoreBar(score: Score, run: Run): ScoreBarLayout {
  const model = run.score_model;
  const max = model.bar_max;
  const floors = model.bands.map((band) => band.floor).sort((a, b) => a - b);
  const ticks = floors
    .slice(1)
    .filter((floor) => floor < max)
    .map((floor) => floor / max);
  if (!isScoreGraded(score)) return { segments: [], over: false, ticks };

  const segments: BarSegment[] = [];
  let start = 0;
  for (const term of score.terms) {
    const visible = Math.min(term.contribution, max - start);
    if (visible > 0) {
      segments.push({
        flag: term.flag,
        role: (ROLES.includes(term.role) ? term.role : "lead") as SegmentRole,
        band: isTermSecurity(term)
          ? securityBand(run, term)
          : (model.flags.find((flag) => flag.id === term.flag)?.band ?? null),
        contribution: term.contribution,
        width: visible / max,
        cut: visible < term.contribution,
      });
    }
    start += term.contribution;
  }
  return { segments, over: start > max, ticks };
}
