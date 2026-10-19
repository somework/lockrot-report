import { describe, expect, test } from "vitest";

import { phpAdmits } from "../../../src/domain/phpConstraint";

describe("phpAdmits (SPEC §7.9.19, the PHP a fix needs)", () => {
  test.each([
    [">=8.1.0", "8.4.99", true],
    [">=8.1.0", "8.0.30", false],
    [">= 5.4", "8.4.99", true],
    ["^7.2.5 || ^8.0", "8.4.99", true],
    ["^7.2.5 || ^8.0", "7.1.3", false],
    ["^7.2.5|^8.0", "7.4", true],
    ["^8.2", "8.1.99", false],
    ["~8.1.0", "8.1.99", true],
    ["~8.1.0", "8.2.0", false],
    ["~8.1", "8.4.99", true],
    ["~7.4", "8.0", false],
    ["^0.3", "0.3.9", true],
    ["^0.3", "0.4.0", false],
    ["8.*", "8.4.99", true],
    ["7.*", "8.4.99", false],
    [">=7.2,<8.0", "7.4", true],
    [">=7.2 <8.0", "8.4.99", false],
    ["8.4.99", "8.4.99", true],
    ["<8.5", "8.4.99", true],
    ["!=8.4.99", "8.4.99", false],
    ["*", "8.4.99", true],
  ])("%s admits %s: %s", (constraint, version, admitted) => {
    expect(phpAdmits(constraint, version)).toBe(admitted);
  });

  test("admits nothing for a constraint it cannot read", () => {
    expect(phpAdmits("1.0 - 2.0 @dev", "8.4.99")).toBe(false);
    expect(phpAdmits("", "8.4.99")).toBe(false);
  });
});
