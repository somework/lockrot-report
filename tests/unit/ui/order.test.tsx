import { describe, expect, it } from "vitest";
import { advisoryGroupsFor, renderedPackages } from "../../../src/ui/views/order";
import { INITIAL_STATE, EMPTY_FILTERS } from "../../../src/state/types";
import type { Filters, State } from "../../../src/state/types";
import type { Finding, Model } from "../../../src/model/types";
import { makeAdvisory, makeFinding, makeModel } from "../domain/fixtures";

const FLAGGED_VERDICTS = ["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"] as const;

/** Mirrors `tests/unit/domain/filters.test.ts`'s own helper: `makeModel` gives every report field a
 *  default, this layers the `run`/`exposure` overrides `order.ts` actually reads on top. */
function modelWith(findings: readonly Finding[], overrides: Partial<Model["report"]> = {}): Model {
  const model = makeModel(findings);
  return {
    ...model,
    report: {
      ...model.report,
      run: { ...model.report.run, flaggedVerdicts: [...FLAGGED_VERDICTS] },
      ...overrides,
    },
  };
}

function stateWith(overrides: Partial<State> = {}): State {
  return { ...INITIAL_STATE, ...overrides };
}

function withFilters(filters: Partial<Filters>): Filters {
  return { ...EMPTY_FILTERS, ...filters };
}

describe("renderedPackages: findings", () => {
  it("groups by priority, most severe first, before any package name", () => {
    // Arrange
    const low = makeFinding({ package: "z/low", verdict: "stale", priority: "medium" });
    const high = makeFinding({ package: "a/high", verdict: "abandoned", priority: "critical" });
    const model = modelWith([low, high]);

    // Act
    const order = renderedPackages(model, stateWith(), "findings");

    // Assert
    expect(order).toEqual(["a/high", "z/low"]);
  });

  it("only ever lists a flagged package, never one the rail or query filtered out", () => {
    // Arrange
    const flagged = makeFinding({ package: "flagged/pkg", verdict: "abandoned", priority: "critical" });
    const healthy = makeFinding({ package: "healthy/pkg", verdict: "ok", priority: "none" });
    const model = modelWith([flagged, healthy]);

    // Act
    const order = renderedPackages(model, stateWith({ q: "nomatch" }), "findings");

    // Assert
    expect(order).toEqual([]);
  });
});

describe("renderedPackages: packages", () => {
  it("follows the active column sort, every package included", () => {
    // Arrange
    const a = makeFinding({ package: "b/pkg", version: "1.0.0" });
    const b = makeFinding({ package: "a/pkg", version: "1.0.0" });
    const model = modelWith([a, b]);

    // Act
    const order = renderedPackages(model, stateWith({ sort: "package", sortDesc: false }), "packages");

    // Assert
    expect(order).toEqual(["a/pkg", "b/pkg"]);
  });
});

describe("renderedPackages: advisories", () => {
  it("lists one entry per advisory row, package names repeating across rows", () => {
    // Arrange
    const twoAdvisories = makeFinding({
      package: "many/advisories",
      advisories: [
        makeAdvisory({ id: "GHSA-1", severity: "high" }),
        makeAdvisory({ id: "GHSA-2", severity: "low" }),
      ],
    });
    const model = modelWith([twoAdvisories]);

    // Act
    const order = renderedPackages(model, stateWith(), "advisories");

    // Assert
    expect(order).toEqual(["many/advisories", "many/advisories"]);
  });

  it("groups branch fixes before move fixes before no-fix, most severe within a group first", () => {
    // Arrange
    const withFixes = makeFinding({
      package: "pkg/fixes",
      advisories: [
        makeAdvisory({ id: "no-fix", severity: "low", fixedBy: null }),
        makeAdvisory({ id: "on-branch", severity: "medium", fixedBy: "1.2.0", fixedOnBranch: true }),
        makeAdvisory({ id: "move", severity: "critical", fixedBy: "2.0.0", fixedOnBranch: false }),
      ],
    });
    const model = modelWith([withFixes]);

    // Act
    const groups = advisoryGroupsFor(model, stateWith());

    // Assert: branch group, then move, then none — never plain severity order across the whole list.
    expect(groups.map((g) => g.shape)).toEqual(["branch", "move", "none"]);
  });

  it("filters an individual advisory against the sev rail, not just 'this package has some match'", () => {
    // Arrange: one finding carries both a critical and a low advisory; asking the rail for "low"
    // must drop the critical row but keep the finding's low one, not keep both because the finding
    // as a whole has *a* match (the finer grain legacy's own advisoryMatches applied, report.js:507).
    const mixed = makeFinding({
      package: "mixed/severities",
      advisories: [
        makeAdvisory({ id: "crit", severity: "critical" }),
        makeAdvisory({ id: "low", severity: "low" }),
      ],
    });
    const model = modelWith([mixed]);
    const state = stateWith({ filters: withFilters({ sev: ["low"] }) });

    // Act
    const groups = advisoryGroupsFor(model, state);

    // Assert
    const ids = groups.flatMap((g) => g.advisories.map((pair) => pair.advisory.id));
    expect(ids).toEqual(["low"]);
  });

  it("drops every advisory of a package the finding-level query excludes", () => {
    // Arrange
    const target = makeFinding({
      package: "target/pkg",
      advisories: [makeAdvisory({ id: "adv-1", severity: "high" })],
    });
    const other = makeFinding({
      package: "other/pkg",
      advisories: [makeAdvisory({ id: "adv-2", severity: "high" })],
    });
    const model = modelWith([target, other]);

    // Act
    const order = renderedPackages(model, stateWith({ q: "target" }), "advisories");

    // Assert
    expect(order).toEqual(["target/pkg"]);
  });
});

describe("renderedPackages: radius", () => {
  // `direct/small` pulls one package in, `direct/big` pulls two.
  const pulled = (pkg: string, parent: string) =>
    makeFinding({ package: pkg, verdict: "stale", direct: false, chain: [parent, pkg] });
  const model = modelWith(
    [pulled("pulled/a", "direct/big"), pulled("pulled/b", "direct/big"), pulled("pulled/c", "direct/small")],
    {
      exposure: [
        { package: "direct/small", flagged: 1 },
        { package: "direct/big", flagged: 2 },
      ],
    },
  );

  it("lists a row per direct requirement, most listed first, its packages folded away (PD-RADIUS-3)", () => {
    // Act
    const order = renderedPackages(model, stateWith(), "radius");

    // Assert: a closed row's packages are not on screen, so j/k never walk to them.
    expect(order).toEqual(["direct/big", "direct/small"]);
  });

  it("lists an open row's packages right after it", () => {
    // Act
    const order = renderedPackages(model, stateWith({ disclosure: { "row:direct/big": true } }), "radius");

    // Assert
    expect(order).toEqual(["direct/big", "pulled/a", "pulled/b", "direct/small"]);
  });

  it("opens the row that lists the open package", () => {
    // Act
    const order = renderedPackages(model, stateWith({ pkg: "pulled/c" }), "radius");

    // Assert
    expect(order).toEqual(["direct/big", "direct/small", "pulled/c"]);
  });
});

describe("renderedPackages: run", () => {
  it("never has rows to walk", () => {
    // Arrange
    const model = modelWith([makeFinding({ package: "any/pkg" })]);

    // Act & Assert
    expect(renderedPackages(model, stateWith(), "run")).toEqual([]);
  });
});
