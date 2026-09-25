// PD-RAIL-1 (DESIGN.md §5): a rail row's count is the number of packages the list shows once that
// row is selected — for every row of every group, on every tab that has a rail, over the three real
// corpora. It catches the whole class the "What the fix costs" bug belonged to (a count taken in one
// unit, advisories, over a filter applied in another, packages): spomky-labs/otphp's two other-branch
// advisories read "Moving to another branch 2" over a list of one row.
//
// "The list" is read off the same functions the views render with (`ui/views/order.ts`, and
// `radiusLayout` for the Blast radius rows, open or folded), never off `railGroups`' own arithmetic,
// so the two sides of each comparison are computed independently.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFilters, railGroups } from "../../../src/domain/filters";
import { radiusLayout, radiusListed } from "../../../src/domain/radius";
import { normalize } from "../../../src/model/normalize";
import type { Model, View } from "../../../src/model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type FilterGroup, type State } from "../../../src/state/types";
import { renderedPackages } from "../../../src/ui/views/order";

const CORPORA = ["wallabag_wallabag", "koel_koel", "mautic_mautic"] as const;
const RAIL_VIEWS: readonly View[] = ["findings", "advisories", "packages", "radius"];

function load(name: string): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", `${name}.json`), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name}.json failed to normalize`);
  return result.model;
}

/** Every package with a place on the tab's list, each once. Blast radius lists a flagged package
 *  under a row that may be folded, and a flagged direct requirement as a row of its own, even when
 *  nothing is listed under it (radius.ts), so it is read off the tab's layout, rows open or not. */
function listedPackages(model: Model, state: State): ReadonlySet<string> {
  if (state.view === "radius") return radiusListed(radiusLayout(model, applyFilters(model, state, "radius")));
  return new Set(renderedPackages(model, state, state.view));
}

function selecting(view: View, group: FilterGroup, key: string): State {
  return { ...INITIAL_STATE, view, filters: { ...EMPTY_FILTERS, [group]: [key] } };
}

describe.each(CORPORA)("rail counts on %s (PD-RAIL-1)", (corpus) => {
  const model = load(corpus);

  it.each(RAIL_VIEWS)("every %s rail row counts the packages its selection lists", (view) => {
    const groups = railGroups(model, { ...INITIAL_STATE, view });
    const rows = groups.flatMap((g) =>
      g.rows.map((row) => ({ group: g.group, key: row.key, count: row.count })),
    );
    expect(rows.length).toBeGreaterThan(0);

    const mismatches = rows
      .map(({ group, key, count }) => ({
        row: `${group}:${key}`,
        shown: count,
        listed: listedPackages(model, selecting(view, group, key)).size,
      }))
      .filter(({ shown, listed }) => shown !== listed);

    expect(mismatches).toEqual([]);
  });
});

describe("the otphp case that found it (wallabag_wallabag)", () => {
  it("counts spomky-labs/otphp once under 'Moving to another branch', though it has two such advisories", () => {
    const model = load("wallabag_wallabag");
    const otphp = model.report.findings.find((f) => f.package === "spomky-labs/otphp");
    const moves = otphp?.advisories.filter((a) => a.fixedBy !== null && !a.fixedOnBranch) ?? [];
    expect(moves.length).toBe(2);

    const fix = railGroups(model, INITIAL_STATE).find((g) => g.group === "fix");
    const move = fix?.rows.find((row) => row.key === "move");

    expect(move?.count).toBe(applyFilters(model, selecting("findings", "fix", "move"), "findings").length);
  });
});
