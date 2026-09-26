/**
 * Where each year label of the timeline's axis goes, given the threshold guides drawn across the
 * same strip (PD-TIMELINE-11, DESIGN.md §5). A year printed right under a guide's line read as that
 * guide's own date, so the old axis dropped every year near a guide — and a nine-year axis kept only
 * its first year. Now a year near a guide moves its label to the side away from it, its tick still
 * on the year's true place; only a year with no clear side at all is dropped.
 *
 * The strip's width is the browser's to decide, so each check runs at the narrowest width that
 * shows it, in pixels: every label at WIDE (a wider strip only spreads them further apart), and at
 * each of NARROW_TIERS the one year, besides the first, that still fits there. timeline.css's
 * container queries switch between them at the same widths.
 */
import type { TimelineTick } from "../../domain/timeline";

/** A four-digit year at the axis's 10.5px mono, with a hair to spare. */
const YEAR_W = 27;
/** Between a label moved to one side and its tick (timeline.css, `.is-before`/`.is-after`). */
const SIDE_GAP = 3;
/** "today", right-aligned on the rule, and the space kept clear before it. */
const TODAY_W = 37;
/** The least space between two labels, or a label and a guide's line. */
const CLEAR = 4;
/** At or above this strip width every label placed is shown (timeline.css). */
const WIDE = 150;
/** Narrower strips show one year besides the first — the one that still fits at that width. Below
 *  the last, only the first year and "today". */
export const NARROW_TIERS = [140, 124, 108] as const;
export type NarrowTier = (typeof NARROW_TIERS)[number];

/** `first` hangs right of its tick at the axis's left edge; `before`/`after` sit left/right of it. */
export type YearPlace = "first" | "centre" | "before" | "after";

export interface PlacedYear {
  readonly year: number;
  readonly x: number;
  readonly place: YearPlace;
  /** The narrow tiers at which this is the one year kept besides the first. */
  readonly keptAt: readonly NarrowTier[];
}

type Span = readonly [number, number];

function extent(x: number, place: YearPlace, width: number): Span {
  const at = (x / 100) * width;
  switch (place) {
    case "first":
      return [0, YEAR_W];
    case "centre":
      return [at - YEAR_W / 2, at + YEAR_W / 2];
    case "before":
      return [at - YEAR_W - SIDE_GAP, at];
    case "after":
      return [at, at + YEAR_W + SIDE_GAP];
  }
}

/** Whether a label spanning `span` on a strip `width` wide stays clear of "today", every guide's
 *  line and every label already `taken`. */
function fits(span: Span, width: number, guides: readonly number[], taken: readonly Span[]): boolean {
  if (span[0] < 0 || span[1] > width - TODAY_W) return false;
  const lo = span[0] - CLEAR;
  const hi = span[1] + CLEAR;
  if (guides.some((guide) => (guide / 100) * width > lo && (guide / 100) * width < hi)) return false;
  return taken.every(([a, b]) => b <= lo || a >= hi);
}

/** Centred first; else the side away from the nearest guide, then the other side; else none. */
function placeOne(tick: TimelineTick, guides: readonly number[], taken: readonly Span[]): YearPlace | null {
  const nearest = guides.reduce<number | null>(
    (best, guide) => (best === null || Math.abs(guide - tick.x) < Math.abs(best - tick.x) ? guide : best),
    null,
  );
  const away: YearPlace = nearest !== null && nearest > tick.x ? "before" : "after";
  const candidates: YearPlace[] = ["centre", away, away === "before" ? "after" : "before"];
  return candidates.find((place) => fits(extent(tick.x, place, WIDE), WIDE, guides, taken)) ?? null;
}

/** The labels drawn, in axis order; a year with no clear place is left out. The first year always
 *  stays: it marks where the axis starts. */
export function placeYears(ticks: readonly TimelineTick[], guides: readonly number[]): PlacedYear[] {
  const placed: { year: number; x: number; place: YearPlace }[] = [];
  const taken: Span[] = [];
  ticks.forEach((tick, index) => {
    const place = index === 0 ? "first" : placeOne(tick, guides, taken);
    if (place === null) return;
    placed.push({ year: tick.year, x: tick.x, place });
    taken.push(extent(tick.x, place, WIDE));
  });

  const kept = new Map<number, NarrowTier[]>();
  const first = placed[0];
  for (const tier of NARROW_TIERS) {
    const firstSpan: Span[] = first === undefined ? [] : [extent(first.x, "first", tier)];
    const best = placed
      .slice(1)
      .filter((p) => fits(extent(p.x, p.place, tier), tier, guides, firstSpan))
      .reduce<(typeof placed)[number] | null>(
        (winner, p) => (winner === null || Math.abs(p.x - 50) < Math.abs(winner.x - 50) ? p : winner),
        null,
      );
    if (best !== null) kept.set(best.year, [...(kept.get(best.year) ?? []), tier]);
  }
  return placed.map((p) => ({ ...p, keptAt: kept.get(p.year) ?? [] }));
}
