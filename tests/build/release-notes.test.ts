import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

  it("does not take a longer version for the plain one", () => {
    expect(() => notes("v0.14.0", "## [0.14.01]\n\nlonger.\n")).toThrow("no section for 0.14.0");
  });

  it("falls back to the X.Y.Z section when no section names the rc", () => {
    expect(notes("v0.14.0-rc.3", NO_RC_SECTION)).toBe("final notes.");
  });

  it("ends the last section before the link references of the headings", () => {
    const linked = `${NO_RC_SECTION}\n[0.14.0]: https://example.test/0.14.0\n[0.13.0]: https://example.test/0.13.0\n`;

    expect(notes("v0.13.0", linked)).toBe("plain notes.");
  });

  it("ends the last section before a version link reference with no space after the colon", () => {
    const linked = `${NO_RC_SECTION}\n[0.13.0]:https://example.test/0.13.0\n`;

    expect(notes("v0.13.0", linked)).toBe("plain notes.");
  });

  it("keeps a version link reference inside a section and the bullets after it", () => {
    const linked = `## [0.13.0]\n\n- see [0.12.0].\n\n[0.12.0]: https://example.test/0.12.0\n\n- later.\n\n## [0.12.0]\n\nolder.\n`;

    expect(notes("v0.13.0", linked)).toBe(
      "- see [0.12.0].\n\n[0.12.0]: https://example.test/0.12.0\n\n- later.",
    );
  });

  it("keeps a link reference inside a section that names no version", () => {
    const linked = `## [0.13.0]\n\nsee [SPEC].\n\n[SPEC]: https://example.test/spec\n\n## [0.12.0]\n\nolder.\n`;

    expect(notes("v0.13.0", linked)).toBe("see [SPEC].\n\n[SPEC]: https://example.test/spec");
  });

  it("fails when neither the rc nor its X.Y.Z section exists", () => {
    expect(() => notes("v0.15.0-rc.1", CHANGELOG)).toThrow("no section for 0.15.0-rc.1");
  });

  it("fails when a plain version has no section", () => {
    expect(() => notes("v9.9.9", CHANGELOG)).toThrow("no section for 9.9.9");
  });

  it("prints the notes when run through a symlink", () => {
    const script = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "scripts/release-notes.mjs");
    const link = join(mkdtempSync(join(tmpdir(), "release-notes-")), "link.mjs");
    symlinkSync(script, link);
    expect(execFileSync(process.execPath, [link, "v0.13.0"], { encoding: "utf8" })).toContain("lockrot 0.13.0");
  });
});
