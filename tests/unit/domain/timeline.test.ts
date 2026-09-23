import { describe, expect, it } from "vitest";
import { timelineLayout } from "../../../src/domain/timeline";
import type { BranchRow } from "../../../src/model/types";

function makeBranch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    branch: "1.x",
    installed: false,
    highest: "1.0.0",
    highestReleased: null,
    highestCommitDate: null,
    newestDated: null,
    newestDatedReleased: null,
    datedBy: null,
    php: null,
    ...overrides,
  };
}

describe("timelineLayout / not enough data", () => {
  it("returns an empty layout with fewer than two dated branches", () => {
    // Arrange
    const oneDated = [
      makeBranch({ highestReleased: "2020-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "2.x" }),
    ];

    // Act
    const layout = timelineLayout(oneDated, new Date("2024-01-01T00:00:00.000Z"));

    // Assert
    expect(layout).toEqual({ lanes: [], ticks: [] });
  });

  it("returns an empty layout for zero branches", () => {
    // Act
    const layout = timelineLayout([], new Date("2024-01-01T00:00:00.000Z"));

    // Assert
    expect(layout).toEqual({ lanes: [], ticks: [] });
  });
});

describe("timelineLayout / horizontal position", () => {
  it("plots the oldest dated branch at exactly 4% and a branch halfway to now at 48%", () => {
    // Arrange: min = epoch 0, now = epoch 1,000,000ms, mid-branch at epoch 500,000ms — clean
    // fractions so the 4%/88%-span formula (report.js:677) checks against round numbers.
    const min = new Date(0).toISOString();
    const mid = new Date(500_000).toISOString();
    const now = new Date(1_000_000);
    const branches = [
      makeBranch({ branch: "old", highestReleased: min }),
      makeBranch({ branch: "mid", highestReleased: mid }),
    ];

    // Act
    const layout = timelineLayout(branches, now);
    const oldLane = layout.lanes.find((lane) => lane.branch === "old");
    const midLane = layout.lanes.find((lane) => lane.branch === "mid");

    // Assert
    expect(oldLane?.x).toBeCloseTo(4, 10);
    expect(midLane?.x).toBeCloseTo(48, 10);
  });

  it("never reaches the 92% right edge unless a branch is dated exactly at `now`", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "old", highestReleased: new Date(0).toISOString() }),
      makeBranch({ branch: "recent", highestReleased: new Date(900_000).toISOString() }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date(1_000_000));
    const recentLane = layout.lanes.find((lane) => lane.branch === "recent");

    // Assert
    expect(recentLane?.x).toBeLessThan(92);
  });

  it("plots a branch dated exactly at `now` at the 92% edge", () => {
    // Arrange
    const now = new Date(1_000_000);
    const branches = [
      makeBranch({ branch: "old", highestReleased: new Date(0).toISOString() }),
      makeBranch({ branch: "current", highestReleased: now.toISOString() }),
    ];

    // Act
    const layout = timelineLayout(branches, now);
    const currentLane = layout.lanes.find((lane) => lane.branch === "current");

    // Assert
    expect(currentLane?.x).toBeCloseTo(92, 10);
  });
});

