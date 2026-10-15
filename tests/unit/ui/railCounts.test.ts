// PD-RAIL-1/2: every rail row's count is the packages the list shows once that row is selected, for
// every group and tab, over recorded report-2 documents. "The list" comes from the tabs' own
// functions, never `railGroups2`' arithmetic.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countedFlagIds } from "../../../src/domain/countedFlags";
import { applyFilters2, population2, railGroups2, renderedPackages2 } from "../../../src/domain/list2";
import { radiusLayout2 } from "../../../src/domain/radius2";
import type { Report2, Report2Embed } from "../../../src/model/report2";
import type { View } from "../../../src/model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type FilterGroup, type State } from "../../../src/state/types";
import { readContractJson } from "../words/recorded";

function contract(name: string): Report2 {
  return readContractJson("report-2", `${name}.json`) as Report2;
}

function baselined(scenario: string): Report2 {
  const path = join(process.cwd(), ".lockrot/tests/fixtures/baselined", scenario, "check/report.bundle.json");
  return (JSON.parse(readFileSync(path, "utf8")) as Report2Embed).report;
}

const CORPORA: readonly (readonly [string, () => Report2])[] = [
  ["composite", () => contract("composite")],
  ["baselined wallabag 2.6", () => baselined("wallabag-2.6")],
  ["baselined wallabag main", () => baselined("wallabag-main")],
  ["commonmark", () => contract("commonmark")],
  ["many-dependents", () => contract("many-dependents")],
  ["xmlseclibs", () => contract("xmlseclibs")],
];
const RAIL_VIEWS: readonly View[] = ["findings", "advisories", "packages", "radius"];

/** The "Accepted flags" toggle filters no package: its count is the listed rows whose pills it hides. */
const FILTERS_PACKAGES = (group: FilterGroup): boolean => group !== "accepted";

/** Read off the tab's layout, rows open or not: a row may be folded, and a flagged direct
 *  requirement is listed even with nothing under it. */
function listedPackages(report: Report2, state: State): ReadonlySet<string> {
  if (state.view === "radius") {
    const layout = radiusLayout2(
      report,
      applyFilters2(report, state, "radius"),
      population2(report, "radius"),
    );
    const rows = [...layout.ranked, ...layout.selfOnly];
    return new Set([
      ...rows.flatMap((row) => [
        ...(row.self ? [row.self.package] : []),
        ...row.pulled.map((f) => f.package),
      ]),
      ...layout.unlisted.map((f) => f.package),
      ...layout.unattributed.map((f) => f.package),
    ]);
  }
  return new Set(renderedPackages2(report, state, state.view));
}

function selecting(view: View, group: FilterGroup, key: string): State {
  return { ...INITIAL_STATE, view, filters: { ...EMPTY_FILTERS, [group]: [key] } };
}

describe.each(CORPORA)("rail counts on %s (PD-RAIL-1)", (_name, load) => {
  const report = load();

  it.each(RAIL_VIEWS)("every %s rail row counts the packages its selection lists", (view) => {
    const groups = railGroups2(report, { ...INITIAL_STATE, view }).filter((g) => FILTERS_PACKAGES(g.group));
    const rows = groups.flatMap((g) =>
      g.rows.map((row) => ({ group: g.group, key: row.key, count: row.count })),
    );
    // A tab with nothing in it has no rail rows at all; every other has some.
    expect(rows.length > 0).toBe(population2(report, view).length > 0);

    const mismatches = rows
      .map(({ group, key, count }) => ({
        row: `${group}:${key}`,
        shown: count,
        listed: listedPackages(report, selecting(view, group, key)).size,
      }))
      .filter(({ shown, listed }) => shown !== listed);

    expect(mismatches).toEqual([]);
  });
});

/** Written from the reducer's rule, not from `railGroups2`' own helper. */
function adding(base: State, group: FilterGroup, key: string): State {
  const current = base.filters[group];
  const next = current.includes(key) ? current : [...current, key];
  return { ...base, filters: { ...base.filters, [group]: next } };
}

// With other filters on, a count is still what the list shows with that row on too.
const NARROWED: readonly { label: string; state: Partial<State> }[] = [
  { label: "Direct on", state: { filters: { ...EMPTY_FILTERS, scope: ["direct"] } } },
  { label: "the high verdict on", state: { filters: { ...EMPTY_FILTERS, verdict: ["high"] } } },
  {
    label: "stale and require-dev on",
    state: { filters: { ...EMPTY_FILTERS, flag: ["stale"], scope: ["dev"] } },
  },
  { label: "a search", state: { q: "symfony" } },
  // A second row picked in an ORed group lists the union, so an off row's count is the union with
  // it, and an on row's is the list as it stands.
  {
    label: "Direct and old-promise on",
    state: { filters: { ...EMPTY_FILTERS, scope: ["direct"], flag: ["old-promise"] } },
  },
  {
    label: "Direct, stale and vulnerable on",
    state: { filters: { ...EMPTY_FILTERS, scope: ["direct"], flag: ["stale", "vulnerable"] } },
  },
];

describe.each(CORPORA)("faceted rail counts on %s (PD-RAIL-2)", (_name, load) => {
  const report = load();

  it.each(NARROWED)("with $label, every row counts what selecting it lists", ({ state: extra }) => {
    for (const view of RAIL_VIEWS) {
      const base: State = { ...INITIAL_STATE, ...extra, view };
      const mismatches = railGroups2(report, base)
        .filter((g) => FILTERS_PACKAGES(g.group))
        .flatMap((g) =>
          g.rows
            .map((row) => ({
              row: `${view} ${g.group}:${row.key}`,
              shown: row.count,
              listed: listedPackages(report, adding(base, g.group, row.key)).size,
            }))
            .filter(({ shown, listed }) => shown !== listed),
        );
      expect(mismatches).toEqual([]);
    }
  });

  it("never shows a row that would list nothing, unless it is on", () => {
    const base: State = { ...INITIAL_STATE, filters: { ...EMPTY_FILTERS, scope: ["direct"] } };
    for (const g of railGroups2(report, base)) {
      if (!FILTERS_PACKAGES(g.group)) continue;
      for (const row of g.rows) expect(row.count > 0 || row.on).toBe(true);
    }
  });

  it("with a flag on, shows another only when it is carried by a package the rest would list", () => {
    const base: State = {
      ...INITIAL_STATE,
      view: "packages",
      filters: { ...EMPTY_FILTERS, scope: ["direct"], flag: ["stale"] },
    };
    const flag = railGroups2(report, base).find((g) => g.group === "flag");
    const shown = new Set(flag?.rows.map((row) => row.key) ?? []);
    const direct = population2(report, "packages").filter((f) => f.direct);
    for (const id of report.run.flag_ids) {
      const own = direct.some((f) => countedFlagIds(f).includes(id));
      expect({ id, shown: shown.has(id) }).toEqual({ id, shown: own || id === "stale" });
    }
  });
});

describe("a package with several advisories (composite)", () => {
  it("counts once under vulnerable, though the Advisories tab draws a row for each advisory", () => {
    const report = contract("composite");
    const state: State = { ...INITIAL_STATE, view: "advisories" };

    const flag = railGroups2(report, state).find((g) => g.group === "flag");
    const vulnerable = flag?.rows.find((row) => row.key === "vulnerable");

    // `security.packages.vulnerable` and `security.advisories.counted` of the document.
    expect(vulnerable?.count).toBe(4);
    expect(renderedPackages2(report, state, "advisories")).toHaveLength(20);
  });
});
