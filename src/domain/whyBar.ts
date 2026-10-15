/**
 * The Why block's stacked bar and its band ruler (SPEC §7.9.8, §7.9.10) as layout: each segment's
 * share of `score_model.bar_max`, its band by lookup, and the band ticks. The page counts and lays
 * out here; every number comes from the score and its model.
 */

import type { Run, ScoreGraded, Term } from "../model/report2";
import { isTermSecurity } from "../model/report2";

export interface BarSegment {
  readonly flag: string;
  readonly role: string;
  readonly contribution: number;
  /** The grade that tones the segment, by lookup in the model; null for a flag the model does not band. */
  readonly band: string | null;
  /** Percent of the track the segment fills, after the clip at `bar_max`. */
  readonly width: number;
  /** The segment crosses `bar_max` and is cut there. */
  readonly cut: boolean;
}

export interface WhyBar {
  readonly segments: readonly BarSegment[];
  /** The score runs past `bar_max`: the bar shows its overflow mark. */
  readonly over: boolean;
}

/** A maintenance term takes its flag's band; a security term its severity's band, or the no-fix band at × 2. */
export function termBand(term: Term, run: Pick<Run, "score_model">): string | null {
  const model = run.score_model;
  if (isTermSecurity(term)) {
    const severity = model.severities.find((s) => s.id === term.severity);
    if (severity === undefined) return null;
    return term.multiplier === 2 ? severity.band_no_reachable_fix : severity.band;
  }
  return model.flags.find((f) => f.id === term.flag)?.band ?? null;
}

export function whyBar(score: ScoreGraded, run: Pick<Run, "score_model">): WhyBar {
  const max = run.score_model.bar_max;
  let start = 0;
  const segments: BarSegment[] = [];
  for (const term of score.terms) {
    const visible = Math.max(0, Math.min(term.contribution, max - start));
    if (visible > 0) {
      segments.push({
        flag: term.flag,
        role: term.role,
        contribution: term.contribution,
        band: termBand(term, run),
        width: (visible / max) * 100,
        cut: start + term.contribution > max,
      });
    }
    start += term.contribution;
  }
  return { segments, over: start > max };
}

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