describe("timelineLayout / lane ordering and newest/installed", () => {
  it("orders lanes newest-first and marks exactly one lane as newest", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "9.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "10.x", highestReleased: "2022-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "8.x", highestReleased: "2016-01-01T00:00:00.000Z" }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date("2024-01-01T00:00:00.000Z"));

    // Assert
    expect(layout.lanes.map((lane) => lane.branch)).toEqual(["10.x", "9.x", "8.x"]);
    expect(layout.lanes.filter((lane) => lane.newest)).toHaveLength(1);
    expect(layout.lanes[0]?.newest).toBe(true);
  });

  it("marks `newest` independently of `installed` — the caller decides the is-newest-unless-installed CSS rule", () => {
    // Arrange: the newest branch happens to also be the installed one.
    const branches = [
      makeBranch({ branch: "9.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "10.x", highestReleased: "2022-01-01T00:00:00.000Z", installed: true }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date("2024-01-01T00:00:00.000Z"));
    const newestLane = layout.lanes.find((lane) => lane.branch === "10.x");

    // Assert: both flags are true at once; legacy's CSS-class suppression is a rendering choice,
    // not something this pure layout function should bake in.
    expect(newestLane).toMatchObject({ newest: true, installed: true });
  });
});

describe("timelineLayout / label and date pairing (critic.md M26 fix)", () => {
  it("labels an undated highest tag's commit date with the SAME tag, not a different one's date", () => {
    // Arrange: "2.x" has no highest_released (a shared-commit tag) but does have a commit date for
    // that same highest tag, and a *different*, later-dated newest_dated tag that must not be used.
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({
        branch: "2.x",
        highest: "2.4.0",
        highestReleased: null,
        highestCommitDate: "2020-06-01T00:00:00.000Z",
        newestDated: "2.3.0",
        newestDatedReleased: "2021-09-01T00:00:00.000Z",
      }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date("2024-01-01T00:00:00.000Z"));
    const lane = layout.lanes.find((l) => l.branch === "2.x");

    // Assert: label is the highest tag ("2.4.0"), and the date is that SAME tag's commit date, not
    // "2.3.0"'s later release date.
    expect(lane).toMatchObject({ label: "2.4.0", date: "2020-06-01T00:00:00.000Z" });
  });

  it("falls back to the newest DATED tag, labelled with ITS OWN version, when the highest tag has no date at all", () => {
    // Arrange: "3.x" has neither a release date nor a commit date for its highest tag.
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({
        branch: "3.x",
        highest: "3.1.0",
        highestReleased: null,
        highestCommitDate: null,
        newestDated: "3.0.0",
        newestDatedReleased: "2019-05-01T00:00:00.000Z",
      }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date("2024-01-01T00:00:00.000Z"));
    const lane = layout.lanes.find((l) => l.branch === "3.x");

    // Assert: the label follows the date's own tag ("3.0.0"), never the undated "highest" ("3.1.0").
    expect(lane).toMatchObject({ label: "3.0.0", date: "2019-05-01T00:00:00.000Z" });
  });

  it("excludes a branch with no usable date at all from the dated set", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "2.x", highestReleased: "2020-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "undated", highest: "0.1.0" }),
    ];

    // Act
    const layout = timelineLayout(branches, new Date("2024-01-01T00:00:00.000Z"));

    // Assert
    expect(layout.lanes.map((lane) => lane.branch)).toEqual(["2.x", "1.x"]);
  });
});

describe("timelineLayout / year ticks (critic.md C2 fix)", () => {
  it("keeps the first year tick even though it lands left of the earliest dated release", () => {
    // Arrange: earliest dated release is 2018-03-01, so startYear (2018)'s Jan-1 instant is before
    // `min` — legacy's `if (t < min) continue` (report.js:701) dropped this tick in practice every
    // time; it must survive here.
    const branches = [
      makeBranch({ branch: "9.x", highestReleased: "2018-03-01T00:00:00.000Z" }),
      makeBranch({ branch: "10.x", highestReleased: "2020-06-15T00:00:00.000Z" }),
    ];
    const now = new Date("2022-01-01T00:00:00.000Z");

    // Act
    const layout = timelineLayout(branches, now);

    // Assert: one tick per year, 2018 through 2022 inclusive (step 1, since the span is ≤4 years),
    // and the 2018 tick is present and plots left of the 4% mark the earliest release itself gets.
    expect(layout.ticks.map((tick) => tick.year)).toEqual([2018, 2019, 2020, 2021, 2022]);
    const firstTick = layout.ticks[0];
    expect(firstTick?.year).toBe(2018);
    expect(firstTick?.x).toBeLessThan(4);
  });

  it("steps every 2 years once the span exceeds 4 years, and every 3 beyond 8", () => {
    // Arrange
    const sixYears = [
      makeBranch({ branch: "old", highestReleased: "2016-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "new", highestReleased: "2017-01-01T00:00:00.000Z" }),
    ];
    const tenYears = [
      makeBranch({ branch: "old", highestReleased: "2012-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "new", highestReleased: "2013-01-01T00:00:00.000Z" }),
    ];

    // Act
    const sixYearLayout = timelineLayout(sixYears, new Date("2022-01-01T00:00:00.000Z"));
    const tenYearLayout = timelineLayout(tenYears, new Date("2022-01-01T00:00:00.000Z"));

    // Assert
    expect(sixYearLayout.ticks.map((tick) => tick.year)).toEqual([2016, 2018, 2020, 2022]);
    expect(tenYearLayout.ticks.map((tick) => tick.year)).toEqual([2012, 2015, 2018, 2021]);
  });
});
