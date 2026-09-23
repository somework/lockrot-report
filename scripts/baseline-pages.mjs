// Fills the legacy renderer (legacy/, copied from lockrot's resources/report/) with every bundle
// under fixtures/bundles, exactly the way lockrot's HtmlFormatter does: the same five placeholders,
// the same payload escaping. The pages it writes are the parity reference the e2e suite runs
// against before it runs against the new renderer.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LEGACY = join(ROOT, "legacy");
const BUNDLES = join(ROOT, "fixtures/bundles");
const OUT = join(ROOT, "build/legacy-pages");

const read = (name) => readFileSync(join(LEGACY, name), "utf8");
const text = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
// HtmlFormatter::payload(): JSON with unescaped slashes and unicode, then `</` and `<!--` escaped.
const payload = (bundle) => JSON.stringify(bundle).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\u0021--");

function title(report) {
  const flagged = flaggedOf(report).length;
  return flagged === 0
    ? `lockrot: nothing flagged in ${report.packages_checked} packages`
    : `lockrot: ${flagged} of ${report.packages_checked} packages flagged`;
}
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

mkdirSync(OUT, { recursive: true });
const template = read("report.html");
const css = read("report.css");
const js = [read("lib.js"), read("report.js")].join("\n");
for (const file of readdirSync(BUNDLES).filter((f) => f.endsWith(".json"))) {
  const bundle = JSON.parse(readFileSync(join(BUNDLES, file), "utf8"));
  const page = template
    .replaceAll("{{TITLE}}", () => text(title(bundle.report)))
    .replaceAll("{{DESCRIPTION}}", () => text(title(bundle.report)))
    .replaceAll("{{CSS}}", () => css)
    .replaceAll("{{JS}}", () => js)
    .replaceAll("{{DATA}}", () => payload(bundle));
  writeFileSync(join(OUT, basename(file, ".json") + ".html"), page);
}
console.log(`legacy pages written to ${OUT}`);
