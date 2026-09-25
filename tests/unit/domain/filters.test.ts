import { describe, expect, it } from "vitest";
import { applyFilters, hiddenByFilters, population, railGroups } from "../../../src/domain/filters";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../../src/state/types";
import type { Filters, State } from "../../../src/state/types";
import type { Finding, Model } from "../../../src/model/types";
import { makeAdvisory, makeFinding, makeModel, makeSignal } from "./fixtures";

const FLAGGED_VERDICTS = ["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"] as const;

/** `makeModel` gives every report field a default; this layers `run`/`baseline`/`exposure`
 *  overrides on top without reaching back into fixtures.ts, which other domain/ tests also use. */
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

describe("population", () => {
  it("gives findings and radius the flagged findings only", () => {
    // Arrange
    const flagged = makeFinding({ package: "flagged/pkg", verdict: "abandoned" });
    const healthy = makeFinding({ package: "healthy/pkg", verdict: "ok" });
    const model = modelWith([flagged, healthy]);

    // Act
    const findingsPop = population(model, "findings");
    const radiusPop = population(model, "radius");

    // Assert
    expect(findingsPop.map((f) => f.package)).toEqual(["flagged/pkg"]);
    expect(radiusPop.map((f) => f.package)).toEqual(["flagged/pkg"]);
  });

  it("gives packages every finding, flagged or not", () => {
    // Arrange
    const flagged = makeFinding({ package: "flagged/pkg", verdict: "abandoned" });
    const healthy = makeFinding({ package: "healthy/pkg", verdict: "ok" });
    const model = modelWith([flagged, healthy]);

    // Act
    const pop = population(model, "packages");

    // Assert
    expect(pop.map((f) => f.package)).toEqual(["flagged/pkg", "healthy/pkg"]);
  });

  it("gives advisories only the findings that carry one, regardless of verdict", () => {
    // Arrange
    const quiet = makeFinding({ package: "quiet/pkg", verdict: "ok", advisories: [makeAdvisory()] });
    const noAdvisory = makeFinding({ package: "clean/pkg", verdict: "abandoned" });
    const model = modelWith([quiet, noAdvisory]);

    // Act
    const pop = population(model, "advisories");

    // Assert
    expect(pop.map((f) => f.package)).toEqual(["quiet/pkg"]);
  });

  it("gives run nothing to filter", () => {
    // Arrange
    const model = modelWith([makeFinding()]);

    // Act
    const pop = population(model, "run");

    // Assert
    expect(pop).toEqual([]);
  });
});

describe("applyFilters / findings ordering", () => {
  it("groups by priority in the fixed order, regardless of population order", () => {
    // Arrange
    const low = makeFinding({ package: "low/pkg", verdict: "stale", priority: "low" });
    const critical = makeFinding({ package: "critical/pkg", verdict: "abandoned", priority: "critical" });
    const high = makeFinding({ package: "high/pkg", verdict: "pinned", priority: "high" });
    const model = modelWith([low, critical, high]);

    // Act
    const visible = applyFilters(model, stateWith({ view: "findings" }), "findings");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["critical/pkg", "high/pkg", "low/pkg"]);
  });

  it("keeps a finding whose priority is outside the known five instead of dropping it (DESIGN.md §2)", () => {
    // Arrange
    const critical = makeFinding({ package: "critical/pkg", verdict: "abandoned", priority: "critical" });
    const odd = makeFinding({ package: "odd/pkg", verdict: "stale", priority: "urgent" });
    const model = modelWith([critical, odd]);

    // Act
    const visible = applyFilters(model, stateWith({ view: "findings" }), "findings");

    // Assert: nothing vanishes, the unknown-priority finding just lands after the known groups.
    expect(visible.map((f) => f.package)).toEqual(["critical/pkg", "odd/pkg"]);
  });

  it("preserves each priority bucket's original relative order", () => {
    // Arrange
    const first = makeFinding({ package: "first/pkg", verdict: "abandoned", priority: "critical" });
    const second = makeFinding({ package: "second/pkg", verdict: "silent", priority: "critical" });
    const model = modelWith([first, second]);

    // Act
    const visible = applyFilters(model, stateWith({ view: "findings" }), "findings");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["first/pkg", "second/pkg"]);
  });
});

