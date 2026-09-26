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
import { applyFilters, population, railGroups } from "../../../src/domain/filters";
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
    // A tab with nothing in it has no rail at all (koel's and mautic's Advisories); every other has rows.
    expect(rows.length > 0).toBe(population(model, view).length > 0);

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

/** The state with `key` on in `group` on top of `base`, as the reducer's toggle turns it on: added
 *  to what its group already has (ANDed for Scope, ORed for the rest); a row already on changes
 *  nothing. Written here from the reducer's rule, not from `railGroups`' own helper. */
function adding(base: State, group: FilterGroup, key: string): State {
  const current = base.filters[group];
  const next = current.includes(key) ? current : [...current, key];
  return { ...base, filters: { ...base.filters, [group]: next } };
}

// PD-RAIL-2: with other filters on — a Scope button, a ledger chip, a search, a second row of the
// same ORed group — every count is still what the list shows with that row on, those filters
// staying on: for a row that is off, what a click on it lists.
const NARROWED: readonly { label: string; state: Partial<State> }[] = [
  { label: "Direct on", state: { filters: { ...EMPTY_FILTERS, scope: ["direct"] } } },
  { label: "high priority on", state: { filters: { ...EMPTY_FILTERS, prio: ["high"] } } },
  {
    label: "S4 and require-dev on",
    state: { filters: { ...EMPTY_FILTERS, signal: ["S4"], scope: ["dev"] } },
  },
  { label: "a search", state: { q: "symfony" } },
  // The evaluator's cases: a second row picked in an ORed group lists the union, so an off row's
  // count is the union with it, and an on row's is the list as it stands.
  { label: "Direct and S5 on", state: { filters: { ...EMPTY_FILTERS, scope: ["direct"], signal: ["S5"] } } },
  {
    label: "Direct, S1 and S4 on",
    state: { filters: { ...EMPTY_FILTERS, scope: ["direct"], signal: ["S1", "S4"] } },
  },
];

describe.each(CORPORA)("faceted rail counts on %s (PD-RAIL-2)", (corpus) => {
  const model = load(corpus);

  it.each(NARROWED)("with $label, every row counts what selecting it lists", ({ state: extra }) => {
    for (const view of RAIL_VIEWS) {
      const base: State = { ...INITIAL_STATE, ...extra, view };
      const mismatches = railGroups(model, base).flatMap((g) =>
        g.rows
          .map((row) => ({
            row: `${view} ${g.group}:${row.key}`,
            shown: row.count,
            listed: listedPackages(model, adding(base, g.group, row.key)).size,
          }))
          .filter(({ shown, listed }) => shown !== listed),
      );
      expect(mismatches).toEqual([]);
    }
  });

  it("never shows a row that would list nothing, unless it is on", () => {
    const base: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, scope: ["direct"] } };
    for (const g of railGroups(model, base)) {
      for (const row of g.rows) expect(row.count > 0 || row.on).toBe(true);
    }
  });

  it("with a row of an ORed group on, shows another only when it matches a package the rest would list", () => {
    const base: State = {
      ...INITIAL_STATE,
      view: "packages",
      filters: { ...EMPTY_FILTERS, scope: ["direct"], signal: ["S5"] },
    };
    const signal = railGroups(model, base).find((g) => g.group === "signal");
    const shown = new Set(signal?.rows.map((row) => row.key) ?? []);
    const direct = population(model, "packages").filter((f) => f.direct);
    for (const id of new Set(population(model, "packages").flatMap((f) => f.signals.map((s) => s.id)))) {
      const own = direct.some((f) => f.signals.some((s) => s.id === id));
      expect({ id, shown: shown.has(id) }).toEqual({ id, shown: own || id === "S5" });
    }
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
