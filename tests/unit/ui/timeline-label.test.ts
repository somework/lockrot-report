import { describe, expect, test } from "vitest";
import { labelGrowsLeft } from "../../../src/ui/detail/Timeline";

describe("labelGrowsLeft", () => {
  test("a dot past the middle of the axis puts its label on the left, where there is more room", () => {
    // sensio/framework-extra-bundle in wallabag: branch 5.x plots at ~53%. With legacy's 62% cut-off
    // its label grew right into 45% of the track and was clipped to "… · p…".
    expect(labelGrowsLeft(53)).toBe(true);
    expect(labelGrowsLeft(80)).toBe(true);
  });

  test("a dot left of the middle keeps its label on the right", () => {
    expect(labelGrowsLeft(12)).toBe(false);
    expect(labelGrowsLeft(49.9)).toBe(false);
  });

  test("the exact middle goes right, where the text reads from its dot", () => {
    expect(labelGrowsLeft(50)).toBe(false);
  });
});
