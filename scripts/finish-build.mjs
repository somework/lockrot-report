// The second half of `npm run build` (DESIGN.md §1, §1.3): `vite build` has already produced
// `dist/lockrot-report.js` and `dist/lockrot-report.css`. This script inlines both into
// `src/template.html`, computes the CSP `sha256-…` sources over the exact inline text it just
// wrote (not the file on disk, not the tag around it — CSP hashes the element's text content), and
// writes `dist/report.html` plus `dist/manifest.json`. It must be deterministic: the same built
// `dist/*.js`/`*.css` bytes must always produce the same `report.html`/`manifest.json` bytes, since
// CI checks that building twice gives identical output (DESIGN.md §6).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, "dist");

function readText(path) {
  return readFileSync(path, "utf8");
}

/**
 * Vite only emits `lockrot-report.css` when the module graph it built actually imports some CSS.
 * Until the styles/ module is wired into `src/main.ts`'s import graph (a later wave), that file is
 * legitimately absent rather than broken — treating it as empty CSS is what lets this script, and
 * the build as a whole, run end to end against today's placeholder `App` instead of failing before
 * that wave lands.
 */
function readTextOrEmpty(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function sha256Base64(text) {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Fills exactly one occurrence of `token` with `text`, verbatim. A plain string second argument to
 * `String.prototype.replace` treats sequences like `$&`/`$$` in the replacement specially; a
 * function replacement does not, which matters here because `text` is a whole built JS/CSS bundle
 * that could legitimately contain a `$` followed by anything.
 */
function fillOnce(html, token, text) {
  const occurrences = html.split(token).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one ${token} in template.html, found ${occurrences}`);
  }
  return html.replace(token, () => text);
}

function buildReportHtml(template, jsText, cssText) {
  const withCss = fillOnce(template, "{{CSS}}", cssText);
  const withJs = fillOnce(withCss, "{{JS}}", jsText);

  const scriptHash = sha256Base64(jsText);
  const styleHash = sha256Base64(cssText);
  const csp =
    `default-src 'none'; script-src 'sha256-${scriptHash}'; ` +
    `style-src 'sha256-${styleHash}'; img-src data:; base-uri 'none'; form-action 'none'`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  // DESIGN.md §1.3: the CSP meta must be the first element of <head>, right after charset — before
  // it, a hostile document could in principle inject markup the policy would otherwise catch.
  const charsetTag = '<meta charset="utf-8">';
  const html = fillOnce(withJs, charsetTag, `${charsetTag}\n${cspMeta}`);

  return { html, scriptHash, styleHash };
}

function buildManifest(packageJson, html, jsText, cssText, scriptHash, styleHash) {
  return {
    name: packageJson.name.split("/").pop(),
    version: packageJson.version,
    // Major report-schema versions this renderer reads (DESIGN.md §2). A future schema 2 renderer
    // would list `[1, 2]` here; a vendoring consumer reads this instead of guessing from a version
    // number.
    schema: { report: [1] },
    files: {
      "report.html": sha256Hex(html),
      "lockrot-report.js": sha256Hex(jsText),
      "lockrot-report.css": sha256Hex(cssText),
    },
    csp: {
      script: `sha256-${scriptHash}`,
      style: `sha256-${styleHash}`,
    },
  };
}

function main() {
  const packageJson = JSON.parse(readText(join(ROOT, "package.json")));
  const template = readText(join(ROOT, "src/template.html"));
  const jsText = readText(join(DIST, "lockrot-report.js"));
  const cssText = readTextOrEmpty(join(DIST, "lockrot-report.css"));

  const { html, scriptHash, styleHash } = buildReportHtml(template, jsText, cssText);
  const manifest = buildManifest(packageJson, html, jsText, cssText, scriptHash, styleHash);

  writeFileSync(join(DIST, "report.html"), html);
  writeFileSync(join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  // DESIGN.md §1 ships `lockrot-report.css` as one of four files whether or not the module graph
  // that produced it happened to import any CSS; write it back out (even empty) so a vendoring
  // consumer, `manifest.json`'s own file list, and the sandboxed frame (consumers.md §8.6) all see
  // the same four files after every build, not three-then-later-four once styles/ lands.
  writeFileSync(join(DIST, "lockrot-report.css"), cssText);

  console.log(`wrote ${join(DIST, "report.html")} and ${join(DIST, "manifest.json")}`);
}

main();
