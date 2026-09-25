/**
 * Blast-radius cards: for each direct requirement, which flagged findings it drags in — ported
 * from legacy's `viewRadius` (`report.js:595-625`), fixed per DESIGN.md §5 M24/M25.
 *
 * Legacy's card count (`flagged`) was `pulled.length + 1` when the direct requirement was itself
 * flagged, but only `pulled` was ever drawn as rows — a card could read "3 flagged packages
 * underneath" over two rows (M25), and because it recomputed everything from each finding's own
 * `chain[0]` rather than `Report.php`'s attribution, the count could also disagree with the
 * document's own `exposure[].flagged` (M24). The fix here is the one DESIGN.md states: the count
 * *is* the rows listed, and whether the direct requirement is itself flagged becomes its own flag
 * a caller can render however it likes ("flagged itself", a badge, …) instead of folding it into a
 * number the rows don't back up.
 */

import type { Finding, Model, Verdict } from "../model/types";

export interface RadiusPulled {
  readonly package: string;
  readonly verdict: Verdict;
}

export interface RadiusCard {
  readonly package: string;
  /** `pulled.length` — exactly the rows this card lists (the M24/M25 fix). */
  readonly count: number;
  /** True when `package` itself is one of the flagged findings passed in, on top of whatever it pulls in. */
  readonly parentFlagged: boolean;
  /** 0-100, `pulled.length` relative to the largest card's, for the meter bar (`report.js:610`). */
  readonly meterPercent: number;
  readonly pulled: readonly RadiusPulled[];
}

/**
 * `visibleFlagged` is the caller's already-filtered flagged findings for the current view (legacy's
 * `kept`, `report.js:599`) — the full filter surface (query box, rail) applies before this runs,
 * not inside it.
 */
export function radiusCards(model: Model, visibleFlagged: readonly Finding[]): readonly RadiusCard[] {
  const keptNames = new Set(visibleFlagged.map((f) => f.package));

  const candidates = model.report.exposure.map((exposure) => {
    const pulled = visibleFlagged.filter(
      (f) => f.package !== exposure.package && f.chain.includes(exposure.package),
    );
    return { package: exposure.package, pulled, parentFlagged: keptNames.has(exposure.package) };
  });

  // A direct requirement earns a card when it pulls something in or is itself flagged (legacy's
  // `flagged > 0` gate, report.js:606) — only the headline count changes under the M24/M25 fix.
  const withCards = candidates.filter((c) => c.pulled.length > 0 || c.parentFlagged);
  const sorted = [...withCards].sort((a, b) => b.pulled.length - a.pulled.length);
  const maxCount = Math.max(1, ...sorted.map((c) => c.pulled.length));

  return sorted.map((c) => ({
    package: c.package,
    count: c.pulled.length,
    parentFlagged: c.parentFlagged,
    meterPercent: Math.round((100 * c.pulled.length) / maxCount),
    pulled: c.pulled.map((f) => ({ package: f.package, verdict: f.verdict })),
  }));
}

/**
 * The findings among `flagged` that have a place on the Blast radius tab at all: pulled in under
 * some direct requirement's card, or heading a card as a flagged direct requirement. A flagged
 * direct requirement that pulls nothing in and is not in `exposure` (wallabag's lcobucci/jwt, say)
 * has no card, so the tab never lists it. Membership is per finding — it does not depend on which
 * other findings are passed in — so a filter applied before or after this gives the same set; the
 * rail counts over this set on that tab (PD-RAIL-1, `domain/filters.ts#railGroups`).
 */
export function placedOnRadius(model: Model, flagged: readonly Finding[]): readonly Finding[] {
  const parents = new Set(model.report.exposure.map((exposure) => exposure.package));
  return flagged.filter(
    (f) => parents.has(f.package) || f.chain.some((hop) => hop !== f.package && parents.has(hop)),
  );
}
