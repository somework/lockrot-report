import { describe, expect, it } from "vitest";
import { ageAxis } from "../../../src/domain/age";

const RELEASE_THRESHOLDS = [
  ["release-warn-years", 3],
  ["release-high-years", 5],
] as const;

const PUSH_THRESHOLDS = [
  ["push-warn-years", 3],
  ["push-high-years", 5],
] as const;

const ALL_THRESHOLDS = [...RELEASE_THRESHOLDS, ...PUSH_THRESHOLDS];

describe("ageAxis (PD-ROWS-4)", () => {
  it("spans twice the high threshold, and never less than 10 years", () => {
    // Arrange + Act + Assert: 2 × 5 = 10; a run with high at 8 gets a 16-year axis, one at 2 still 10.
    expect(ageAxis(RELEASE_THRESHOLDS)).toEqual({ warn: 3, high: 5, max: 10 });
    expect(
      ageAxis([
        ["release-warn-years", 4],
        ["release-high-years", 8],
      ]),
    ).toEqual({ warn: 4, high: 8, max: 16 });
    expect(
      ageAxis([
        ["release-warn-years", 1],
        ["release-high-years", 2],
      ]),
    ).toEqual({ warn: 1, high: 2, max: 10 });
  });

  it("does not depend on the rows: the axis a filter leaves is the axis it started with", () => {
    // The old shared maximum followed the oldest row on screen, so filtering rescaled every bar.
    expect(ageAxis(ALL_THRESHOLDS)).toEqual(ageAxis(RELEASE_THRESHOLDS));
  });

  it("falls back to the push pair, and is null when neither pair is complete", () => {
    expect(ageAxis(PUSH_THRESHOLDS)).toEqual({ warn: 3, high: 5, max: 10 });
    expect(ageAxis([["release-warn-years", 3]])).toBeNull();
  });
});
