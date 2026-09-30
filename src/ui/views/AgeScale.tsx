import type { AgeAxis as AgeAxisData, AgeScale as AgeScaleData, AgeKind } from "../../domain/age";
import { ageZone } from "../../domain/age";
import { pinnedContextReason, type PinnedKind } from "../../domain/pinned";
import type { Verdict } from "../../model/types";
import { toneClass } from "../common/common";
import "./views.css";
import "./ledger-rows.css";

const LEAD: Readonly<Record<AgeKind, string>> = {
  branch: "installed branch last released",
  release: "last release",
  push: "last push",
};

/** The reason named after "age shown for context" (PD-ROWS-3, DESIGN.md §5). */
function contextReason(verdict: Verdict, pinned: PinnedKind | null): string {
  if (verdict === "abandoned") return "flagged for being marked abandoned";
  if (verdict === "pinned") return pinnedContextReason(pinned ?? "other");
  return "flagged for a reason other than age";
}

/** 0-100, clamped: a bar or a guide past the axis' own edge is drawn at the edge. */
function pct(value: number, max: number): string {
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

/** Down the list they read as the column's two lines, captioned once in the head. */
function Guides({ warn, high, max }: { warn: number; high: number; max: number }) {
  return (
    <>
      <span className="age-guide is-warn" style={{ left: pct(warn, max) }} />
      <span className="age-guide is-high" style={{ left: pct(high, max) }} />
    </>
  );
}

/**
 * One `role="img"` carries the whole fact, so the parts are decorative. A context-only verdict
 * draws grey, never agreeing with a priority it did not set. e2e/support/new.ts reads the children
 * by position; positions are CSSOM, never a `style="…"` the CSP refuses.
 */
export function AgeCell({
  scale,
  verdict,
  pinned = null,
  tag = false,
}: {
  scale: AgeScaleData;
  verdict: Verdict;
  pinned?: PinnedKind | null;
  /** The age is the newest tag's, beside a why that names a snapshot too. */
  tag?: boolean;
}) {
  const years = scale.years.toFixed(1);
  const lead = tag ? "newest tag released" : LEAD[scale.kind];
  const label = scale.contextOnly
    ? `${lead} ${years} years ago; age shown for context, not for priority — ${contextReason(
        verdict,
        pinned,
      )}`
    : `${lead} ${years} years ago; warn at ${scale.warn} years, high at ${scale.high}`;
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
      {tag && (
        <span className="age-whose" aria-hidden="true">
          tag
        </span>
      )}
    </span>
  );
}

/** The guides still run through, so the column's lines do not break; the phrase sits above them on
 *  the row's background. */
export function AgeCellEmpty({ axis, notRead }: { axis: AgeAxisData | null; notRead: boolean }) {
  const title = notRead
    ? "lockrot could not read this package's age (see its S10 signal)"
    : "none of S2 (no recent release), S4 (no push) or S8 (the installed branch stopped) fired for this package";
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

/** The one place the axis is captioned (PD-ROWS-4); one `role="img"` with the thresholds spelled
 *  out. */
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
