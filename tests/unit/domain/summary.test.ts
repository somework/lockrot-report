import { describe, expect, it } from "vitest";
import { sharePhrase, waffleRows } from "../../../src/domain/summary";

describe("waffleRows", () => {
  it("grows rows, not squares, with the lock: 271 packages at 46 columns is 6 rows", () => {
    // Arrange / Act / Assert: ceil(271 / 46) = 6.
    expect(waffleRows(271, 46)).toBe(6);
    expect(waffleRows(271, 26)).toBe(11);
  });

  it("grows a mid-sized lock into a block of at least five rows, not a long bar", () => {
    // Arrange / Act / Assert: ceil(202 / 50) = 5; 60 packages at ten a row would be 6, capped at 5.
    expect(waffleRows(202, 50)).toBe(5);
    expect(waffleRows(60, 50)).toBe(5);
  });

  it("keeps a small lock a short strip, ten squares a row", () => {
    // Arrange / Act / Assert: 4 → one row of 4; 30 → three rows of 10.
    expect(waffleRows(4, 46)).toBe(1);
    expect(waffleRows(30, 46)).toBe(3);
  });

  it("never asks for more rows than there are packages, nor for zero rows", () => {
    // Arrange / Act / Assert
    expect(waffleRows(1, 46)).toBe(1);
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
