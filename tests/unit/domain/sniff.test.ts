import { describe, expect, it } from "vitest";
import { noteDocLink } from "../../../src/domain/sniff";

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
