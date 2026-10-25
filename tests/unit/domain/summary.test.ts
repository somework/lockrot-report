import { describe, expect, it } from "vitest";
import { sharePhrase, waffleRuns } from "../../../src/domain/summary";
import { pageGoldens } from "../words/recorded";

describe("waffleRuns", () => {
  it("keys the allowlisted squares by their verdict word, finished (wallabag, SPEC §7.9.4)", () => {
    const found = pageGoldens().find((entry) => entry.id === "wallabag");
    if (found === undefined) throw new Error("no page golden wallabag");

    const finished = waffleRuns(found.report).find((run) => run.verdict === "finished");

    expect(finished).toMatchObject({ label: "finished", mark: "ring-dot" });
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
