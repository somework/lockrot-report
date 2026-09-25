import { describe, expect, test } from "vitest";
import { firstRows, innerTabIndex, pickCursor, rowTabIndex } from "../../../src/ui/rowCursor";

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

// PD-ROWS-12: a package listed on two rows (Advisories, Blast radius) is the Tab stop on its first.
describe("a package listed twice", () => {
  test("is the Tab stop on its first row only", () => {
    expect(rowTabIndex("a/two", "a/two", false)).toBe(-1);
    expect(innerTabIndex("a/two", "a/two", false)).toBe(-1);
    expect(rowTabIndex("a/two", "a/two", true)).toBe(0);
  });

  test("firstRows keeps each package's first row, in screen order", () => {
    const rows = [
      { pkg: "a/one", key: "x" },
      { pkg: "a/two", key: "y" },
      { pkg: "a/one", key: "z" },
    ];
    const first = firstRows(
      rows,
      (row) => row.pkg,
      (row) => row.key,
    );
    expect([...first]).toEqual(["x", "y"]);
    expect(firstRows([], String, String).size).toBe(0);
  });
});
