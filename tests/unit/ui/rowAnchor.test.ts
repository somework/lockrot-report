import { afterEach, describe, expect, test } from "vitest";
import { anchorShift, measureRow, roomBelow } from "../../../src/ui/rowAnchor";

/** A list of rows whose viewport tops the test sets, as jsdom lays nothing out itself. */
function list(tops: Record<string, number>): HTMLElement {
  const root = document.createElement("div");
  for (const [pkg, top] of Object.entries(tops)) {
    const row = document.createElement("div");
    row.setAttribute("data-pkg", pkg);
    row.getBoundingClientRect = () => ({ top }) as DOMRect;
    root.append(row);
  }
  document.body.append(root);

  return root;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("measureRow", () => {
  test("reads the row's viewport top", () => {
    expect(measureRow(list({ "a/b": 480 }), "a/b")).toEqual({ pkg: "a/b", top: 480 });
  });

  test("is null with no package, or no row for it on screen", () => {
    const root = list({ "a/b": 480 });
    expect(measureRow(root, null)).toBeNull();
    expect(measureRow(root, "not/listed")).toBeNull();
  });

  test("finds a name a selector would choke on", () => {
    expect(measureRow(list({ "we[ird]\\name": 12 }), "we[ird]\\name")?.top).toBe(12);
  });
});

describe("anchorShift", () => {
  test("is how far the row moved: down after the list grew above it, up after it shrank", () => {
    expect(anchorShift(list({ "a/b": 869 }), { pkg: "a/b", top: 480 })).toBe(389);
    expect(anchorShift(list({ "a/b": 480 }), { pkg: "a/b", top: 869 })).toBe(-389);
  });

  test("is 0 when nothing was measured, the row is gone, or it moved less than a pixel", () => {
    const root = list({ "a/b": 480.4 });
    expect(anchorShift(root, null)).toBe(0);
    expect(anchorShift(root, { pkg: "gone/row", top: 100 })).toBe(0);
    expect(anchorShift(root, { pkg: "a/b", top: 480 })).toBe(0);
  });
});

describe("roomBelow", () => {
  test("is what the page lacks below its end to scroll the row back: a row near the end of a short page", () => {
    expect(roomBelow(105, 800, 820)).toBe(85);
  });

  test("is 0 when the page can scroll that far, or the row moved up", () => {
    expect(roomBelow(105, 654, 820)).toBe(0);
    expect(roomBelow(105, 715, 820)).toBe(0);
    expect(roomBelow(-190, 820, 820)).toBe(0);
  });
});
