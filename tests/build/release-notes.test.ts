import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs script, no type declarations
import { releaseNotes } from "../../scripts/release-notes.mjs";

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.14.0-rc.2]

rc two notes.

## [0.14.0-rc.1]

rc one notes.

## [0.13.0]

plain notes.

### Added

- a thing.

## [0.12.0]

older notes.
`;

const NO_RC_SECTION = `# Changelog

## [0.14.0]

final notes.

## [0.13.0]

plain notes.
`;

const notes = releaseNotes as (tag: string, changelog: string) => string;

describe("scripts/release-notes.mjs", () => {
  it("returns the section of a plain version, subsections included", () => {
    expect(notes("v0.13.0", CHANGELOG)).toBe("plain notes.\n\n### Added\n\n- a thing.");
  });

  it("returns the rc's own section when one names it", () => {
    expect(notes("v0.14.0-rc.1", CHANGELOG)).toBe("rc one notes.");
  });

  it("does not take an rc section for the plain version", () => {
    expect(() => notes("v0.14.0", CHANGELOG)).toThrow("no section for 0.14.0");
  });

  it("falls back to the X.Y.Z section when no section names the rc", () => {
    expect(notes("v0.14.0-rc.3", NO_RC_SECTION)).toBe("final notes.");
  });

  it("fails when neither the rc nor its X.Y.Z section exists", () => {
    expect(() => notes("v0.15.0-rc.1", CHANGELOG)).toThrow("no section for 0.15.0-rc.1");
  });

  it("fails when a plain version has no section", () => {
    expect(() => notes("v9.9.9", CHANGELOG)).toThrow("no section for 9.9.9");
  });
});
