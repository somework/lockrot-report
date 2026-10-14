import { describe, expect, it } from "vitest";
import { answerText } from "../../../src/domain/findingAnswer";
import type { Finding, Report2 } from "../../../src/model/report2";
import { recordedCases } from "../goldens/cases";

/** A recorded case's finding, copied so a test can set the open-set value it is about. */
function recorded(id: string): { finding: Finding; report: Report2 } {
  const found = recordedCases().find((c) => c.id === id);
  if (!found) throw new Error(`no recorded case ${id}`);
  return { finding: structuredClone(found.finding), report: found.report };
}

describe("answerText", () => {
  it("words a decided_by it does not know from each part's own grade", () => {
    // Arrange: stale-only grades medium at 8 by maintenance alone; its advisory part counts nothing.
    const { finding, report } = recorded("stale-only");
    if (!("decided_by" in finding.score)) throw new Error("stale-only is graded");
    finding.score.decided_by = "a-later-rule";

    // Act
    const answer = answerText(finding, report.run);

    // Assert
    expect(answer).toBe(
      "Medium at 8: maintenance alone grades it medium, the advisory part alone counts below low. " +
        "Nothing has been released for 3.3 years. It has no recent release to move to.",
    );
  });

  it.each([
    ["no_higher_release", "No higher branch has released recently enough to move to."],
    ["higher_undated", "lockrot could not date the releases of the higher branches, so it names no move."],
  ])("closes a no-move answer with the words of reason %s", (reason, closing) => {
    const { finding, report } = recorded("stale-only");
    if (!finding.next_step) throw new Error("stale-only has a move");
    finding.next_step.reason = reason;

    expect(answerText(finding, report.run)).toBe(
      `Medium: nothing has been released for 3.3 years. ${closing}`,
    );
  });

  it("prints lockrot's own move text for a no-move reason it does not know", () => {
    const { finding, report } = recorded("stale-only");
    if (!finding.next_step) throw new Error("stale-only has a move");
    finding.next_step.reason = "a_later_reason";
    finding.next_step.text = "no move: a later reason.";

    expect(answerText(finding, report.run)).toBe(
      "Medium: nothing has been released for 3.3 years. Next step: no move: a later reason.",
    );
  });

  it("prints lockrot's own move text for a move kind it does not know", () => {
    const { finding, report } = recorded("stale-only");
    if (!finding.next_step) throw new Error("stale-only has a move");
    finding.next_step.kind = "a-later-kind";
    finding.next_step.text = "fork it";

    expect(answerText(finding, report.run)).toBe(
      "Medium: nothing has been released for 3.3 years. Next step: fork it.",
    );
  });

  it("names a halving whose reason it does not know by its divisor and id", () => {
    // xmlseclibs halves its maintenance 16 → 8 for reach.
    const { finding, report } = recorded("xmlseclibs");
    if (!("modifiers" in finding.score)) throw new Error("xmlseclibs is graded");
    const [modifier] = finding.score.modifiers;
    if (!modifier) throw new Error("xmlseclibs is halved");
    modifier.reason = "vendored";

    const answer = answerText(finding, report.run);

    expect(answer).toContain(" Its maintenance is divided by 2 (vendored). ");
    expect(answer).not.toContain("It is not required directly");
  });

  it("names a holder that carries no flag by its grade alone", () => {
    const { finding, report } = recorded("holder-vuln‡");
    const holder = finding.next_step?.held_by[0]?.holder;
    if (!holder) throw new Error("holder-vuln‡ is held by a package");
    holder.verdict = "unknown";
    holder.lead = null;
    holder.flag_ids = [];

    expect(answerText(finding, report.run)).toContain("It is held by joomla/filter 2.0.5 (itself unknown).");
  });

  it("prints lockrot's own move text for a no-move reason named like an Object member", () => {
    const { finding, report } = recorded("stale-only");
    if (!finding.next_step) throw new Error("stale-only has a move");
    finding.next_step.reason = "toString";
    finding.next_step.text = "no move: a later reason.";

    expect(answerText(finding, report.run)).toBe(
      "Medium: nothing has been released for 3.3 years. Next step: no move: a later reason.",
    );
  });

  it("joins the flags a partial update clears as a list", () => {
    // partial-op‡'s partial update clears old-promise and 1 of its 2 advisories.
    const { finding, report } = recorded("partial-op‡");
    if (finding.security.status !== "vulnerable" || !finding.security.partial)
      throw new Error("partial-op‡ has a partial update");
    finding.security.partial.clears = [
      { kind: "flag", id: "left-behind", basis: "branch_releasing" },
      ...finding.security.partial.clears,
    ];

    expect(answerText(finding, report.run)).toContain(
      "installs v2.13.0, which clears left-behind, old-promise and 1 of its 2 advisories (",
    );
  });
});
