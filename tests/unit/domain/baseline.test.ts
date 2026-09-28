import { describe, expect, it } from "vitest";
import {
  baselineDelta,
  baselineStep,
  findingsCarryBaseline,
  gateFocus,
  gateOutcome,
  gateTally,
} from "../../../src/domain/baseline";
import { applyFilters } from "../../../src/domain/filters";
import { EMPTY_FILTERS, INITIAL_STATE } from "../../../src/state/types";
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

/** A finding lockrot judged against fail-on: `reaches` and, when it reaches, `exempt`. */
function judged(finding: Finding, reaches: boolean, exemptBy: string | null = null): Finding {
  return { ...finding, gate: { reachesFailOn: reaches, fails: reaches && exemptBy === null, exemptBy } };
}

const GATE = { fails: true, trippedBy: ["fail_on"], failOnApplied: true } as const;

function gatedModel(
  findings: readonly Finding[],
  {
    failOn,
    kind,
    baseline = null,
  }: { failOn: string; kind: string | null; baseline?: BaselineSummary | null },
): Model {
  const model = modelWith(findings, { failOn, baseline });
  return {
    ...model,
    report: { ...model.report, run: { ...model.report.run, failOnKind: kind }, gate: GATE },
  };
}

describe("gateTally", () => {
  const findings = [
    judged(makeFinding({ package: "a/crit", verdict: "abandoned", priority: "critical" }), true),
    judged(makeFinding({ package: "s/high", verdict: "silent", priority: "high" }), true),
    judged(makeFinding({ package: "l/med", verdict: "left-behind", priority: "medium" }), false),
    judged(makeFinding({ package: "ok/none", verdict: "ok", priority: "none" }), false),
  ];

  it("counts the findings lockrot says reach fail-on, whatever the page would rank them", () => {
    // l/med is medium: a copy of lockrot's order would count it under `low`; its gate says no.
    expect(gateTally(gatedModel(findings, { failOn: "low", kind: "priority" }))).toEqual({
      failOn: "low",
      kind: "priority",
      reached: 2,
      notAccepted: null,
      otherExemptions: [],
    });
  });

  it("counts a threshold this page does not know, since the finding's gate states it", () => {
    expect(gateTally(gatedModel(findings, { failOn: "licence-x", kind: "licence" }))?.reached).toBe(2);
  });

  it("is null with fail-on none, and when no gate field states anything", () => {
    expect(gateTally(gatedModel(findings, { failOn: "none", kind: "none" }))).toBeNull();
    // A report without the root gate: the findings' reach is unstated, so nothing is counted.
    expect(gateTally(modelWith([makeFinding({ priority: "critical" })], { failOn: "high" }))).toBeNull();
    expect(gateTally(modelWith([makeFinding()]))).toBeNull();
  });

  it("with a baseline, counts how many of those the baseline does not exempt", () => {
    const withState = [
      judged(known("a/crit", { verdict: "abandoned", priority: "critical" }), true, "baseline"),
      judged(
        makeFinding({
          package: "s/high",
          verdict: "silent",
          priority: "high",
          baseline: { status: "worsened", previousVerdict: "stale" },
        }),
        true,
      ),
      // Known but not reaching: nothing exempts it, and it is not counted at all.
      judged(known("k/low", { verdict: "stale", priority: "low" }), false),
    ];

    const tally = gateTally(gatedModel(withState, { failOn: "high", kind: "priority", baseline: SUMMARY }));

    expect(tally).toEqual({
      failOn: "high",
      kind: "priority",
      reached: 2,
      notAccepted: 1,
      otherExemptions: [],
    });
  });

  it("counts a finding another exemption covers as exempt, and names that exemption as written", () => {
    const withWaiver = [
      judged(known("a/crit", { verdict: "abandoned", priority: "critical" }), true, "baseline"),
      judged(makeFinding({ package: "w/high", verdict: "silent", priority: "high" }), true, "waiver"),
      judged(makeFinding({ package: "n/high", verdict: "silent", priority: "high" }), true),
    ];

    const tally = gateTally(gatedModel(withWaiver, { failOn: "high", kind: "priority", baseline: SUMMARY }));

    expect(tally?.notAccepted).toBe(1);
    expect(tally?.otherExemptions).toEqual(["waiver"]);
  });
});

