import { describe, expect, it } from "vitest";
import {
  ago,
  joinList,
  namesCapped,
  phpDisplay,
  phpShown,
  shareGlyph,
} from "../../../src/domain/findingWords";

describe("findingWords", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a and b"],
    [["a", "b", "c"], "a, b and c"],
  ])("joins %j as %j", (items, joined) => {
    expect(joinList(items)).toBe(joined);
  });

  it("names three names, then how many more", () => {
    expect(namesCapped(["a", "b", "c"])).toBe("a, b, c");
    expect(namesCapped(["a", "b", "c", "d", "e"])).toBe("a, b, c and 2 more");
  });

  it("reads a published 0 years as under three weeks", () => {
    expect(ago(0)).toBe("less than three weeks ago");
    expect(ago(6.9)).toBe("6.9 years ago");
    expect(ago(1)).toBe("1.0 years ago");
  });

  it("drops only a trailing .0 patch of the lowest php", () => {
    expect(phpDisplay("7.2.0")).toBe("7.2");
    expect(phpDisplay("7.1.3")).toBe("7.1.3");
    expect(phpDisplay("8.1")).toBe("8.1");
  });

  it("prints a php constraint of more than four alternatives by its first and last", () => {
    expect(phpShown("^7.2.5|~8.0.0|~8.1.0")).toBe("^7.2.5|~8.0.0|~8.1.0");
    expect(phpShown("^5.3 || ^7.0 || ^7.1 || ^7.2 || ^8.0")).toBe("^5.3 … ^8.0 (5 alternatives)");
  });

  it("prints a share without a glyph as a fraction", () => {
    expect(shareGlyph({ num: 1, den: 4 })).toBe("¼");
    expect(shareGlyph({ num: 2, den: 5 })).toBe("2/5");
  });
});