describe("applyFilters / packages ordering", () => {
  it("sorts version numerically, not lexicographically (this port's deviation from legacy)", () => {
    // Arrange
    const v2 = makeFinding({ package: "acme/a", version: "2.0.0", verdict: "ok" });
    const v10 = makeFinding({ package: "acme/b", version: "10.0.0", verdict: "ok" });
    const model = modelWith([v10, v2]);
    const state = stateWith({ view: "packages", sort: "version", sortDesc: false });

    // Act
    const visible = applyFilters(model, state, "packages");

    // Assert: plain string compare would put "10.0.0" before "2.0.0"; numeric compare does not.
    expect(visible.map((f) => f.version)).toEqual(["2.0.0", "10.0.0"]);
  });

  it("flips to descending when sortDesc is set", () => {
    // Arrange
    const a = makeFinding({ package: "acme/a", verdict: "ok" });
    const b = makeFinding({ package: "acme/b", verdict: "ok" });
    const model = modelWith([a, b]);
    const state = stateWith({ view: "packages", sort: "package", sortDesc: true });

    // Act
    const visible = applyFilters(model, state, "packages");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["acme/b", "acme/a"]);
  });

  it("sorts an unmeasured libyears finding below every measured one, zero included", () => {
    // Arrange
    const unmeasured = makeFinding({ package: "acme/unmeasured", verdict: "ok", libyears: null });
    const zero = makeFinding({ package: "acme/zero", verdict: "ok", libyears: 0 });
    const model = modelWith([unmeasured, zero]);
    const state = stateWith({ view: "packages", sort: "libyears", sortDesc: false });

    // Act
    const visible = applyFilters(model, state, "packages");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["acme/unmeasured", "acme/zero"]);
  });
});

describe("applyFilters / rail selections", () => {
  it("filters scope: direct excludes a transitive finding", () => {
    // Arrange
    const direct = makeFinding({ package: "direct/pkg", verdict: "abandoned", direct: true });
    const transitive = makeFinding({ package: "transitive/pkg", verdict: "abandoned", direct: false });
    const model = modelWith([direct, transitive]);
    const state = stateWith({ view: "findings", filters: withFilters({ scope: ["direct"] }) });

    // Act
    const visible = applyFilters(model, state, "findings");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["direct/pkg"]);
  });

  it("filters signal: rail selection is an OR across ids, unlike the query's AND", () => {
    // Arrange
    const s1 = makeFinding({ package: "s1/pkg", verdict: "abandoned", signals: [makeSignal({ id: "S1" })] });
    const s9 = makeFinding({ package: "s9/pkg", verdict: "abandoned", signals: [makeSignal({ id: "S9" })] });
    const none = makeFinding({ package: "none/pkg", verdict: "abandoned", signals: [] });
    const model = modelWith([s1, s9, none]);
    const state = stateWith({ view: "findings", filters: withFilters({ signal: ["S1", "S9"] }) });

    // Act
    const visible = applyFilters(model, state, "findings");

    // Assert
    expect(visible.map((f) => f.package).sort()).toEqual(["s1/pkg", "s9/pkg"]);
  });

  it("filters sev/fix by an advisory's normalised severity and fix shape", () => {
    // Arrange
    const critical = makeFinding({
      package: "critical/pkg",
      verdict: "abandoned",
      advisories: [makeAdvisory({ severity: "critical", fixedBy: "2.0.0", fixedOnBranch: true })],
    });
    const low = makeFinding({
      package: "low/pkg",
      verdict: "abandoned",
      advisories: [makeAdvisory({ severity: "low", fixedBy: null })],
    });
    const model = modelWith([critical, low]);
    const state = stateWith({
      view: "findings",
      filters: withFilters({ sev: ["critical"], fix: ["branch"] }),
    });

    // Act
    const visible = applyFilters(model, state, "findings");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["critical/pkg"]);
  });

  it("fixes critic.md M19: a finding with no baseline entry does not count as 'known'", () => {
    // Arrange
    const known = makeFinding({
      package: "known/pkg",
      verdict: "abandoned",
      baseline: { status: "known", previousVerdict: null },
    });
    const noBaseline = makeFinding({ package: "healthy/pkg", verdict: "abandoned", baseline: null });
    const model = modelWith([known, noBaseline]);
    const state = stateWith({ view: "findings", filters: withFilters({ since: ["known"] }) });

    // Act
    const visible = applyFilters(model, state, "findings");

    // Assert
    expect(visible.map((f) => f.package)).toEqual(["known/pkg"]);
  });

  it("selecting both halves of a scope pair together yields nothing (DESIGN.md §5, kept)", () => {
    // Arrange
    const finding = makeFinding({ package: "acme/widget", verdict: "abandoned", direct: true });
    const model = modelWith([finding]);
    const state = stateWith({ view: "findings", filters: withFilters({ scope: ["direct", "transitive"] }) });

    // Act
    const visible = applyFilters(model, state, "findings");

    // Assert
    expect(visible).toEqual([]);
  });
});