// PD-BASELINE-6: the rail filters behind the header's "N of them not accepted".
describe("gateFocus", () => {
  const worsened = { status: "worsened", previousVerdict: "stale" } as const;
  const fresh = { status: "new", previousVerdict: null } as const;
  const findings = [
    judged(known("a/crit", { verdict: "abandoned", priority: "critical" }), true, "baseline"),
    judged(makeFinding({ package: "s/high", verdict: "silent", priority: "high", baseline: worsened }), true),
    judged(
      makeFinding({ package: "n/crit", verdict: "abandoned", priority: "critical", baseline: fresh }),
      true,
    ),
    judged(makeFinding({ package: "n/low", verdict: "stale", priority: "low", baseline: fresh }), false),
  ];

  it("lists the not-exempt findings that reach a priority threshold, and only them", () => {
    const model = gatedModel(findings, { failOn: "high", kind: "priority", baseline: SUMMARY });

    const filters = gateFocus(model);

    // The new low one does not reach and the accepted critical one is exempt: both left out.
    expect(filters).toEqual({ ...EMPTY_FILTERS, prio: ["critical", "high"], since: ["new", "worsened"] });
    const listed = applyFilters(model, { ...INITIAL_STATE, filters: filters ?? EMPTY_FILTERS }, "findings");
    expect(listed.map((f) => f.package).sort()).toEqual(["n/crit", "s/high"]);
    expect(listed).toHaveLength(gateTally(model)?.notAccepted ?? -1);
  });

  it("uses the verdict group for a verdict threshold, in lockrot's severity order", () => {
    const filters = gateFocus(gatedModel(findings, { failOn: "silent", kind: "verdict", baseline: SUMMARY }));
    expect(filters?.verdict).toEqual(["abandoned", "silent"]);
    expect(filters?.prio).toEqual([]);
  });

  it("uses the S10 signal for unchecked", () => {
    const s10 = judged(
      makeFinding({
        package: "u/s10",
        verdict: "stale",
        priority: "low",
        signals: [makeSignal({ id: "S10" })],
        baseline: fresh,
      }),
      true,
    );
    const others = findings.map((f) => judged(f, false));
    expect(
      gateFocus(gatedModel([...others, s10], { failOn: "unchecked", kind: "unchecked", baseline: SUMMARY })),
    ).toEqual({ ...EMPTY_FILTERS, signal: ["S10"], since: ["new"] });
  });

  it("is null for a kind of threshold no rail group stands for", () => {
    expect(
      gateFocus(gatedModel(findings, { failOn: "licence-x", kind: "licence", baseline: SUMMARY })),
    ).toBeNull();
  });

  it("is null with no baseline, no gate, or nothing outside the baseline to list", () => {
    expect(gateFocus(gatedModel(findings, { failOn: "high", kind: "priority" }))).toBeNull();
    expect(gateFocus(modelWith(findings, { failOn: "high", baseline: SUMMARY }))).toBeNull();
    expect(gateFocus(gatedModel(findings, { failOn: "none", kind: "none", baseline: SUMMARY }))).toBeNull();
    expect(
      gateFocus(
        gatedModel([findings[0] as Finding], { failOn: "high", kind: "priority", baseline: SUMMARY }),
      ),
    ).toBeNull();
  });

  it("is null when a finding in the set has no baseline state the Since filter could match", () => {
    const nostate = judged(makeFinding({ package: "s/nostate", verdict: "silent", priority: "high" }), true);
    expect(
      gateFocus(gatedModel([...findings, nostate], { failOn: "high", kind: "priority", baseline: SUMMARY })),
    ).toBeNull();
  });

  it("is null when a finding in the set is not on the Findings list at all", () => {
    const unlisted = judged(
      makeFinding({ package: "ok/high", verdict: "ok", priority: "high", baseline: fresh }),
      true,
    );
    expect(
      gateFocus(gatedModel([...findings, unlisted], { failOn: "high", kind: "priority", baseline: SUMMARY })),
    ).toBeNull();
  });
});

describe("gateOutcome", () => {
  it("reads the finding's gate: exempt by the baseline, fails, or nothing to say", () => {
    const f = makeFinding();
    expect(gateOutcome(judged(f, true, "baseline"))).toBe("accepted");
    expect(gateOutcome(judged(f, true))).toBe("fails");
    expect(gateOutcome(judged(f, false))).toBeNull();
    // An exemption this page does not know, a run that applies no fail-on, no gate at all.
    expect(gateOutcome(judged(f, true, "waiver"))).toBeNull();
    expect(gateOutcome({ ...f, gate: { reachesFailOn: true, fails: false, exemptBy: null } })).toBeNull();
    expect(gateOutcome(f)).toBeNull();
  });
});
