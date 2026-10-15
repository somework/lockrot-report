/**
 * The Why block's band ruler (SPEC §7.9.8, §7.9.10) as layout: a tick at each band floor and a zone
 * of each band's tone up to the next floor. The bar itself is `scoreBar()`'s, shared with the
 * Findings rows.
 */

import type { Run } from "../model/report";
import type { ScoreBarLayout } from "./scoreBar";

export interface RulerTick {
  readonly floor: number;
  readonly verdict: string;
  /** Percent along the track. */
  readonly at: number;
}

export interface RulerZone {
  readonly verdict: string;
  readonly from: number;
  readonly width: number;
}

export interface BandRuler {
  readonly ticks: readonly RulerTick[];
  readonly zones: readonly RulerZone[];
  readonly max: number;
}

/** Ticks at each band's floor but the lowest, whose floor would sit on zero (Q8); zones from each floor to the next. */
export function bandRuler(run: Pick<Run, "score_model">): BandRuler {
  const max = run.score_model.bar_max;
  const bands = [...run.score_model.bands].filter((b) => b.floor < max).sort((a, b) => a.floor - b.floor);
  const place = (floor: number): number => (floor / max) * 100;
  return {
    ticks: bands.slice(1).map((b) => ({ floor: b.floor, verdict: b.verdict, at: place(b.floor) })),
    zones: bands.map((b, i) => {
      const from = i === 0 ? 0 : place(b.floor);
      const to = place(bands[i + 1]?.floor ?? max);
      return { verdict: b.verdict, from, width: to - from };
    }),
    max,
  };
}

/** The legend lane as one line of text, for a reader who cannot see the bar: "left-behind 16, old-promise 4". */
export const legendText = (bar: ScoreBarLayout): string =>
  bar.segments.map((segment) => `${segment.flag} ${segment.contribution}`).join(", ");
