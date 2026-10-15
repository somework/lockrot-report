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
      "7 flagged packages, by grade, each with every flag that fired.",
    );
    expect(printHasBody2("findings", composite)).toBe(true);
  });

  it("says nothing is flagged, or that the lock is empty", () => {
    expect(printLede2("findings", nothing)).toBe("Nothing flagged in 7 packages.");
    expect(printLede2("findings", empty)).toBe("No packages in this lock.");
    expect(printLede2("summary", empty)).toBe("No packages in this lock.");
    expect(printHasBody2("summary", empty)).toBe(false);
  });

  it("leaves the advisories lede to the tab's answer when it has rows", () => {
    expect(printLede2("advisories", composite)).toBeNull();
    expect(printLede2("advisories", nothing)).toBe("No advisory affects this lock.");
    expect(printHasBody2("advisories", nothing)).toBe(false);
  });

  it("describes the radius top only when something is graded", () => {
    expect(printLede2("radius", nothing)).toBeNull();
    expect(printLede2("radius", composite)).toContain("ranked rows");
  });
});
