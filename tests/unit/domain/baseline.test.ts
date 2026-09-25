import { describe, expect, it } from "vitest";
import { baselineDelta, baselineStep, findingsCarryBaseline, gateTally } from "../../../src/domain/baseline";
import type { BaselineSummary, Finding, Model } from "../../../src/model/types";
import { makeFinding, makeModel, makeSignal } from "./fixtures";

const FLAGGED_VERDICTS = ["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"] as const;

function modelWith(
  findings: readonly Finding[],
  { failOn = null, baseline = null }: { failOn?: string | null; baseline?: BaselineSummary | null } = {},
): Model {
  const model = makeModel(findings);
  return {
    ...model,
    report: {
      ...model.report,
      run: { ...model.report.run, flaggedVerdicts: [...FLAGGED_VERDICTS], failOn },
      baseline,
    },
  };
}

const SUMMARY: BaselineSummary = {
  path: "lockrot-baseline.json",
  known: 2,
  new: 1,
  worsened: 1,
  stale: ["gone/one", "gone/two"],
};

const known = (pkg: string, overrides: Partial<Finding> = {}) =>
  makeFinding({ package: pkg, baseline: { status: "known", previousVerdict: "abandoned" }, ...overrides });

describe("baselineDelta", () => {
  it("is null when the run compared nothing against a baseline", () => {
    expect(baselineDelta(modelWith([makeFinding()]))).toBeNull();
  });

  it("counts the flagged findings' own states, so each count matches the list it filters to", () => {
    // Arrange: the summary block says 2 known, the findings carry 3 — the findings win.
    const model = modelWith(
      [
        makeFinding({ package: "n/a", baseline: { status: "new", previousVerdict: null } }),
        makeFinding({
          package: "w/a",
          verdict: "silent",
          baseline: { status: "worsened", previousVerdict: "stale" },
        }),
        known("k/a"),
        known("k/b"),
        known("k/c"),
        // Not a finding on the Findings tab: counted nowhere, whatever it carries.
        makeFinding({
          package: "ok/a",
          verdict: "ok",
          baseline: { status: "known", previousVerdict: "stale" },
        }),
      ],
      { baseline: SUMMARY },
    );

    // Act
    const delta = baselineDelta(model);

    // Assert
    expect(delta).toEqual({
      path: "lockrot-baseline.json",
      new: 1,
      worsened: 1,
      known: 3,
      gone: ["gone/one", "gone/two"],
      filterable: true,
    });
  });

  it("falls back to the summary block, unfilterable, when no finding carries its own state", () => {
    const delta = baselineDelta(modelWith([makeFinding()], { baseline: SUMMARY }));
    expect(delta).toMatchObject({ new: 1, worsened: 1, known: 2, filterable: false });
  });

  it("ignores a status this renderer does not know rather than filing it under one it does", () => {
    const model = modelWith(
      [
        makeFinding({ package: "x/a", baseline: { status: "reappeared", previousVerdict: null } }),
        known("k/a"),
      ],
      { baseline: SUMMARY },
    );
    expect(baselineDelta(model)).toMatchObject({ new: 0, worsened: 0, known: 1 });
  });
});

describe("findingsCarryBaseline", () => {
  it("is true only when some finding carries lockrot's per-finding state", () => {
    expect(findingsCarryBaseline(modelWith([makeFinding()]))).toBe(false);
    expect(findingsCarryBaseline(modelWith([known("k/a")]))).toBe(true);
  });
});

describe("baselineStep", () => {
  it("reads previous and current straight off the finding", () => {
    const finding = makeFinding({
      verdict: "silent",
      baseline: { status: "worsened", previousVerdict: "stale" },
    });
    expect(baselineStep(finding)).toEqual({ status: "worsened", previous: "stale", current: "silent" });
  });

  it("is null for a finding the baseline says nothing about", () => {
    expect(baselineStep(makeFinding())).toBeNull();
  });
});

describe("gateTally", () => {
  const findings = [
    makeFinding({ package: "a/crit", verdict: "abandoned", priority: "critical" }),
    makeFinding({ package: "s/high", verdict: "silent", priority: "high" }),
    makeFinding({ package: "l/med", verdict: "left-behind", priority: "medium" }),
    makeFinding({ package: "st/low", verdict: "stale", priority: "low" }),
    makeFinding({ package: "ok/none", verdict: "ok", priority: "none" }),
    makeFinding({
      package: "u/unknown",
      verdict: "unknown",
      priority: "none",
      signals: [makeSignal({ id: "S10" })],
    }),
  ];

  it("is null with no fail-on recorded, with fail-on none, and with a value it does not know", () => {
    expect(gateTally(modelWith(findings))).toBeNull();
    expect(gateTally(modelWith(findings, { failOn: "none" }))).toBeNull();
    expect(gateTally(modelWith(findings, { failOn: "catastrophic" }))).toBeNull();
  });

  it("counts a priority threshold by lockrot's rank: high reaches critical and high", () => {
    expect(gateTally(modelWith(findings, { failOn: "high" }))).toEqual({
      failOn: "high",
      reached: 2,
      notAccepted: null,
    });
    expect(gateTally(modelWith(findings, { failOn: "low" }))?.reached).toBe(4);
  });

  it("counts a verdict threshold by lockrot's severity: silent reaches silent and abandoned", () => {
    expect(gateTally(modelWith(findings, { failOn: "silent" }))?.reached).toBe(2);
    expect(gateTally(modelWith(findings, { failOn: "stale" }))?.reached).toBe(4);
  });

  it("counts unchecked as every finding carrying S10, flagged or not", () => {
    expect(gateTally(modelWith(findings, { failOn: "unchecked" }))?.reached).toBe(1);
  });

  it("with a baseline, counts how many of those the baseline does not already accept", () => {
    // Arrange: a/crit is accepted; s/high worsened; everything else as above.
    const withState = [
      known("a/crit", { verdict: "abandoned", priority: "critical" }),
      makeFinding({
        package: "s/high",
        verdict: "silent",
        priority: "high",
        baseline: { status: "worsened", previousVerdict: "stale" },
      }),
      ...findings.slice(2),
    ];

    // Act
    const tally = gateTally(modelWith(withState, { failOn: "high", baseline: SUMMARY }));

    // Assert
    expect(tally).toEqual({ failOn: "high", reached: 2, notAccepted: 1 });
  });

  it("leaves the not-accepted count out when the findings carry no state to count it from", () => {
    expect(gateTally(modelWith(findings, { failOn: "high", baseline: SUMMARY }))?.notAccepted).toBeNull();
  });
});
