import { describe, expect, it } from "vitest";
import { whyLines } from "../../../src/domain/scoreWhy";
import type { Finding, Report2 } from "../../../src/model/report2";
import { recordedCases } from "../goldens/cases";

function recorded(id: string): { finding: Finding; report: Report2 } {
  const found = recordedCases().find((c) => c.id === id);
  if (!found) throw new Error(`no recorded case ${id}`);
  return { finding: structuredClone(found.finding), report: found.report };
}

describe("whyLines", () => {
  it("reads a decided_by it does not know as the combination line", () => {
    // Arrange: tie‡ is critical at 36; maintenance (left-behind with old-promise) and the advisory each grade it high.
    const { finding, report } = recorded("tie‡");
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
    const { finding, report } = recorded("tie‡");
    if (!("decided_by" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.decided_by = "a-later-rule";
    finding.score.parts.security.alone.verdict = null;

    expect(whyLines(finding, report)).toContain(
      "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it below low: together critical",
    );
  });

  it("names a total halving whose reason it does not know by its id", () => {
    const { finding, report } = recorded("tie‡");
    if (!("modifiers" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.modifiers = [
      { reason: "vendored", applies_to: "total", divide_by: 2, before: 36, after: 18 },
    ];

    expect(whyLines(finding, report)).toContain("vendored: total 36 ÷ 2 = 18");
  });

  it("prints no counterfactual line when no row is published", () => {
    const { finding, report } = recorded("tie‡");
    if (!("without" in finding.score)) throw new Error("tie‡ is graded");
    finding.score.without = [];

    expect(whyLines(finding, report).filter((line) => line.startsWith("without "))).toEqual([]);
  });
});