describe("railGroups / since", () => {
  it("is absent when the document carries no baseline at all", () => {
    // Arrange
    const model = modelWith([makeFinding({ verdict: "abandoned" })]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));

    // Assert
    expect(groups.some((g) => g.group === "since")).toBe(false);
  });

  it("counts only baseline-recorded statuses under known/new/worsened (M19 fix)", () => {
    // Arrange
    const known = makeFinding({
      package: "known/pkg",
      verdict: "abandoned",
      baseline: { status: "known", previousVerdict: null },
    });
    const noBaseline = makeFinding({ package: "healthy/pkg", verdict: "abandoned", baseline: null });
    const model = modelWith([known, noBaseline], {
      baseline: { path: "baseline.json", known: 1, new: 0, worsened: 0, stale: [] },
    });

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));
    const since = groups.find((g) => g.group === "since");

    // Assert
    expect(since?.title).toBe("Since baseline.json");
    expect(since?.rows).toEqual([
      { key: "new", label: "New", count: 0, on: false },
      { key: "worsened", label: "Worsened", count: 0, on: false },
      { key: "known", label: "Already accepted", count: 1, on: false },
    ]);
  });
});

describe("railGroups / scope", () => {
  it("always renders all four rows, even at zero count", () => {
    // Arrange
    const model = modelWith([]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));
    const scope = groups.find((g) => g.group === "scope");

    // Assert
    expect(scope?.rows.map((r) => r.key)).toEqual(["direct", "transitive", "prod", "dev"]);
    expect(scope?.rows.every((r) => r.count === 0)).toBe(true);
  });

  it("reflects the state's current selection through `on`", () => {
    // Arrange
    const model = modelWith([makeFinding({ verdict: "abandoned", direct: true })]);
    const state = stateWith({ view: "findings", filters: withFilters({ scope: ["direct"] }) });

    // Act
    const groups = railGroups(model, state);
    const scope = groups.find((g) => g.group === "scope");
    const direct = scope?.rows.find((r) => r.key === "direct");

    // Assert
    expect(direct?.on).toBe(true);
    expect(direct?.count).toBe(1);
  });
});

describe("railGroups / signal", () => {
  it("is absent when no signal fired in the tab's population", () => {
    // Arrange
    const model = modelWith([makeFinding({ verdict: "abandoned", signals: [] })]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));

    // Assert
    expect(groups.some((g) => g.group === "signal")).toBe(false);
  });

  it("sorts ids in numeric order: S10 after S9, not between S1 and S2 (critic.md M2 fix)", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "abandoned",
      signals: [
        makeSignal({ id: "S10" }),
        makeSignal({ id: "S2" }),
        makeSignal({ id: "S1" }),
        makeSignal({ id: "S9" }),
      ],
    });
    const model = modelWith([finding]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));
    const signal = groups.find((g) => g.group === "signal");

    // Assert
    expect(signal?.rows.map((r) => r.key)).toEqual(["S1", "S2", "S9", "S10"]);
  });
});

describe("railGroups / fix", () => {
  it("is absent when the population carries no advisory at all", () => {
    // Arrange
    const model = modelWith([makeFinding({ verdict: "abandoned", advisories: [] })]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));

    // Assert
    expect(groups.some((g) => g.group === "fix")).toBe(false);
  });

  it("suppresses a zero-count row and keeps the fixed branch/move/none order", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "abandoned",
      advisories: [makeAdvisory({ fixedBy: "2.0.0", fixedOnBranch: true }), makeAdvisory({ fixedBy: null })],
    });
    const model = modelWith([finding]);

    // Act
    const groups = railGroups(model, stateWith({ view: "findings" }));
    const fix = groups.find((g) => g.group === "fix");

    // Assert: "move" never occurred, so it is dropped entirely, not shown at zero.
    expect(fix?.rows.map((r) => r.key)).toEqual(["branch", "none"]);
  });
});

