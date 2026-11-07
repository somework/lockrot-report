// Prints the CHANGELOG.md section for one tag, for the GitHub release body:
// node scripts/release-notes.mjs v1.2.3. Fails when the section is missing, so a release cannot go
// out without saying what changed. A pre-release tag (v1.2.3-rc.1) takes its own section, else the
// section of the version it leads to.
import { readFileSync } from "node:fs";

function sectionOf(changelog, version) {
  const heading = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}(?:\\]|\\s|$).*$`, "m");
  const start = changelog.search(heading);
  if (start === -1) return null;
  const rest = changelog.slice(start).split("\n").slice(1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const section = end === -1 ? rest : rest.slice(0, end);
  const isTail = (line) => line.trim() === "" || /^\[(?:Unreleased|\d+\.\d+\.\d+[^\]]*)\]:/.test(line);
  const kept = section.findLastIndex((line) => !isTail(line));
  const body = section
    .slice(0, kept + 1)
    .join("\n")
    .trim();
  // The tail is the file's footer of version links. Keep only a definition that the body uses.
  const used = section
    .slice(kept + 1)
    .filter((line) => line.trim() !== "" && body.includes(line.slice(0, line.indexOf("]") + 1)));
  return used.length === 0 ? body : `${body}\n\n${used.join("\n")}`;
}

export function releaseNotes(tag, changelog) {
  const version = tag.replace(/^v/, "");
  const notes = sectionOf(changelog, version) ?? sectionOf(changelog, version.replace(/-.+$/, ""));
  if (notes === null) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return notes;
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (!tag) throw new Error("usage: release-notes.mjs vX.Y.Z");
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  console.log(releaseNotes(tag, changelog));
}
