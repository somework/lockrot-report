import type { AgeScale as AgeScaleData, AgeKind } from "../../domain/age";
import type { Tone } from "../../domain/vocab";
import { toneClass } from "../common/common";
import "./views.css";

/** How each kind reads at the front of the scale's aria-label, matching the wording `domain/age.ts`
 *  and the finding's own signal summary already use for the same fact. */
const LEAD: Readonly<Record<AgeKind, string>> = {
  branch: "installed branch last released",
  release: "last release",
  push: "last push",
};

/** 0-100, clamped: `scale.max` already keeps `years` on the track (`domain/age.ts`'s own
 *  `max(10, ceil(years))`), but a threshold the run set above `max` — an unusual config, not a
 *  document this renderer can rule out — would otherwise draw a tick past the track's right edge. */
function pct(value: number, max: number): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** Below `warn` reads as fine, `warn`..`high` as a caution, at or above `high` as the same tone a
 *  critical verdict pill carries — the dot's own colour is the scale's whole point (PD-ROWS-2: a
 *  reader who skips the label still sees the zone at a glance). */
function zoneTone(scale: AgeScaleData): Tone {
  if (scale.years >= scale.high) return "crit";
  if (scale.years >= scale.warn) return "med";
  return "none";
}

/**
 * The Findings row's age scale (PD-ROWS-2, DESIGN.md §5): a thin track from 0 to `scale.max` years,
 * a tick at the run's warn and high thresholds, and a dot at the finding's own age, in the zone's
 * tone. One `role="img"` element carries the whole fact as its accessible name — "last release 8.7
 * years ago; warn at 3 years, high at 5" — so the track, ticks and dot underneath it are decorative
 * and the short "8.7 y" label is not read twice.
 *
 * Position is the `style` object prop, never a `style="…"` attribute the page's CSP would refuse
 * (DESIGN.md §1.3) — the same discipline `ui/detail/Timeline.tsx` keeps for its own dots and ticks.
 */
export function AgeScale({ scale }: { scale: AgeScaleData }) {
  const years = scale.years.toFixed(1);
  const label = `${LEAD[scale.kind]} ${years} years ago; warn at ${scale.warn} years, high at ${scale.high}`;

  return (
    <span className="age-scale" role="img" aria-label={label}>
      <span className="age-scale-track" aria-hidden="true">
        <span className="age-scale-tick" style={{ left: `${pct(scale.warn, scale.max)}%` }} />
        <span className="age-scale-tick" style={{ left: `${pct(scale.high, scale.max)}%` }} />
        <span
          className={`age-scale-dot ${toneClass(zoneTone(scale))}`}
          style={{ left: `${pct(scale.years, scale.max)}%` }}
        />
      </span>
      <span className="age-scale-label mono" aria-hidden="true">
        {years} y
      </span>
    </span>
  );
}