describe("railGroups counts packages, the unit the rail filters in (PD-RAIL-1)", () => {
  it("counts a package once per fix shape, however many advisories of that shape it carries", () => {
    // Arrange: spomky-labs/otphp's shape in wallabag — two advisories, both fixed only on another
    // branch — beside a package with one advisory of each of the other two shapes.
    const twoMoves = makeFinding({
      package: "acme/moves",
      verdict: "abandoned",
      advisories: [
        makeAdvisory({ id: "GHSA-1", fixedBy: "3.0.0", fixedOnBranch: false }),
        makeAdvisory({ id: "GHSA-2", fixedBy: "3.1.0", fixedOnBranch: false }),
      ],
    });
    const mixed = makeFinding({
      package: "acme/mixed",
      verdict: "abandoned",
      advisories: [
        makeAdvisory({ id: "GHSA-3", fixedBy: "1.0.1", fixedOnBranch: true }),
        makeAdvisory({ id: "GHSA-4", fixedBy: null }),
      ],
    });
    const model = modelWith([twoMoves, mixed]);

    // Act
    const fix = railGroups(model, stateWith({ view: "findings" })).find((g) => g.group === "fix");

    // Assert: one package under each shape, as selecting each lists one package.
    expect(fix?.rows.map((r) => [r.key, r.count])).toEqual([
      ["branch", 1],
      ["move", 1],
      ["none", 1],
    ]);
    for (const row of fix?.rows ?? []) {
      const state = stateWith({ view: "findings", filters: withFilters({ fix: [row.key] }) });
      expect(applyFilters(model, state, "findings")).toHaveLength(row.count);
    }
  });

  it("counts a signal id once per package even when it fired twice on it", () => {
    // Arrange
    const twice = makeFinding({
      package: "acme/twice",
      verdict: "abandoned",
      signals: [makeSignal({ id: "S5" }), makeSignal({ id: "S5" })],
    });
    const model = modelWith([twice]);

    // Act
    const signal = railGroups(model, stateWith({ view: "findings" })).find((g) => g.group === "signal");

    // Assert
    expect(signal?.rows.map((r) => [r.key, r.count])).toEqual([["S5", 1]]);
  });

  it("on Blast radius, counts a flagged direct requirement the footnote names, and no stray one", () => {
    // Arrange: acme/parent heads a card and pulls acme/child; acme/alone is flagged and direct but
    // not in `exposure`, so the tab names it in its footnote, with a link to its detail. acme/stray
    // is transitive and its chain reaches no row, so the tab has no place for it.
    const parent = makeFinding({
      package: "acme/parent",
      verdict: "abandoned",
      direct: true,
      chain: ["acme/parent"],
    });
    const child = makeFinding({
      package: "acme/child",
      verdict: "abandoned",
      direct: false,
      chain: ["acme/parent", "acme/child"],
    });
    const alone = makeFinding({
      package: "acme/alone",
      verdict: "abandoned",
      direct: true,
      chain: ["acme/alone"],
    });
    const stray = makeFinding({
      package: "acme/stray",
      verdict: "abandoned",
      direct: false,
      chain: ["acme/elsewhere", "acme/stray"],
    });
    const model = modelWith([parent, child, alone, stray], {
      exposure: [{ package: "acme/parent", flagged: 1 }],
    });

    // Act
    const scope = (view: "findings" | "radius", key: string) =>
      railGroups(model, stateWith({ view }))
        .find((g) => g.group === "scope")
        ?.rows.find((r) => r.key === key)?.count;

    // Assert: both tabs name both direct ones, so Direct plus Transitive is the flagged count
    // whenever every chain reaches a row; acme/stray is on Findings only.
    expect([scope("findings", "direct"), scope("findings", "transitive")]).toEqual([2, 2]);
    expect([scope("radius", "direct"), scope("radius", "transitive")]).toEqual([2, 1]);
  });
});

describe("hiddenByFilters (PD-DETAIL-4, DESIGN.md §5)", () => {
  it("is false while the package matches the current tab's own filters", () => {
    // Arrange
    const finding = makeFinding({ package: "open/pkg", verdict: "abandoned" });
    const model = modelWith([finding]);

    // Act + Assert
    expect(hiddenByFilters(model, stateWith({ view: "findings" }), "open/pkg")).toBe(false);
  });

  it("is true once a search term excludes it from the tab it still belongs to", () => {
    // Arrange
    const finding = makeFinding({ package: "open/pkg", verdict: "abandoned" });
    const model = modelWith([finding]);

    // Act + Assert
    expect(hiddenByFilters(model, stateWith({ view: "findings", q: "no-such-package" }), "open/pkg")).toBe(
      true,
    );
  });

  it("is true once a rail filter excludes it", () => {
    // Arrange
    const finding = makeFinding({ package: "open/pkg", verdict: "abandoned", direct: true });
    const model = modelWith([finding]);
    const state = stateWith({ view: "findings", filters: withFilters({ scope: ["transitive"] }) });

    // Act + Assert
    expect(hiddenByFilters(model, state, "open/pkg")).toBe(true);
  });

  it("is false for a package the tab never lists at all, filters or not — a different fact", () => {
    // Arrange: an `ok` verdict never enters the Findings population regardless of any filter.
    const finding = makeFinding({ package: "healthy/pkg", verdict: "ok" });
    const model = modelWith([finding]);
    const state = stateWith({ view: "findings", q: "no-such-package" });

    // Act + Assert
    expect(hiddenByFilters(model, state, "healthy/pkg")).toBe(false);
  });
});
