/** The shared age axis of the Findings rows, fixed by the run's thresholds. */

export type Thresholds = readonly (readonly [name: string, years: number])[];

function thresholdYears(thresholds: Thresholds, name: string): number | null {
  for (const [n, years] of thresholds) {
    if (n === name) return years;
  }
  return null;
}

/** The fewest years the shared axis ever spans, whatever the run's own `high` threshold says. */
const AXIS_FLOOR_YEARS = 10;

export interface AgeAxis {
  readonly warn: number;
  readonly high: number;
  /** The axis' right edge: `max(10, 2 × high)`. An age past it runs to the edge and says so. */
  readonly max: number;
}

/** One axis for every Findings row (PD-ROWS-4), fixed by the run's `high` threshold rather than the
 *  oldest row, so a filter never rescales the bars: `max(10, 2 × high)`. The release pair when the
 *  run recorded it, else the push pair. */
export function ageAxis(thresholds: Thresholds): AgeAxis | null {
  const legend = pair(thresholds, "release") ?? pair(thresholds, "push");
  if (legend === null) return null;
  return { ...legend, max: Math.max(AXIS_FLOOR_YEARS, 2 * legend.high) };
}

function pair(thresholds: Thresholds, kind: "release" | "push"): { warn: number; high: number } | null {
  const warn = thresholdYears(thresholds, `${kind}-warn-years`);
  const high = thresholdYears(thresholds, `${kind}-high-years`);
  return warn !== null && high !== null ? { warn, high } : null;
}
