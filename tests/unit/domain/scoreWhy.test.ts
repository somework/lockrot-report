import { describe, expect, it } from "vitest";
import { whyLines } from "../../../src/domain/scoreWhy";
import type { Finding, Report2 } from "../../../src/model/report";
import { recordedCases } from "../words/recorded";

function recorded(id: string): { finding: Finding; report: Report2 } {
  const found = recordedCases().find((c) => c.name === id);
  if (!found) throw new Error(`no recorded case ${id}`);
  return { finding: structuredClone(found.finding), report: found.report };
}

describe("whyLines", () => {
  it("reads a decided_by it does not know as the combination line", () => {
    // Arrange: tie‡ is critical at 36; maintenance (left-behind with old-promise) and the advisory each grade it high.
    const { finding, report } = recorded("tie-dagger");
    if (!("decided_by" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.decided_by = "a-later-rule";

    // Act
    const lines = whyLines(finding, report);

    // Assert
    expect(lines).toContain(
      "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it high: together critical",
    );
  });

  it("says a part with no grade of its own counts below the lowest grade", () => {
    const { finding, report } = recorded("tie-dagger");
    if (!("decided_by" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.decided_by = "a-later-rule";
    finding.score.parts.security.alone.verdict = null;

    expect(whyLines(finding, report)).toContain(
      "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it below low: together critical",
    );
  });

  it("names a total halving whose reason it does not know by its id", () => {
    const { finding, report } = recorded("tie-dagger");
    if (!("modifiers" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.modifiers = [
      { reason: "vendored", applies_to: "total", divide_by: 2, before: 36, after: 18 },
    ];

    expect(whyLines(finding, report)).toContain("vendored: total 36 ÷ 2 = 18");
  });

  it("prints no counterfactual line when no row is published", () => {
    const { finding, report } = recorded("tie-dagger");
    if (!("without" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.without = [];

    expect(whyLines(finding, report).filter((line) => line.startsWith("without "))).toEqual([]);
  });

  it("names a total halving whose reason is named like an Object member by its id", () => {
    const { finding, report } = recorded("tie-dagger");
    if (!("modifiers" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.modifiers = [
      { reason: "toString", applies_to: "total", divide_by: 2, before: 36, after: 18 },
    ];

    expect(whyLines(finding, report)).toContain("toString: total 36 ÷ 2 = 18");
  });

  it("counts as corroborating only the terms whose role says so", () => {
    // tie‡'s maintenance part is left-behind (lead) and old-promise (corroborating).
    const { finding, report } = recorded("tie-dagger");
    if (!("terms" in finding.score)) throw new Error("tie‡ is graded");
    const [, second] = finding.score.terms;
    if (!second) throw new Error("tie‡ has a second term");
    second.role = "a-later-role";

    expect(whyLines(finding, report)).toContain(
      "maintenance (left-behind) alone grades it high, the advisory alone grades it high: together critical",
    );
  });
});
