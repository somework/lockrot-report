import { describe, expect, it } from "vitest";
import {
  cssString,
  printSections,
  rollupClauses,
  runningLine,
  scopeRollup,
  sharedDataDay,
  summaryText,
  type SummaryFacts,
} from "../../../src/domain/share";

function flagged(spec: readonly [dev: boolean, direct: boolean, priority?: string][]) {
  return spec.map(([dev, direct, priority = "high"]) => ({ dev, direct, priority }));
}

function facts(overrides: Partial<SummaryFacts> = {}): SummaryFacts {
  return {
    project: "wallabag/wallabag",
    generatedDay: "2026-09-24",
    toolVersion: "0.11.0",
    targetPhp: "8.4",
    checked: 271,
    flagged: flagged([
      [false, true, "critical"],
      [false, false, "high"],
      [true, false, "low"],
    ]),
    advisories: 2,
    advisoryPackages: 1,
    advisoryCheckIncomplete: false,
    libyears: {
      total: 263.6,
      directRequirements: 135.4,
      measured: 265,
      unmeasured: [],
      furthestBehind: null,
    },
    ...overrides,
  };
}

describe("scopeRollup", () => {
  it("counts the flagged packages by install scope and by reach, each split adding up to the total", () => {
    // Arrange
    const list = flagged([
      [false, true],
      [false, false],
      [true, false],
      [true, true],
      [false, false],
    ]);

    // Act
    const rollup = scopeRollup(list);

    // Assert
    expect(rollup).toEqual({ total: 5, production: 3, dev: 2, direct: 2, transitive: 3 });
  });

  it("is all zeros for no flagged package", () => {
    expect(scopeRollup([])).toEqual({ total: 0, production: 0, dev: 0, direct: 0, transitive: 0 });
  });
});

describe("rollupClauses", () => {
  it("names both sides of each split: install scope first, then reach", () => {
    const clauses = rollupClauses({ total: 69, production: 51, dev: 18, direct: 20, transitive: 49 });

    expect(clauses).toEqual(["51 in production, 18 dev-only", "20 required directly, 49 pulled in"]);
  });

  it('says "all N" when one side of a split is empty, rather than "0 dev-only"', () => {
    const clauses = rollupClauses({ total: 4, production: 0, dev: 4, direct: 4, transitive: 0 });

    expect(clauses).toEqual(["all 4 dev-only", "all 4 required directly"]);
  });

  it('reads a single package without a count: "in production", not "all 1 in production"', () => {
    const clauses = rollupClauses({ total: 1, production: 1, dev: 0, direct: 0, transitive: 1 });

    expect(clauses).toEqual(["in production", "pulled in"]);
  });

  it("is empty for no flagged package, so the band prints no line of zeros", () => {
    expect(rollupClauses({ total: 0, production: 0, dev: 0, direct: 0, transitive: 0 })).toEqual([]);
  });
});

describe("summaryText", () => {
  it("is three lines: the run, the headline count by priority, then scope, advisories and libyears", () => {
    // Act
    const lines = summaryText(facts()).split("\n");

    // Assert
    expect(lines).toEqual([
      "lockrot report for wallabag/wallabag · data as of 2026-09-24 · lockrot 0.11.0 · target PHP 8.4",
      "3 of 271 packages flagged (1%): 1 critical, 1 high, 1 low.",
      "2 in production, 1 dev-only · 1 required directly, 2 pulled in · 2 security advisories on 1 package · 263.6 libyears behind.",
    ]);
  });

  it("leaves out what the document does not state rather than printing a placeholder", () => {
    const lines = summaryText(facts({ toolVersion: null, targetPhp: null, libyears: null })).split("\n");

    expect(lines[0]).toBe("lockrot report for wallabag/wallabag · data as of 2026-09-24");
    expect(lines[2]).not.toContain("libyears");
  });

  it("says a clean lock is clean, and an empty lock empty, with no scope clause", () => {
    const clean = summaryText(facts({ flagged: [], advisories: 0, advisoryPackages: 0 })).split("\n");
    const empty = summaryText(facts({ checked: 0, flagged: [], advisories: 0, advisoryPackages: 0 })).split(
      "\n",
    );

    expect(clean[1]).toBe("Nothing flagged in 271 packages.");
    expect(clean[2]).toBe("No security advisory · 263.6 libyears behind.");
    expect(empty[1]).toBe("No packages in this lock.");
  });

  it("does not call an incomplete advisory check clean", () => {
    const text = summaryText(facts({ advisories: 0, advisoryPackages: 0, advisoryCheckIncomplete: true }));

    expect(text).toContain("no advisory found, but the advisory check was incomplete");
  });

  it("says a count of advisories from an incomplete check may be partial (PD-ADV-7)", () => {
    const text = summaryText(facts({ advisories: 6, advisoryPackages: 5, advisoryCheckIncomplete: true }));

    expect(text).toContain(
      "6 security advisories on 5 packages (advisory check incomplete, so the list may be partial)",
    );
  });

  it("keeps a priority a newer lockrot added, after the four known ones", () => {
    const text = summaryText(
      facts({
        flagged: flagged([
          [false, true, "urgent"],
          [false, true, "low"],
        ]),
      }),
    );

    expect(text.split("\n")[1]).toContain(": 1 low, 1 urgent.");
  });
});

describe("sharedDataDay", () => {
  it("is the one day every package's data is as of", () => {
    expect(
      sharedDataDay([{ dataDate: "2026-09-24T03:00:00+00:00" }, { dataDate: "2026-09-24T21:10:00+00:00" }]),
    ).toBe("2026-09-24");
  });

  it("is null when the days differ, when one is undated, or when there are no packages", () => {
    expect(
      sharedDataDay([{ dataDate: "2026-09-24T00:00:00Z" }, { dataDate: "2026-09-23T00:00:00Z" }]),
    ).toBeNull();
    expect(sharedDataDay([{ dataDate: "2026-09-24T00:00:00Z" }, { dataDate: null }])).toBeNull();
    expect(sharedDataDay([{ dataDate: null }])).toBeNull();
    expect(sharedDataDay([])).toBeNull();
  });
});

describe("runningLine", () => {
  it("joins the project, the data date and the lockrot version", () => {
    expect(runningLine("acme/app", "2026-09-24", "0.11.0")).toBe(
      "acme/app  ·  data as of 2026-09-24  ·  lockrot 0.11.0",
    );
    expect(runningLine("acme/app", "2026-09-24", null)).toBe("acme/app  ·  data as of 2026-09-24");
  });
});

describe("cssString", () => {
  it("quotes plain text as a CSS string", () => {
    expect(cssString("acme/app")).toBe('"acme/app"');
  });

  it("escapes quotes, backslashes and control characters so the value cannot end the string", () => {
    expect(cssString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\a d"');
  });
});

describe("printSections", () => {
  it("prints the same five sections from every tab but All packages", () => {
    for (const view of ["findings", "advisories", "radius", "run"] as const) {
      expect(printSections(view)).toEqual(["summary", "findings", "advisories", "radius", "run"]);
    }
  });

  it("adds All packages last only when the reader printed from that tab", () => {
    expect(printSections("packages")).toEqual([
      "summary",
      "findings",
      "advisories",
      "radius",
      "run",
      "packages",
    ]);
  });
});
