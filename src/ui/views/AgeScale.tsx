import type { AgeAxis as AgeAxisData, AgeScale as AgeScaleData, AgeKind } from "../../domain/age";
import { ageZone } from "../../domain/age";
import type { Verdict } from "../../model/types";
import { toneClass } from "../common/common";
import "./views.css";
import "./ledger-rows.css";

/** How each kind reads at the front of the bar's aria-label, matching the wording `domain/age.ts`
 *  and the finding's own signal summary already use for the same fact. */
const LEAD: Readonly<Record<AgeKind, string>> = {
  branch: "installed branch last released",
  release: "last release",
  push: "last push",
};

/** The reason named after "age shown for context" (PD-ROWS-3, DESIGN.md §5), for the two verdicts
 *  `AgeScale.contextOnly` can be true for. A verdict this renderer does not expect `contextOnly` for
 *  still gets a true sentence instead of a blank. */
const CONTEXT_REASON: Readonly<Record<string, string>> = {
  abandoned: "flagged for being marked abandoned",
  pinned: "flagged for being pinned to a branch snapshot",
};

/** 0-100, clamped: a bar or a guide past the axis' own edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** The warn and high guides every age cell draws edge to edge of its row — one after another down
 *  the list they read as the column's two lines, captioned once in the column head (`AgeAxis`). */
function Guides({ warn, high, max }: { warn: number; high: number; max: number }) {
  return (
    <>
      <span className="age-guide is-warn" style={{ left: pct(warn, max) }} />
      <span className="age-guide is-high" style={{ left: pct(high, max) }} />
    </>
  );
}

/**
 * A Findings row's age (PD-ROWS-2/3/4, DESIGN.md §5): a bar from 0 to the package's own age on the
 * list's one shared axis, in the tone of the zone that age falls in — or, for a verdict that is not
 * about age (`contextOnly`), a neutral grey that never reads as agreeing with a priority it did not
 * set. An age past the axis' edge runs to the edge with a cut mark; the exact years always sit
 * beside it. One `role="img"` carries the whole fact as its accessible name ("last release 8.9 years
 * ago; warn at 3 years, high at 5"), the same text as its `title`, so the parts are decorative.
 *
 * Children, in order (e2e/support/new.ts reads them by position): the track, holding the warn guide,
 * the high guide and the bar; then the number. Positions are CSSOM `style` objects, never a
 * `style="…"` attribute the page's CSP would refuse (DESIGN.md §1.3).
 */
export function AgeCell({ scale, verdict }: { scale: AgeScaleData; verdict: Verdict }) {
  const years = scale.years.toFixed(1);
  const label = scale.contextOnly
    ? `${LEAD[scale.kind]} ${years} years ago; age shown for context, not for priority — ${
        CONTEXT_REASON[verdict] ?? "flagged for a reason other than age"
      }`
    : `${LEAD[scale.kind]} ${years} years ago; warn at ${scale.warn} years, high at ${scale.high}`;
  const tone = scale.contextOnly ? null : ageZone(scale.years, scale.warn, scale.high);
  const over = scale.years > scale.max;
  const barClass = ["age-bar", tone === null ? "age-bar-context" : toneClass(tone), over ? "is-over" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="fcell fc-age" role="img" aria-label={label} title={label}>
      <span className="age-track" aria-hidden="true">
        <Guides warn={scale.warn} high={scale.high} max={scale.max} />
        <span className={barClass} style={{ width: pct(scale.years, scale.max) }} />
      </span>
      <span className={tone === null ? "age-num" : `age-num is-toned ${toneClass(tone)}`} aria-hidden="true">
        {years}
      </span>
    </span>
  );
}

/**
 * The same cell for a row with no age to draw: the guides still run through it, so the column's two
 * lines do not break, and a short muted phrase says why there is no bar — "age not read" when an
 * S10 says a check that measures age could not run, "not flagged for age" when none of S2, S4 or S8
 * fired. (It said "no age signal", which read as "the age is unknown" beside a detail that states
 * the last release plainly; the column head's key uses the same words for a grey bar.) The phrase
 * sits on the row's own background, above the guides, so no line runs through its letters.
 */
export function AgeCellEmpty({ axis, notRead }: { axis: AgeAxisData | null; notRead: boolean }) {
  const title = notRead
    ? "lockrot could not read this package's age (see its S10 signal)"
    : "none of S2 (no stable release), S4 (no push) or S8 (the installed branch stopped) fired for this package";
  return (
    <span className="fcell fc-age is-empty">
      <span className="age-track" aria-hidden="true">
        {axis && <Guides warn={axis.warn} high={axis.high} max={axis.max} />}
      </span>
      <span className="age-none" title={title}>
        {notRead ? "age not read" : "not flagged for age"}
      </span>
    </span>
  );
}

/**
 * The age column's head (PD-ROWS-4, DESIGN.md §5): the one place the axis is captioned — "years
 * since release", 0, the run's warn and high thresholds where their guides run down the rows, and
 * the axis' edge ("10y+"). It replaces the floating "age scale: warn 3 y high 5 y" line above the
 * list. The captions are one `role="img"` with the thresholds spelled out, so a screen reader hears
 * "warn at 3 years", not "3y".
 */
export function AgeAxis({
  axis,
  caption = "Years since release",
  whose = "",
}: {
  axis: AgeAxisData;
  /** The head's visible words; Blast radius says whose ages its column shows. */
  caption?: string;
  /** Said after "age axis" to a screen reader, as `caption` says it on screen. */
  whose?: string;
}) {
  const label = `age axis${whose ? ` (${whose})` : ""}: years since the last release, 0 to ${axis.max} and more; warn at ${axis.warn} years, high at ${axis.high} years`;
  return (
    <span className="fhead-age" role="img" aria-label={label} title={label}>
      <span className="fhead-axis" aria-hidden="true">
        <span className="fhead-axis-label">{caption}</span>
        <span className="fhead-tick is-start">0</span>
        <span className="fhead-tick is-warn tone-med" style={{ left: pct(axis.warn, axis.max) }}>
          {axis.warn}y
        </span>
        <span className="fhead-tick is-high tone-crit" style={{ left: pct(axis.high, axis.max) }}>
          {axis.high}y
        </span>
        <span className="fhead-tick is-end">{axis.max}y+</span>
      </span>
    </span>
  );
}
