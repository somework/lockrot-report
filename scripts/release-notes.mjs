// Prints the CHANGELOG.md section for one tag, for the GitHub release body:
// node scripts/release-notes.mjs v1.2.3. Fails when the section is missing, so a release cannot go
// out without saying what changed, and when a final tag's heading has no date, as Keep a Changelog
// asks. A pre-release tag (v1.2.3-rc.1) takes its own section, else the section of the version it
// leads to.
import { readFileSync } from "node:fs";

function sectionOf(changelog, version) {
  const heading = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}(?:\\]|\\s|$).*$`, "m");
  const start = changelog.search(heading);
  if (start === -1) return null;
  const [head = "", ...rest] = changelog.slice(start).split("\n");
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
  return { head, notes: used.length === 0 ? body : `${body}\n\n${used.join("\n")}` };
}

const isDay = (text) =>
  text !== undefined && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().startsWith(text);

export function releaseNotes(tag, changelog) {
  const version = tag.replace(/^v/, "");
  const section = sectionOf(changelog, version) ?? sectionOf(changelog, version.replace(/-.+$/, ""));
  if (section === null) throw new Error(`CHANGELOG.md has no section for ${version}`);
  if (!version.includes("-") && !isDay(/ - (\d{4}-\d{2}-\d{2})\s*$/.exec(section.head)?.[1]))
    throw new Error(`CHANGELOG.md heading ${section.head.trim()} has no date: ## [${version}] - YYYY-MM-DD`);
  return section.notes;
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (!tag) throw new Error("usage: release-notes.mjs vX.Y.Z");
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  console.log(releaseNotes(tag, changelog));
}
