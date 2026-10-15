import { describe, expect, test } from "vitest";

import { branchTimeline, laneWords, xOfYears } from "../../../src/domain/branchTimeline";
import { recordedCases } from "./recorded";

const byName = (name: string) => {
  const recorded = recordedCases().find((c) => c.name === name);
  if (recorded === undefined) throw new Error(`no recorded case ${name}`);
  return recorded;
};

const shape = (name: string) => {
  const { finding, run, metadata } = byName(name);
  return branchTimeline(finding, metadata, run)?.rows.map((row) =>
    row.kind === "lane" ? row.lane.branch : `${row.which}:${row.lanes.map((l) => l.branch).join(",")}`,
  );
};

describe("the rows of the timeline", () => {
  test("B folds the five branches between the newest and yours", () => {
    expect(shape("B")).toEqual(["8.x", "between:7.x,6.x,5.x,4.x,3.x", "2.x"]);
  });

  test("A draws every branch: one newer, yours, one older", () => {
    expect(shape("A")).toEqual(["3.x", "2.x", "1.x"]);
  });

  test("flysystem folds the five older branches below yours", () => {
    expect(shape("flysystem")).toEqual(["3.x", "2.x", "1.x", "older:0.5.x,0.4.x,0.3.x,0.2.x,0.1.x"]);
  });

  test("a single branch draws no timeline", () => {
    expect(shape("F")).toBeUndefined();
    expect(shape("G")).toBeUndefined();
  });
});

describe("lengths are the published years", () => {
  test("the installed row reads age.branch_release, the others released_years", () => {
    const { finding, run, metadata } = byName("B");
    const timeline = branchTimeline(finding, metadata, run);
    const lanes = timeline?.rows.flatMap((row) => (row.kind === "lane" ? [row.lane] : row.lanes)) ?? [];

    expect(lanes.map((l) => [l.branch, l.years])).toEqual([
      ["8.x", 0.1],
      ["7.x", 0.1],
      ["6.x", 0.1],
      ["5.x", 0.4],
      ["4.x", 4.3],
      ["3.x", 5.9],
      ["2.x", finding.age.branch_release?.years],
    ]);
    expect(timeline?.span).toBe(7);
  });

  test("an undated row keeps its place with no length", () => {
    const { finding, run, metadata } = byName("C");
    const timeline = branchTimeline(finding, metadata, run);
    const last = timeline?.rows.at(-1);

    expect(last).toMatchObject({ kind: "lane", lane: { branch: "2.x", years: null } });
    expect(last?.kind === "lane" && laneWords(last.lane)).toMatch(/undated$/);
  });
});

describe("the age-limit guides", () => {
  test("sit at the run's release thresholds", () => {
    const { finding, run, metadata } = byName("B");

    expect(branchTimeline(finding, metadata, run)?.guides).toEqual([
      { years: run.thresholds?.["release-warn-years"], level: "warn" },
      { years: run.thresholds?.["release-high-years"], level: "high" },
    ]);
  });

  test("are absent when the run has no thresholds", () => {
    const { finding, run, metadata } = byName("B");

    expect(branchTimeline(finding, metadata, { ...run, thresholds: null })?.guides).toEqual([]);
  });

  test("are left out past the axis", () => {
    const { finding, run, metadata } = byName("A");

    expect(branchTimeline(finding, metadata, run)?.guides).toEqual([]);
  });
});

test("a place runs from the left end to the run", () => {
  expect([xOfYears(7, 7), xOfYears(0, 7), xOfYears(3.5, 7), xOfYears(9, 7)]).toEqual([0, 100, 50, 0]);
});
