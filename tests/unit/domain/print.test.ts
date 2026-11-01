import { describe, expect, it } from "vitest";
import { printHasBody2, printLede2 } from "../../../src/domain/print";
import type { Report2 } from "../../../src/model/report";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const nothing: Report2 = { ...composite, packages_flagged: 0, findings: [] };
const empty: Report2 = { ...nothing, packages_checked: 0 };

describe("printLede2", () => {
  it("counts the graded findings, never the report-1 verdicts", () => {
    expect(printLede2("findings", composite)).toBe(
      "9 flagged packages, by grade, each with every flag that fired.",
    );
    expect(printHasBody2("findings", composite)).toBe(true);
  });

  it("says nothing is flagged, or that the lock is empty", () => {
    expect(printLede2("findings", nothing)).toBe("Nothing flagged in 9 packages.");
    expect(printLede2("findings", empty)).toBe("No packages in this lock.");
    expect(printLede2("summary", empty)).toBe("No packages in this lock.");
    expect(printHasBody2("summary", empty)).toBe(false);
  });

  it("leaves the advisories lede to the tab's answer when it has rows", () => {
    expect(printLede2("advisories", composite)).toBeNull();
    expect(printLede2("advisories", nothing)).toBe("No advisory affects this lock.");
    expect(printHasBody2("advisories", nothing)).toBe(false);
  });

  it("describes the radius rows as print shows them, every row open (PD-PRINT-5)", () => {
    expect(printLede2("radius", composite)).toBe(
      "Each direct requirement that pulls in a flagged package, in lockrot's order, with every flagged package listed under it.",
    );
    expect(printHasBody2("radius", composite)).toBe(true);
  });

  it.each([
    ["A", true],
    ["many-dependents", true],
    ["unreached", false],
  ])("says that no row prints when %s grades a finding but exposure lists none", (name, body) => {
    const report = readContractJson("report-2", `${name}.json`) as Report2;

    expect(printLede2("radius", report)).toBe("No direct requirement lists a flagged package.");
    expect(printHasBody2("radius", report)).toBe(body);
  });

  it("says in one line that the radius has no row when nothing is graded", () => {
    const clean = readContractJson("report-2", "ok-unchecked.json") as Report2;

    expect(printLede2("radius", clean)).toBe(
      "Nothing flagged, so no direct requirement pulls in a flagged package.",
    );
    expect(printHasBody2("radius", clean)).toBe(false);
    expect(printLede2("radius", { ...clean, packages_checked: 0, findings: [] })).toBe(
      "No packages in this lock.",
    );
  });
});
