/** The stacked score bar's layout (SPEC §7.9.5): each term's width as a share of `bar_max`, laid
 *  cumulatively and clipped at its end, and the band ticks. Widths and places are fractions of the
 *  track; the drawing rules (the 4 px minimum, the mark) are the component's. */

import type { Grade, Run, Score } from "../model/report";
import { isScoreGraded, isTermSecurity } from "../model/report";
import { securityBand } from "./findingRow";

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
  readonly ticks: readonly BandTick[];
}

export interface BandTick {
  readonly floor: number;
  /** Its place as a share of the track. */
  readonly at: number;
}

/** Every band floor but the lowest, which sits a hair from zero, and none past the track. */
export function bandTicks(run: Run): readonly BandTick[] {
  const max = run.score_model.bar_max;
  return run.score_model.bands
    .map((band) => band.floor)
    .sort((a, b) => a - b)
    .slice(1)
    .filter((floor) => floor < max)
    .map((floor) => ({ floor, at: floor / max }));
}

const ROLES: readonly string[] = ["lead", "corroborating", "security"];

export function scoreBar(score: Score, run: Run): ScoreBarLayout {
  const model = run.score_model;
  const max = model.bar_max;
  const ticks = bandTicks(run);
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
