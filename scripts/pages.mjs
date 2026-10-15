// Fills the built `dist/report.html` (produced by `npm run build`) with every bundle under
// `fixtures/bundles`, using the same title/description approximation and the same payload
// escaping as `HtmlFormatter::payload()` (`</` -> `<\/`, `<!--` -> `<!--`) that lockrot's own
// formatter uses. Also writes one page per report-2 embed of lockrot's fetched bundle
// (`scripts/report2-embed.ts`; needs `npm run contract:fetch`), and one planted malformed report-2
// page under `planted/`. Writes `build/pages/`, which is what the e2e suite runs against.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { assembleEmbed, METACHAR_NAME, report2Pages } from "./report2-embed.ts";

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

const REPORT2_TITLE = "lockrot report";

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
  const report2 = report2Pages();
  for (const { name, embed } of report2) {
    const page = template
      .replaceAll("{{TITLE}}", () => text(REPORT2_TITLE))
      .replaceAll("{{DESCRIPTION}}", () => text(REPORT2_TITLE))
      .replaceAll("{{DATA}}", () => payload(embed));
    writeFileSync(join(OUT, name + ".html"), page);
  }
  // Planted under its own folder, which the page sweeps do not list: a report-2 document without
  // a root key, for the error screen.
  const { rot_depth: _dropped, ...malformed } = assembleEmbed("composite").report;
  const planted = template
    .replaceAll("{{TITLE}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DESCRIPTION}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DATA}}", () => payload({ report: malformed, details: {} }));
  mkdirSync(join(OUT, "planted"), { recursive: true });
  writeFileSync(join(OUT, "planted", "report2-malformed.html"), planted);
  // The composite with one package renamed to CSS-selector metacharacters: names are document data.
  const hostile = JSON.parse(
    JSON.stringify(assembleEmbed("composite")).replaceAll('"symfony/yaml"', JSON.stringify(METACHAR_NAME)),
  );
  const metachar = template
    .replaceAll("{{TITLE}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DESCRIPTION}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DATA}}", () => payload(hostile));
  writeFileSync(join(OUT, "planted", "report2-metachar.html"), metachar);
  console.log(`${fixtureFiles.length + report2.length + 2} page(s) written to ${OUT}`);
}

main();
