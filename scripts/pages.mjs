// Fills the built `dist/report.html` (produced by `npm run build`) with one page per report-2 embed
// of lockrot's fetched bundle (`scripts/report2-embed.ts`; needs `npm run contract:fetch`), using
// the same payload escaping as `HtmlFormatter::payload()` (`</` -> `<\/`, `<!--` -> `<\u0021--`).
// Also plants pages under `planted/`, which the page sweeps do not list: a malformed report-2, a
// report-1 document and the composite with a hostile package name. Writes `build/pages/`, which is
// what the e2e suite runs against.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assembleEmbed, METACHAR_NAME, report2Pages } from "./report2-embed.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const REPORT1 = join(ROOT, "fixtures/bundles/mini.json");
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

const REPORT2_TITLE = "lockrot report";

function main() {
  mkdirSync(OUT, { recursive: true });
  const template = read(join(DIST, "report.html"));
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
  // The one report-1 bundle the page keeps, for the report-1 screen.
  const report1 = template
    .replaceAll("{{TITLE}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DESCRIPTION}}", () => text(REPORT2_TITLE))
    .replaceAll("{{DATA}}", () => payload(JSON.parse(read(REPORT1))));
  writeFileSync(join(OUT, "planted", "report1.html"), report1);
  console.log(`${report2.length + 3} page(s) written to ${OUT}`);
}

main();
