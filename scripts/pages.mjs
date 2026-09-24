// Fills the built `dist/report.html` (produced by `npm run build`) with every bundle under
// `fixtures/bundles`, using the same title/description approximation and the same payload
// escaping as `HtmlFormatter::payload()` (`</` -> `<\/`, `<!--` -> `<!--`) that lockrot's own
// formatter uses. Writes `build/pages/`, which is what the e2e suite runs against.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const BUNDLES = join(ROOT, "fixtures/bundles");
const OUT = join(ROOT, "build/pages");

const read = (path) => readFileSync(path, "utf8");
const text = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
// HtmlFormatter::payload(): JSON with unescaped slashes and unicode, then `</` and `<!--` escaped.
const payload = (bundle) => JSON.stringify(bundle).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--");

function flaggedOf(report) {
  const verdicts = report.run?.flagged_verdicts ?? [
    "abandoned",
    "silent",
    "pinned",
    "left-behind",
    "old-promise",
    "stale",
  ];
  return report.findings.filter((f) => verdicts.includes(f.verdict));
}

function title(report) {
  const flagged = flaggedOf(report).length;
  return flagged === 0
    ? `lockrot: nothing flagged in ${report.packages_checked} packages`
    : `lockrot: ${flagged} of ${report.packages_checked} packages flagged`;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const template = read(join(DIST, "report.html"));
  const fixtureFiles = readdirSync(BUNDLES).filter((name) => name.endsWith(".json"));
  for (const file of fixtureFiles) {
    const bundle = JSON.parse(read(join(BUNDLES, file)));
    const page = template
      .replaceAll("{{TITLE}}", () => text(title(bundle.report)))
      .replaceAll("{{DESCRIPTION}}", () => text(title(bundle.report)))
      .replaceAll("{{DATA}}", () => payload(bundle));
    writeFileSync(join(OUT, basename(file, ".json") + ".html"), page);
  }
  console.log(`${fixtureFiles.length} page(s) written to ${OUT}`);
}

main();
