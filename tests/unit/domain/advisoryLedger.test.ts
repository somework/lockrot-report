import { describe, expect, it } from "vitest";
import {
  advisoryChipTitle,
  fixesOfShape,
  reportedAxis,
  reportedYears,
  tallyAdvisories,
  tickLabel,
  worstAdvisory,
} from "../../../src/domain/advisoryLedger";
import { makeAdvisory, makeFinding } from "./fixtures";

const NOW = new Date("2026-09-24T00:00:00+00:00");

describe("reportedYears", () => {
  it("is the years between reported_at and now", () => {
    const years = reportedYears(makeAdvisory({ reportedAt: "2025-09-24T00:00:00+00:00" }), NOW);
    expect(years).toBeCloseTo(1, 2);
  });

  it("is null for an undated or unparseable advisory", () => {
    expect(reportedYears(makeAdvisory({ reportedAt: null }), NOW)).toBeNull();
    expect(reportedYears(makeAdvisory({ reportedAt: "not a date" }), NOW)).toBeNull();
  });

  it("never goes negative for a date after the report's own", () => {
    expect(reportedYears(makeAdvisory({ reportedAt: "2027-01-01T00:00:00+00:00" }), NOW)).toBe(0);
  });
});

describe("tallyAdvisories", () => {
  const prod = makeFinding({ package: "acme/prod", dev: false });
  const dev = makeFinding({ package: "acme/dev", dev: true });
  const pairs = [
    {
      finding: prod,
      advisory: makeAdvisory({
        id: "A",
        severity: "critical",
        fixedBy: "2.0.1",
        fixedOnBranch: true,
        reportedAt: "2026-08-24T00:00:00+00:00",
      }),
    },
    {
      finding: prod,
      advisory: makeAdvisory({ id: "B", severity: "low", fixedBy: "2.0.1", fixedOnBranch: true }),
    },
    {
      finding: dev,
      advisory: makeAdvisory({
        id: "C",
        severity: "unrated",
        fixedBy: "3.0.0",
        fixedOnBranch: false,
        reportedAt: "2024-09-24T00:00:00+00:00",
      }),
    },
    { finding: dev, advisory: makeAdvisory({ id: "D", severity: "high", fixedBy: null }) },
  ];

  it("counts advisories, distinct packages and where each package is installed", () => {
    const tally = tallyAdvisories(pairs, NOW);
    expect(tally.total).toBe(4);
    expect(tally.packages).toEqual(["acme/prod", "acme/dev"]);
    expect(tally.production).toBe(2);
    expect(tally.dev).toBe(2);
  });

  it("counts each fix shape and quotes each distinct fix once, in list order", () => {
    const tally = tallyAdvisories(pairs, NOW);
    expect(tally.shapes).toEqual({ branch: 2, move: 1, none: 1 });
    expect(tally.fixes).toEqual(["2.0.1", "3.0.0"]);
  });

  it("lists severities most severe first, unrated last, and leaves out the empty ones", () => {
    const tally = tallyAdvisories(pairs, NOW);
    expect(tally.severities).toEqual([
      { severity: "critical", count: 1 },
      { severity: "high", count: 1 },
      { severity: "low", count: 1 },
      { severity: "unrated", count: 1 },
    ]);
  });

  it("finds the oldest and newest reported ages over the dated ones only", () => {
    const tally = tallyAdvisories(pairs, NOW);
    expect(tally.oldestYears).toBeCloseTo(2, 1);
    expect(tally.newestYears).toBeCloseTo(1 / 12, 1);
  });

  it("has no ages when nothing is dated", () => {
    const tally = tallyAdvisories(
      pairs.filter((pair) => pair.advisory.reportedAt === null),
      NOW,
    );
    expect(tally.oldestYears).toBeNull();
    expect(tally.newestYears).toBeNull();
  });
});

describe("fixesOfShape", () => {
  it("quotes the fix versions of one shape only", () => {
    const finding = makeFinding();
    const pairs = [
      { finding, advisory: makeAdvisory({ fixedBy: "1.2.3", fixedOnBranch: true }) },
      { finding, advisory: makeAdvisory({ fixedBy: "2.0.0", fixedOnBranch: false }) },
      { finding, advisory: makeAdvisory({ fixedBy: "1.2.3", fixedOnBranch: true }) },
    ];
    expect(fixesOfShape(pairs, "branch")).toEqual(["1.2.3"]);
    expect(fixesOfShape(pairs, "move")).toEqual(["2.0.0"]);
    expect(fixesOfShape(pairs, "none")).toEqual([]);
  });
});

describe("reportedAxis", () => {
  it("draws nothing when no advisory is dated", () => {
    expect(reportedAxis(null)).toBeNull();
  });

  it("spans at least a year, with a half-year tick", () => {
    expect(reportedAxis(0.3)).toEqual({ max: 1, ticks: [0, 0.5, 1] });
    expect(reportedAxis(1)).toEqual({ max: 1, ticks: [0, 0.5, 1] });
  });

  it("rounds the oldest age up to whole years, a tick each up to five", () => {
    expect(reportedAxis(2.6)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
  });

  it("keeps three ticks past five years", () => {
    expect(reportedAxis(7.2)).toEqual({ max: 8, ticks: [0, 4, 8] });
  });
});

describe("tickLabel", () => {
  it("reads 0, months under a year and whole years", () => {
    expect([0, 0.5, 1, 3].map(tickLabel)).toEqual(["0", "6 mo", "1y", "3y"]);
  });
});

describe("worstAdvisory and advisoryChipTitle", () => {
  it("picks the most severe advisory, and none for a finding without", () => {
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "m", severity: "medium" }),
        makeAdvisory({ id: "c", severity: "critical" }),
      ],
    });
    expect(worstAdvisory(finding)?.id).toBe("c");
    expect(worstAdvisory(makeFinding())).toBeNull();
  });

  it("counts severities and quotes each fix the advisories name", () => {
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ severity: "high", fixedBy: "11.5.0", fixedOnBranch: false }),
        makeAdvisory({ severity: "medium", fixedBy: "11.5.0", fixedOnBranch: false }),
      ],
    });
    expect(advisoryChipTitle(finding)).toBe("1 high, 1 medium · fixed only by 11.5.0, on another branch");
  });

  it("says when no fix is listed, for all or some of them", () => {
    const none = makeFinding({ advisories: [makeAdvisory({ severity: "low", fixedBy: null })] });
    expect(advisoryChipTitle(none)).toBe("1 low · no fix listed");
    const mixed = makeFinding({
      advisories: [
        makeAdvisory({ severity: "high", fixedBy: "1.0.1", fixedOnBranch: true }),
        makeAdvisory({ severity: "high", fixedBy: null }),
      ],
    });
    expect(advisoryChipTitle(mixed)).toBe("2 high · fixed by 1.0.1 on your branch · 1 with no fix listed");
  });
});
