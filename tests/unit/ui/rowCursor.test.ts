import { describe, expect, test } from "vitest";
import { innerTabIndex, pickCursor, rowTabIndex } from "../../../src/ui/rowCursor";

const ROWS = ["a/one", "a/two", "a/three"];

describe("pickCursor: the list's one Tab stop (PD-ROWS-11)", () => {
  test("is the open package's row when the view draws it", () => {
    expect(pickCursor(ROWS, "a/two", "a/three")).toBe("a/two");
  });

  test("falls back to the package last opened, the row Escape just handed focus to", () => {
    expect(pickCursor(ROWS, null, "a/three")).toBe("a/three");
    expect(pickCursor(ROWS, "elsewhere/pkg", "a/three")).toBe("a/three");
  });

  test("falls back to the first row when neither is on screen", () => {
    expect(pickCursor(ROWS, null, null)).toBe("a/one");
    expect(pickCursor(ROWS, "elsewhere/pkg", "gone/too")).toBe("a/one");
  });

  test("is null when the view draws no rows", () => {
    expect(pickCursor([], "a/one", "a/two")).toBeNull();
  });
});

describe("row and inner tab indexes", () => {
  test("the Tab stop's row is 0 and its links keep their own; every other row and link is -1", () => {
    expect(rowTabIndex("a/two", "a/two")).toBe(0);
    expect(rowTabIndex("a/one", "a/two")).toBe(-1);
    expect(innerTabIndex("a/two", "a/two")).toBeUndefined();
    expect(innerTabIndex("a/one", "a/two")).toBe(-1);
    expect(rowTabIndex("a/one", null)).toBe(-1);
  });
});
