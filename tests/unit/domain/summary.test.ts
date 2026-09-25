import { describe, expect, it } from "vitest";
import {
  foldPeek,
  libyearsSplit,
  rankVerdicts,
  sharePhrase,
  WAFFLE_MIN_ROWS,
  waffleRows,
  waffleRuns,
} from "../../../src/domain/summary";
import type { LibyearsBlock } from "../../../src/model/types";

const FLAGGED = ["abandoned", "silent", "pinned", "left-behind", "old-promise", "stale"];

function block(overrides: Partial<LibyearsBlock> = {}): LibyearsBlock {
  return {
    total: 263.6,
    directRequirements: 135.4,
    measured: 265,
    unmeasured: [["branch snapshot", 6]],
    furthestBehind: null,
    ...overrides,
  };
}

describe("waffleRuns", () => {
  it("groups flagged findings by priority, most urgent first, dropping empty runs", () => {
    // Arrange: document order is not priority order.
    const flagged = [
      { priority: "low" },
      { priority: "critical" },
      { priority: "low" },
      { priority: "high" },
    ];

    // Act
    const runs = waffleRuns(flagged);

    // Assert: no "medium" run at all — a zero-width run is never drawn.
    expect(runs).toEqual([
      { priority: "critical", count: 1 },
      { priority: "high", count: 1 },
      { priority: "low", count: 2 },
    ]);
  });

  it("keeps a priority a newer lockrot added, after the four known ones (DESIGN.md §2)", () => {
    // Arrange
    const flagged = [{ priority: "urgent" }, { priority: "medium" }];

    // Act
    const runs = waffleRuns(flagged);

    // Assert
    expect(runs.map((run) => run.priority)).toEqual(["medium", "urgent"]);
  });

  it("returns no run for a clean report", () => {
    // Arrange / Act / Assert
    expect(waffleRuns([])).toEqual([]);
  });
});

describe("waffleRows", () => {
  it("grows rows, not squares, with the lock: 271 packages at 46 columns is 6 rows", () => {
    // Arrange / Act / Assert: ceil(271 / 46) = 6.
    expect(waffleRows(271, 46)).toBe(6);
    expect(waffleRows(271, 26)).toBe(11);
  });

  it("keeps a small lock a block, not a one-row bar", () => {
    // Arrange / Act / Assert: ceil(30 / 46) = 1, floored at the minimum.
    expect(waffleRows(30, 46)).toBe(WAFFLE_MIN_ROWS);
  });

  it("never asks for more rows than there are packages, nor for zero rows", () => {
    // Arrange / Act / Assert
    expect(waffleRows(3, 46)).toBe(3);
    expect(waffleRows(0, 46)).toBe(1);
    expect(waffleRows(10, 0)).toBe(10);
  });
});

describe("sharePhrase", () => {
  it("rounds to a whole percentage", () => {
    // Arrange / Act / Assert: 69 / 271 = 25.46%.
    expect(sharePhrase(69, 271)).toBe("25%");
  });

  it("never reads 0% for a lock with something flagged, nor 100% for one with something clean", () => {
    // Arrange / Act / Assert
    expect(sharePhrase(1, 400)).toBe("under 1%");
    expect(sharePhrase(399, 400)).toBe("over 99%");
  });

  it("says the ends exactly when they are exact", () => {
    // Arrange / Act / Assert
    expect(sharePhrase(0, 10)).toBe("0%");
    expect(sharePhrase(10, 10)).toBe("100%");
    expect(sharePhrase(3, 0)).toBe("0%");
  });
});

describe("rankVerdicts", () => {
  it("ranks the flagged verdicts most common first and keeps the rest apart, in verdict order", () => {
    // Arrange: wallabag_wallabag's counts.
    const counts = {
      abandoned: 21,
      silent: 8,
      pinned: 4,
      "left-behind": 23,
      "old-promise": 1,
      stale: 12,
      unknown: 0,
      finished: 18,
      ok: 184,
    };

    // Act
    const { flagged, quiet } = rankVerdicts(counts, FLAGGED);

    // Assert
    expect(flagged.map((v) => v.verdict)).toEqual([
      "left-behind",
      "abandoned",
      "stale",
      "silent",
      "pinned",
      "old-promise",
    ]);
    expect(quiet).toEqual([
      { verdict: "finished", count: 18 },
      { verdict: "ok", count: 184 },
    ]);
  });

  it("breaks a tie by the verdict's own order, not by chance", () => {
    // Arrange: koel_koel's left-behind and stale are both 3.
    const counts = { stale: 3, "left-behind": 3, silent: 1 };

    // Act
    const { flagged } = rankVerdicts(counts, FLAGGED);

    // Assert
    expect(flagged.map((v) => v.verdict)).toEqual(["left-behind", "stale", "silent"]);
  });

  it("files an unknown verdict by the run's own flagged list", () => {
    // Arrange: a newer lockrot adds "rotten"; one run flags it, another does not.
    const counts = { rotten: 2, ok: 1 };

    // Act
    const flaggedRun = rankVerdicts(counts, [...FLAGGED, "rotten"]);
    const quietRun = rankVerdicts(counts, FLAGGED);

    // Assert
    expect(flaggedRun.flagged).toEqual([{ verdict: "rotten", count: 2 }]);
    expect(quietRun.flagged).toEqual([]);
    expect(quietRun.quiet.map((v) => v.verdict)).toEqual(["ok", "rotten"]);
  });
});

describe("libyearsSplit", () => {
  it("splits the total into the direct sum and the rest", () => {
    // Arrange / Act
    const split = libyearsSplit(block());

    // Assert
    expect(split?.direct).toBe(135.4);
    expect(split?.transitive).toBeCloseTo(128.2, 5);
  });

  it("floors the transitive part at zero when rounding puts direct above the total", () => {
    // Arrange / Act
    const split = libyearsSplit(block({ total: 3.8, directRequirements: 3.81 }));

    // Assert
    expect(split).toEqual({ total: 3.8, direct: 3.8, transitive: 0 });
  });

  it("is null when nothing was measured or the direct part is missing", () => {
    // Arrange / Act / Assert
    expect(libyearsSplit(null)).toBeNull();
    expect(libyearsSplit(block({ measured: 0 }))).toBeNull();
    expect(libyearsSplit(block({ directRequirements: null }))).toBeNull();
    expect(libyearsSplit(block({ total: null }))).toBeNull();
  });
});

describe("foldPeek", () => {
  it("counts what the folded tier holds", () => {
    // Arrange / Act
    const peek = foldPeek({ reasons: 6, advisories: 2, advisoryCheckIncomplete: false, libyears: block() });

    // Assert
    expect(peek).toEqual(["6 reasons", "2 advisories", "263.6 libyears"]);
  });

  it("keeps all three slots when there is nothing to count", () => {
    // Arrange / Act
    const clean = foldPeek({ reasons: 0, advisories: 0, advisoryCheckIncomplete: false, libyears: null });
    const incomplete = foldPeek({
      reasons: 1,
      advisories: 0,
      advisoryCheckIncomplete: true,
      libyears: block({ measured: 0 }),
    });

    // Assert
    expect(clean).toEqual(["nothing flagged", "no advisories", "libyears not measured"]);
    expect(incomplete).toEqual(["1 reason", "advisory check incomplete", "libyears not measured"]);
  });
});
