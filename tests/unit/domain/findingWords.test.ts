import { expect, it } from "vitest";

import { namesCapped } from "../../../src/domain/findingWords";

it("names three names, then how many more", () => {
  expect(namesCapped(["a", "b", "c"])).toBe("a, b, c");
  expect(namesCapped(["a", "b", "c", "d", "e"])).toBe("a, b, c and 2 more");
});
