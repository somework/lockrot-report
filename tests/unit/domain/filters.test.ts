import { describe, expect, it } from "vitest";
import { activeFilters } from "../../../src/domain/filters";
import { EMPTY_FILTERS } from "../../../src/state/types";
import type { Filters } from "../../../src/state/types";

function withFilters(filters: Partial<Filters>): Filters {
  return { ...EMPTY_FILTERS, ...filters };
}

describe("activeFilters (PD-RAIL-4)", () => {
  it("lists every selection in the fragment's group order, each with its kind and its own words", () => {
    const filters = withFilters({
      since: ["new"],
      scope: ["dev"],
      signal: ["S4"],
      verdict: ["high"],
      fix: ["upgrade"],
    });

    expect(activeFilters(filters)).toEqual([
      { group: "verdict", key: "high", groupLabel: "Verdict", label: "high" },
      { group: "scope", key: "dev", groupLabel: "Scope", label: "require-dev" },
      { group: "signal", key: "S4", groupLabel: "Signal", label: "S4 no recent push" },
      { group: "fix", key: "upgrade", groupLabel: "Fix", label: "upgrade" },
      { group: "since", key: "new", groupLabel: "Since baseline", label: "New" },
    ]);
  });

  it("names the report-2 groups and the not in composer.json chip, and leaves out the accepted toggle", () => {
    expect(activeFilters(withFilters({ scope: ["unnamed"], flag: ["stale"], accepted: ["hide"] }))).toEqual([
      { group: "scope", key: "unnamed", groupLabel: "Scope", label: "not in composer.json" },
      { group: "flag", key: "stale", groupLabel: "Flag", label: "stale" },
    ]);
  });

  it("is empty when nothing is selected, and keeps an id it has no name for as is", () => {
    expect(activeFilters(withFilters({}))).toEqual([]);
    expect(activeFilters(withFilters({ signal: ["S99"] }))[0]?.label).toBe("S99");
  });

  it("keeps an id a link names as is, even one an object literal would resolve as an inherited key", () => {
    // A shared link can carry any `signal=` value; the rail's labels must not hand back
    // Object.prototype's own members for one.
    for (const id of ["toString", "constructor", "hasOwnProperty"]) {
      expect(activeFilters(withFilters({ signal: [id] }))[0]?.label).toBe(id);
    }
  });
});
