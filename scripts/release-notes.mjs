// Prints the CHANGELOG.md section for one tag, for the GitHub release body:
// node scripts/release-notes.mjs v1.2.3. Fails when the section is missing, so a release cannot go
// out without saying what changed. A pre-release tag (v1.2.3-rc.1) takes its own section, else the
// section of the version it leads to.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function sectionOf(changelog, version) {
  const heading = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}(?:\\]|\\s|$).*$`, "m");
  const start = changelog.search(heading);
  if (start === -1) return null;
  const rest = changelog.slice(start).split("\n").slice(1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

export function releaseNotes(tag, changelog) {
  const version = tag.replace(/^v/, "");
  const notes = sectionOf(changelog, version) ?? sectionOf(changelog, version.replace(/-.+$/, ""));
  if (notes === null) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return notes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) throw new Error("usage: release-notes.mjs vX.Y.Z");
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  console.log(releaseNotes(tag, changelog));
}
