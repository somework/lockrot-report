import type { AgeLegend as AgeLegendData, AgeScale as AgeScaleData, AgeKind } from "../../domain/age";
import { ageZone } from "../../domain/age";
import type { Tone } from "../../domain/vocab";
import type { Verdict } from "../../model/types";
import { plural } from "../../domain/format";
import { toneClass } from "../common/common";
import "./views.css";

/** How each kind reads at the front of the scale's aria-label, matching the wording `domain/age.ts`
 *  and the finding's own signal summary already use for the same fact. */
const LEAD: Readonly<Record<AgeKind, string>> = {
  branch: "installed branch last released",
  release: "last release",
  push: "last push",
};

/** The reason named after "age shown for context" (PD-ROWS-3, DESIGN.md §5), for the two verdicts
 *  `AgeScale.contextOnly` can be true for — kept here, not in `domain/age.ts`, since it is prose for
 *  this one label rather than a fact the domain layer computes. A verdict this renderer does not
 *  expect `contextOnly` for (it is only ever true for the two below) still gets a true sentence
 *  instead of a blank. */
const CONTEXT_REASON: Readonly<Record<string, string>> = {
  abandoned: "flagged for being marked abandoned",
  pinned: "flagged for being pinned to a branch snapshot",
};

/** 0-100, clamped: `scale.max` already keeps `years` on the track (`domain/age.ts`'s own
 *  `max(10, ceil(years))`), but a threshold the run set above `max` — an unusual config, not a
 *  document this renderer can rule out — would otherwise draw a tick past the track's right edge. */
function pct(value: number, max: number): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** Below `warn` reads as fine, `warn`..`high` as a caution, at or above `high` as the same tone a
 *  critical verdict pill carries — the dot's own colour is the scale's whole point (PD-ROWS-2: a
 *  reader who skips the label still sees the zone at a glance). Never consulted for a `contextOnly`
 *  scale (below), whose dot reads as neutral regardless of which zone the years fall in. */
function zoneTone(scale: AgeScaleData): Tone {
  return ageZone(scale.years, scale.warn, scale.high);
}

/**
 * The Findings row's age scale (PD-ROWS-2/3, DESIGN.md §5): a thin track from 0 to `scale.max`
 * years, a tick at the run's warn and high thresholds, and a dot at the finding's own age, in the
 * zone's tone — or, for a `contextOnly` scale, a fixed neutral tone instead, so it never reads as
 * agreeing with a priority it did not set (`AgeScale.contextOnly`'s own comment in `domain/age.ts`).
 * One `role="img"` element carries the whole fact as its accessible name — "last release 8.7 years
 * ago; warn at 3 years, high at 5" — so the track, ticks and dot underneath it are decorative and
 * the short "8.7 y" label is not read twice; the same text sits in a `title` too, since the ticks
 * that name the run's own thresholds otherwise show a reader nothing to hover (PD-ROWS-3).
 *
 * Position is the `style` object prop, never a `style="…"` attribute the page's CSP would refuse
 * (DESIGN.md §1.3) — the same discipline `ui/detail/Timeline.tsx` keeps for its own dots and ticks.
 */
export function AgeScale({ scale, verdict }: { scale: AgeScaleData; verdict: Verdict }) {
  const years = scale.years.toFixed(1);
  const label = scale.contextOnly
    ? `${LEAD[scale.kind]} ${years} years ago; age shown for context, not for priority — ${
        CONTEXT_REASON[verdict] ?? "flagged for a reason other than age"
      }`
    : `${LEAD[scale.kind]} ${years} years ago; warn at ${scale.warn} years, high at ${scale.high}`;
  const dotClass = scale.contextOnly
    ? "age-scale-dot age-scale-dot-context"
    : `age-scale-dot ${toneClass(zoneTone(scale))}`;

  return (
    <span className="age-scale" role="img" aria-label={label} title={label}>
      <span className="age-scale-track" aria-hidden="true">
        <span className="age-scale-tick" style={{ left: `${pct(scale.warn, scale.max)}%` }} />
        <span className="age-scale-tick" style={{ left: `${pct(scale.high, scale.max)}%` }} />
        <span className={dotClass} style={{ left: `${pct(scale.years, scale.max)}%` }} />
      </span>
      <span className="age-scale-label mono" aria-hidden="true">
        {years} y
      </span>
    </span>
  );
}

/**
 * The same footprint as `AgeScale`, with nothing in it: a Findings row whose finding carries a
 * key-fact line but no age scale (no S8/S2/S4, or a threshold the run never recorded) would
 * otherwise hand its `.sig-lines` the full width of the key-fact line while a neighbouring row's
 * only has what a 64px track and its label leave over — the two wrap their signal text at
 * different widths for a reason nothing on screen explains, so the list reads as uneven from row to
 * row (PD-ROWS-3). `aria-hidden`, since it carries no fact;
 * `views.css` hides it under 760px, where the key-fact line already stacks instead of sharing a row.
 */
export function AgeScalePlaceholder() {
  return (
    <span className="age-scale age-scale-placeholder" aria-hidden="true">
      <span className="age-scale-track" />
      <span className="age-scale-label mono">0.0 y</span>
    </span>
  );
}

/**
 * The tick marks named, once, for the whole list (PD-ROWS-3, DESIGN.md §5): before this, a row's
 * two ticks carried the run's own thresholds only in an aria-label and, now, a hover `title` —
 * nothing a reader scanning the list without hovering every dot ever saw. `FindingsView` renders
 * this once, above the first priority group, from `domain/age.ts#ageLegend`; a row's own scale is
 * unchanged and still carries the exact numbers in its own label.
 *
 * a11y review: the tick was a `▏` glyph sitting in the line's own accessible text, so a screen
 * reader read it aloud (VoiceOver: "left one-eighth block") ahead of "warn 3 y" — decorative
 * repetition of the word beside it, not a fact of its own, never meant to be heard at all, and the
 * short "y" read oddly outside a visual, skimmable context. The same `role="img"`/`aria-label`
 * pairing `AgeScale` above already uses for exactly this reason (one accessible name replacing a
 * row of decorative parts) carries the full "warn at N years, high at N years" wording instead; the
 * visible line, glyphs included, is one `aria-hidden` child. The glyph itself moves from text into
 * `.age-scale-legend-tick` (a CSS-drawn bar, `views.css`), which also fixes a visual-review finding
 * on the same line: a `▏` character's own ink sits at the left edge of its box, so even the space
 * already before it in the old string read as flush against the previous word ("scale:▏", "y▏") —
 * the bar's own `margin` gives it real, controllable clearance on both sides instead.
 */
export function AgeScaleLegend({ legend }: { legend: AgeLegendData }) {
  const label = `age scale: warn at ${plural(legend.warn, "year", "years")}, high at ${plural(legend.high, "year", "years")}`;

  return (
    <p className="age-scale-legend muted" role="img" aria-label={label} title={label}>
      <span aria-hidden="true">
        age scale: <span className="age-scale-legend-tick" />
        warn {legend.warn} y <span className="age-scale-legend-tick" />
        high {legend.high} y
      </span>
    </p>
  );
}
