// Prints the CHANGELOG.md section for one tag, for the GitHub release body:
// node scripts/release-notes.mjs v1.2.3. Fails when the section is missing, so a release cannot go
// out without saying what changed.
import { readFileSync } from "node:fs";

const tag = process.argv[2];
if (!tag) throw new Error("usage: release-notes.mjs vX.Y.Z");
const version = tag.replace(/^v/, "");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const heading = new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?.*$`, "m");
const start = changelog.search(heading);
if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}`);
const rest = changelog.slice(start).split("\n").slice(1);
const end = rest.findIndex((line) => line.startsWith("## "));
console.log((end === -1 ? rest : rest.slice(0, end)).join("\n").trim());
