// Checks the invariants DESIGN.md §1.1 promises to every consumer of the built `dist/report.html`,
// plus that the CSP hashes finish-build.mjs writes actually match what it inlined. This suite reads
// `dist/`, which only exists after `npm run build` (or `npx vite build && node scripts/finish-build.mjs`)
// has run — vitest does not build anything itself — so every check here is skipped, with a message
// naming that command, when the directory is missing. Whether building the same source twice
// produces byte-identical output is a separate, CI-only check (DESIGN.md §6); this file does not
// re-run the build, so it cannot assert that itself.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `fileURLToPath` takes the raw `import.meta.url` string directly (Node accepts either a URL
// object or a string) rather than going through `new URL(...)`: the happy-dom test environment
// replaces the global `URL` constructor with a browser-shaped one that does not round-trip a
// `file:` URL the way Node's own `URL` does, which makes the two-argument `new URL(rel, base)`
// form throw here even though the same code works outside a happy-dom test file.
const HERE = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(dirname(HERE)));
const DIST = join(ROOT, "dist");
const BUILD_HINT = "run `npm run build` (or `npx vite build && node scripts/finish-build.mjs`) first";

const distFiles = ["report.html", "manifest.json", "lockrot-report.js", "lockrot-report.css"];
const distBuilt = distFiles.every((name) => existsSync(join(DIST, name)));

function sha256Base64(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The exact text of the two inline elements CSP hashes are computed over — not the surrounding
 *  tags, and not the files on disk, since those two can differ from what actually shipped. */
function inlineBlocks(html: string): { styleText: string; scriptText: string } {
  const styleStart = html.indexOf("<style>") + "<style>".length;
  const styleEnd = html.indexOf("</style>", styleStart);
  const styleText = html.slice(styleStart, styleEnd);

  // The bare `<script>` (no attributes): the JS bundle. The other script tag on the page has an
  // `id`/`type` attribute, so it never matches this exact 8-character substring.
  const bareScriptTag = "<script>";
  const scriptStart = html.indexOf(bareScriptTag) + bareScriptTag.length;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  const scriptText = html.slice(scriptStart, scriptEnd);

  return { styleText, scriptText };
}

describe.skipIf(!distBuilt)(
  distBuilt ? "dist/report.html (DESIGN.md §1.1)" : `dist/report.html (DESIGN.md §1.1) — SKIPPED: ${BUILD_HINT}`,
  () => {
    // `describe.skipIf` still calls this factory to discover which `it`s exist, even for a suite
    // it will mark skipped — so this guard, not just `skipIf`, is what keeps a missing `dist/` from
    // throwing during collection rather than being reported as a clean skip.
    if (!distBuilt) return;

    const html = readFileSync(join(DIST, "report.html"), "utf8");
    const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) as {
      name: string;
      version: string;
      schema: { report: readonly number[] };
      files: Record<string, string>;
      csp: { script: string; style: string };
    };
    const jsFile = readFileSync(join(DIST, "lockrot-report.js"), "utf8");
    const cssFile = readFileSync(join(DIST, "lockrot-report.css"), "utf8");

    it("carries exactly one lockrot-data script tag, attributes in order, on one line", () => {
      const exact = '<script id="lockrot-data" type="application/json">{{DATA}}</script>';
      expect(countOccurrences(html, exact)).toBe(1);
    });

    it("carries exactly one <title> and one meta description", () => {
      expect(countOccurrences(html, "<title>")).toBe(1);
      expect(countOccurrences(html, '<meta name="description" content="')).toBe(1);
    });

    it("opens the body with the literal 5-byte <body> tag", () => {
      // report_page.py anchors its provenance-band injection on this exact substring
      // (consumers.md §8.2); a `<body ...>` with any attribute would silently break that.
      expect(countOccurrences(html, "<body>")).toBe(1);
      expect(/<body[^>]/.test(html)).toBe(false);
    });

    it("contains no network reference of any kind", () => {
      for (const forbidden of ["fetch(", "XMLHttpRequest", "@import", "import("]) {
        expect(html).not.toContain(forbidden);
      }
    });

    it("places the CSP meta as the first element of <head>, right after charset", () => {
      const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
      const charsetTag = '<meta charset="utf-8">';
      const afterCharset = head.slice(head.indexOf(charsetTag) + charsetTag.length).trimStart();
      expect(afterCharset.startsWith('<meta http-equiv="Content-Security-Policy" content="')).toBe(true);
    });

    it("CSP script/style hashes match the exact inline text finish-build.mjs wrote", () => {
      const { styleText, scriptText } = inlineBlocks(html);
      const expectedScript = `sha256-${sha256Base64(scriptText)}`;
      const expectedStyle = `sha256-${sha256Base64(styleText)}`;

      expect(manifest.csp.script).toBe(expectedScript);
      expect(manifest.csp.style).toBe(expectedStyle);
      expect(html).toContain(`script-src '${expectedScript}'`);
      expect(html).toContain(`style-src '${expectedStyle}'`);
    });

    it("manifest.files hashes match the shipped files' actual bytes", () => {
      expect(manifest.files["report.html"]).toBe(sha256Hex(html));
      expect(manifest.files["lockrot-report.js"]).toBe(sha256Hex(jsFile));
      expect(manifest.files["lockrot-report.css"]).toBe(sha256Hex(cssFile));
    });

    it("manifest names the report-1 schema this renderer reads (DESIGN.md §2)", () => {
      expect(manifest.schema.report).toContain(1);
      expect(manifest.name.length).toBeGreaterThan(0);
      expect(manifest.version.length).toBeGreaterThan(0);
    });

    // Comments are prose for whoever reads the source repository; in the page they are weight, and
    // text a consumer's string matching can trip over. Two did: one spelled out the body tag and
    // put a second <body> in the page, another quoted JSX braces a placeholder check read as {{…}}.
    it("ships no comments: the stylesheet and the bundle carry code only", () => {
      expect(cssFile).not.toContain("/*");
      expect(inlineBlocks(html).styleText).not.toContain("/*");
      // The one kind of line comment kept: rolldown's //#region src/… markers, which say which
      // source file each stretch of the bundle came from — a map for a reviewer, not prose.
      const REGION = /^\s*\/\/#(region |endregion$)/;
      const comments = jsFile.split("\n").filter((line) => /^\s*\/\//.test(line) && !REGION.test(line));
      expect(comments).toEqual([]);
      expect(jsFile).not.toContain("/**");
    });

    it("carries no {{…}} beyond its three placeholders", () => {
      const braces = html.match(/\{\{[^}]*\}\}/g) ?? [];
      expect([...new Set(braces)].sort()).toEqual(["{{DATA}}", "{{DESCRIPTION}}", "{{TITLE}}"]);
      expect(html.split("{{").length - 1).toBe(braces.length);
    });

    it("the shipped bundle and stylesheet contain no network reference either", () => {
      for (const forbidden of ["fetch(", "XMLHttpRequest", "@import", "import("]) {
        expect(jsFile).not.toContain(forbidden);
        expect(cssFile).not.toContain(forbidden);
      }
    });
  },
);

if (!distBuilt) {
  // Vitest still needs at least one assertion to report a pass rather than an empty file; this is
  // that assertion, and it doubles as the clear "why nothing ran" message asked for.
  describe(`dist/report.html (DESIGN.md §1.1) — SKIPPED: ${BUILD_HINT}`, () => {
    it("is skipped: dist/ has not been built yet", () => {
      expect(distBuilt).toBe(false);
    });
  });
}
