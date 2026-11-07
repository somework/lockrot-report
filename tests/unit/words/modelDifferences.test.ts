import { expect, test } from "vitest";

import { differingFields, differs } from "./modelDifferences";

test("a block with the same fields in another key order does not differ", () => {
  const page = { text: "if Composer resolves it", tone: "muted" };
  const model = { tone: "muted", text: "if Composer resolves it" };

  expect(differs(page, model)).toBe(false);
  expect(differingFields(page, model)).toEqual([]);
});

test("a block differs where a field differs, and names that field", () => {
  const page = { text: "if Composer resolves it", tone: "muted" };
  const model = { tone: "muted", text: "if Composer resolves both" };

  expect(differs(page, model)).toBe(true);
  expect(differingFields(page, model)).toEqual(["/text"]);
});
