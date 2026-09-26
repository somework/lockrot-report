/**
 * Which package names appear as rows on screen, top to bottom, for the current view — the source of
 * truth `j`/`k` walk. Ported from legacy's implicit "whatever `cursor` indexes into `visible`"
 * (report.js:1030-1052), fixed per DESIGN.md §5 M7/M8/M9: legacy's `cursor` walked `FLAGGED` or
 * `FINDINGS` directly on the Advisories and Blast radius tabs, so it could land on a package with no
 * row on screen there at all. Every function below instead mirrors the exact filter/sort/group each
 * view component renders with, so this file and the view it describes can never drift into two
 * different orders for the same state.
 *
 * Duplicates are expected and correct: Advisories can list the same package under more than one
 * advisory row, and Radius can list the same package under more than one direct requirement's card.
 */

import type { Model, View } from "../../model/types";
import type { State } from "../../state/types";
import { applyFilters } from "../../domain/filters";
import {
  allAdvisories,
  groupAdvisories,
  passesAdvisoryRail,
  type AdvisoryGroup,
} from "../../domain/advisories";
import { matchesAdvisory, parseQuery } from "../../domain/query";
import { radiusLayout, radiusRowOrder } from "../../domain/radius";

/**
 * The Advisories tab's rows, grouped and ordered exactly as `AdvisoriesView` renders them, so both
 * files share one definition of "what is on screen" instead of two that could disagree.
 *
 * Legacy's `advisoryMatches` (report.js:504-516) re-checks severity/cve *and* the sev/fix rail
 * buttons at each advisory's own level — a finer grain than `passesRail`'s "this finding has *some*
 * advisory matching" test, which only narrows which packages are eligible at all (legacy `matches`,
 * applied through `applyFilters` below to get that same package-level narrowing).
 */
export function advisoryGroupsFor(model: Model, state: State): readonly AdvisoryGroup[] {
  const terms = parseQuery(state.q);
  const keep = new Set(applyFilters(model, state, "advisories").map((f) => f.package));
  const rows = allAdvisories(model).filter((pair) => {
    if (!keep.has(pair.finding.package)) return false;
    if (!matchesAdvisory(pair.advisory, pair.finding, terms)) return false;
    return passesAdvisoryRail(state.filters, pair.advisory);
  });
  return groupAdvisories(rows);
}

/** The findings-based tabs (Findings, Packages) render one row per finding, already in the exact
 *  order `applyFilters` produces (priority-grouped for Findings, column-sorted for Packages). */
function findingsOrder(model: Model, state: State, view: View): readonly string[] {
  return applyFilters(model, state, view).map((f) => f.package);
}

function advisoriesOrder(model: Model, state: State): readonly string[] {
  return advisoryGroupsFor(model, state).flatMap((group) =>
    group.advisories.map((pair) => pair.finding.package),
  );
}

/** Radius lists a row per direct requirement and, under an open one, a row per package it lists,
 *  in the exact order `RadiusView` renders them (`radius.ts#radiusRowOrder`): a row folded away is
 *  not on screen, so `j`/`k` never walk to it. */
function radiusOrder(model: Model, state: State, narrow: boolean): readonly string[] {
  const layout = radiusLayout(model, applyFilters(model, state, "radius"));
  return radiusRowOrder(layout, { disclosure: state.disclosure, pkg: state.pkg, narrow });
}

/**
 * Package names in the order their rows appear on screen for `view`, top to bottom. The Run tab
 * describes the run, not its packages, so it never has rows to walk. `narrow` is the phone layout,
 * where Blast radius folds its one-each rows by default.
 */
export function renderedPackages(model: Model, state: State, view: View, narrow = false): readonly string[] {
  switch (view) {
    case "findings":
    case "packages":
      return findingsOrder(model, state, view);
    case "advisories":
      return advisoriesOrder(model, state);
    case "radius":
      return radiusOrder(model, state, narrow);
    case "run":
      return [];
  }
}
