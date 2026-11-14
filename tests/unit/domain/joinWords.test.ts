import { describe, expect, test } from "vitest";

import { joinAnd, listParts } from "../../../src/domain/joinWords";

describe("the list grammar of lockrot's sentences", () => {
  test.each([
    [[], []],
    [["a"], ["a"]],
    [
      ["a", "b"],
      ["a", " and ", "b"],
    ],
    [
      ["a", "b", "c"],
      ["a", ", ", "b", " and ", "c"],
    ],
  ])("puts commas between %j and 'and' before the last", (items, parts) => {
    expect(listParts(items)).toEqual(parts);
  });

  test("keeps each item as it is, whatever its type", () => {
    expect(listParts([{ code: "A" }, { code: "B" }, { code: "C" }])).toEqual([
      { code: "A" },
      ", ",
      { code: "B" },
      " and ",
      { code: "C" },
    ]);
  });

  test.each([[[]], [["a"]], [["a", "b"]], [["a", "b", "c"]], [["a", "b", "c", "d"]]])(
    "joins %j as the parts read",
    (items) => {
      expect(joinAnd(items)).toBe(listParts(items).join(""));
    },
  );
});
