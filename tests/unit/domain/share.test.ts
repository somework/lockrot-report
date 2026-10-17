import { describe, expect, it } from "vitest";
import { cssString, dataDay, printSections, printSheetIntro, runningLine } from "../../../src/domain/share";

describe("runningLine", () => {
  it("joins the project, the data date and the lockrot version", () => {
    expect(runningLine("acme/app", "2026-09-24", "0.11.0")).toBe(
      "acme/app  ·  data as of 2026-09-24  ·  lockrot 0.11.0",
    );
    expect(runningLine("acme/app", "2026-09-24", null)).toBe("acme/app  ·  data as of 2026-09-24");
  });
});

describe("dataDay", () => {
  it("is the day of the root data_date", () => {
    expect(dataDay("2026-10-01T17:39:31+00:00")).toBe("2026-10-01");
  });

  it("is a dash, never a date, when no finding read repository data", () => {
    expect(dataDay(null)).toBe("—");
  });
});

describe("printSheetIntro", () => {
  it("names the package whose sheet prints and how to print the whole report", () => {
    expect(printSheetIntro("twig/twig")).toBe(
      "Printed from the sheet of twig/twig. Close the sheet to print the whole report.",
    );
  });
});

describe("cssString", () => {
  it("quotes plain text as a CSS string", () => {
    expect(cssString("acme/app")).toBe('"acme/app"');
  });

  it("escapes quotes, backslashes and control characters so the value cannot end the string", () => {
    expect(cssString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\a d"');
  });
});

describe("printSections", () => {
  it("prints the same five sections from every tab but All packages", () => {
    for (const view of ["findings", "advisories", "radius", "run"] as const) {
      expect(printSections(view)).toEqual(["summary", "findings", "advisories", "radius", "run"]);
    }
  });

  it("adds All packages last only when the reader printed from that tab", () => {
    expect(printSections("packages")).toEqual([
      "summary",
      "findings",
      "advisories",
      "radius",
      "run",
      "packages",
    ]);
  });
});
