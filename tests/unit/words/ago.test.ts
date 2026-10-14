import { describe, expect, test } from "vitest";

import { ago } from "../../../src/domain/ago";
import { readContractJson } from "./recorded";

const { pairs } = readContractJson("en", "years-phrases.json") as {
  pairs: { value: number; phrase: string }[];
};

describe("ago", () => {
  test("lockrot recorded pairs to check against", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  test.each(pairs)("$value is $phrase", ({ value, phrase }) => {
    expect(ago(value)).toBe(phrase);
  });
});
