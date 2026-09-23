import { describe, expect, it } from "vitest";
import { hasNoFixExpected, noteDocLink } from "../../../src/domain/sniff";
import { makeFinding, makeSignal } from "./fixtures";

describe("hasNoFixExpected", () => {
  it("is true when the finding's own evidence says no fix is expected", () => {
    // Arrange
    const finding = makeFinding({ evidence: "no fix expected on 2.x" });

    // Act
    const result = hasNoFixExpected(finding);

    // Assert
    expect(result).toBe(true);
  });

  it("is false when evidence says nothing about a fix", () => {
    // Arrange
    const finding = makeFinding({ evidence: "the repository is archived" });

    // Act
    const result = hasNoFixExpected(finding);

    // Assert
    expect(result).toBe(false);
  });

  it("ignores an S7 summary that happens to contain the phrase (critic.md M31)", () => {
    // Arrange: evidence() appends the S7 signal's own summary as a trailing "; "-joined part; that
    // summary is about transitive exposure, not this package's own advisories, so a coincidental
    // match in it must not fire this step.
    const s7 = makeSignal({ id: "S7", summary: "pulls in a package with no fix expected downstream" });
    const finding = makeFinding({
      evidence: "old release; pulls in a package with no fix expected downstream",
      signals: [s7],
    });

    // Act
    const result = hasNoFixExpected(finding);

    // Assert
    expect(result).toBe(false);
  });

  it("still detects the phrase in its own evidence when an unrelated S7 summary is appended", () => {
    // Arrange
    const s7 = makeSignal({ id: "S7", summary: "pulls in 2 flagged packages" });
    const finding = makeFinding({
      evidence: "no fix expected; pulls in 2 flagged packages",
      signals: [s7],
    });

    // Act
    const result = hasNoFixExpected(finding);

    // Assert
    expect(result).toBe(true);
  });

  it("handles evidence that is only the S7 summary, with nothing of the finding's own", () => {
    // Arrange: ownEvidence() falls back to `note ?? ''` when it has no parts, so evidence() may be
    // exactly the S7 summary with no leading "; " to strip.
    const s7 = makeSignal({ id: "S7", summary: "pulls in 1 flagged package" });
    const finding = makeFinding({ evidence: "pulls in 1 flagged package", signals: [s7], note: null });

    // Act
    const result = hasNoFixExpected(finding);

    // Assert
    expect(result).toBe(false);
  });
});

describe("noteDocLink", () => {
  it("links to internals for a note mentioning token", () => {
    // Arrange
    const note = "a GitHub token was not configured";

    // Act
    const link = noteDocLink(note);

    // Assert
    expect(link).toBe("https://lockrot.dev/internals/");
  });

  it("links to internals for a note mentioning activity", () => {
    // Arrange / Act / Assert
    expect(noteDocLink("activity data was stale")).toBe("https://lockrot.dev/internals/");
  });

  it("links to internals for a note mentioning repository", () => {
    // Arrange / Act / Assert
    expect(noteDocLink("could not reach the repository")).toBe("https://lockrot.dev/internals/");
  });

  it("falls back to the configuration doc for any other note", () => {
    // Arrange
    const note = "targeting PHP 8.3";

    // Act
    const link = noteDocLink(note);

    // Assert
    expect(link).toBe("https://lockrot.dev/configuration/");
  });
});
