import { describe, expect, test } from "vitest";
import { agePhrase, ageText, countPhrase, day, fixed, plural, pluralNoun } from "../../../src/domain/format";

// Every case here that has a line number in its title is ported verbatim (values unchanged, only
// the assertion syntax adapted) from tests/js/lib.test.js; the ones without are new, covering what
// lib.md's "Not tested" sections flag as gaps in the legacy suite, or the new countPhrase().

describe("day", () => {
  test("keeps the date and drops the clock (lib.test.js:130-135)", () => {
    expect(day("2026-09-21T06:39:08Z")).toBe("2026-09-21");
    expect(day("2026-09-21")).toBe("2026-09-21");
    expect(day(null)).toBe("—");
    expect(day("")).toBe("—");
  });

  test("treats undefined the same as null", () => {
    expect(day(undefined)).toBe("—");
  });

  test("a string already shorter than 10 characters is returned unchanged", () => {
    expect(day("2026-09")).toBe("2026-09");
  });
});

describe("ageText", () => {
  const now = new Date("2026-09-21T00:00:00Z");

  test("says months under a year and tenths of a year over it (lib.test.js:137-142)", () => {
    expect(ageText("2026-06-21T00:00:00Z", now)).toBe("3 mo ago");
    expect(ageText("2023-09-21T00:00:00Z", now)).toBe("3.0 y ago");
    expect(ageText(null, now)).toBe("undated");
  });

  test("never rounds a fresh release down to nothing (lib.test.js:144-149)", () => {
    expect(ageText("2026-09-20T00:00:00Z", now)).toBe("1 mo ago");
    expect(ageText("2026-09-21T00:00:00Z", now)).toBe("1 mo ago");
  });

  test("the exact one-year boundary takes the years branch, not the months one", () => {
    const oneJulianYearMs = 365.25 * 24 * 3600 * 1000;
    const iso = new Date(now.getTime() - oneJulianYearMs).toISOString();
    expect(ageText(iso, now)).toBe("1.0 y ago");
  });

  test("a value that rounds to exactly 12 months still reads as months, not '1.0 y ago'", () => {
    const almostAYearMs = 0.999 * 365.25 * 24 * 3600 * 1000;
    const iso = new Date(now.getTime() - almostAYearMs).toISOString();
    expect(ageText(iso, now)).toBe("12 mo ago");
  });

  test("a future iso produces a negative age, still floored to '1 mo ago'", () => {
    const iso = new Date(now.getTime() + 365.25 * 24 * 3600 * 1000).toISOString();
    expect(ageText(iso, now)).toBe("1 mo ago");
  });

  test("a multi-decade age is not clamped or abbreviated further", () => {
    const iso = new Date(now.getTime() - 20 * 365.25 * 24 * 3600 * 1000).toISOString();
    expect(ageText(iso, now)).toBe("20.0 y ago");
  });
});

describe("plural", () => {
  test("counts one thing as one (lib.test.js:151-155)", () => {
    expect(plural(1, "advisory", "advisories")).toBe("1 advisory");
    expect(plural(2, "advisory", "advisories")).toBe("2 advisories");
    expect(plural(0, "advisory", "advisories")).toBe("0 advisories");
  });

  test("a negative or fractional count still takes the many branch", () => {
    expect(plural(-1, "advisory", "advisories")).toBe("-1 advisories");
    expect(plural(1.5, "advisory", "advisories")).toBe("1.5 advisories");
  });

  test("the equality is strict: a numeric string '1' does not match the number 1", () => {
    // Simulates an untyped caller reaching past the exported number type at runtime.
    const n = "1" as unknown as number;
    expect(plural(n, "advisory", "advisories")).toBe("1 advisories");
  });
});

describe("pluralNoun", () => {
  test("the noun alone, same singular/plural choice as plural() (regression: PriorityLedger's own count stays in its own span)", () => {
    expect(pluralNoun(1, "package", "packages")).toBe("package");
    expect(pluralNoun(2, "package", "packages")).toBe("packages");
    expect(pluralNoun(0, "package", "packages")).toBe("packages");
  });

  test("plural() is pluralNoun() with the count prefixed", () => {
    expect(plural(1, "advisory", "advisories")).toBe(`1 ${pluralNoun(1, "advisory", "advisories")}`);
    expect(plural(4, "advisory", "advisories")).toBe(`4 ${pluralNoun(4, "advisory", "advisories")}`);
  });
});

describe("fixed", () => {
  test("formats a finite number and refuses everything else, null included (lib.test.js:251-258)", () => {
    expect(fixed(4.7123, 1)).toBe("4.7");
    expect(fixed(0, 2)).toBe("0.00");
    expect(fixed(null, 1)).toBeNull();
    expect(fixed("4.7", 1)).toBeNull();
    expect(fixed(Infinity, 1)).toBeNull();
    expect(fixed(undefined, 1)).toBeNull();
  });

  test("rejects every other non-finite or non-number shape", () => {
    expect(fixed(NaN, 1)).toBeNull();
    expect(fixed(-Infinity, 1)).toBeNull();
    expect(fixed(true, 1)).toBeNull();
    expect(fixed([1, 2], 1)).toBeNull();
    expect(fixed({}, 1)).toBeNull();
  });

  test("formats a negative finite number and honours zero or many digits", () => {
    expect(fixed(-4.567, 2)).toBe("-4.57");
    expect(fixed(4.7, 0)).toBe("5");
    expect(fixed(1, 5)).toBe("1.00000");
  });
});

describe("countPhrase", () => {
  test("singularises the noun for exactly one, matching DESIGN.md M21's fix", () => {
    expect(countPhrase(1, 1, "flagged package", "flagged packages")).toBe("1 of 1 flagged package");
    expect(countPhrase(3, 7, "flagged package", "flagged packages")).toBe("3 of 7 flagged packages");
  });

  test("zero of zero stays plural, same as any other non-one count", () => {
    expect(countPhrase(0, 0, "flagged package", "flagged packages")).toBe("0 of 0 flagged packages");
  });
});

describe("agePhrase", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  test("spells out the same figure ageText gives, in years or months", () => {
    expect(agePhrase("2018-06-25T10:20:17Z", now)).toBe("8.2 years ago");
    expect(ageText("2018-06-25T10:20:17Z", now)).toBe("8.2 y ago");
    expect(agePhrase("2026-09-01T00:00:00Z", now)).toBe("1 month ago");
    expect(agePhrase(null, now)).toBe("undated");
  });
});
