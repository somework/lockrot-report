// The build that ships `lockrot-report.js`/`.css` (DESIGN.md §1): a single IIFE with everything
// Preact needs baked in, so the file works dropped straight into a `<script>` tag with no module
// system, no dynamic imports and no runtime fetch of anything else. `scripts/finish-build.mjs`
// takes these two files and the still-unbuilt `src/template.html` and produces `dist/report.html`
// and `dist/manifest.json`; this config only has to produce the two library files correctly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

/**
 * Drops every comment from the stylesheet as it is bundled, and nothing else: the rules keep their
 * formatting, so what ships reads like the source minus the prose. The prose stays in the
 * repository, which is what a release attests. In the page it was a tenth of the stylesheet, and
 * text a consumer's matching tripped over twice (a second <body>, a {{…}} that was not a
 * placeholder); tests/build/dist.test.ts now fails on any comment that reaches dist/.
 */
const stripCssComments = {
  postcssPlugin: "lockrot-strip-comments",
  Comment(comment: { remove(): void }) {
    comment.remove();
  },
};

/**
 * Vite appends a bookkeeping comment, `$vite$:1`, to a library build's stylesheet. It is the one
 * comment postcss never sees, so it goes here, after bundling and before finish-build.mjs hashes
 * the file.
 */
const dropViteCssMarker = {
  name: "lockrot-drop-vite-css-marker",
  enforce: "post" as const,
  generateBundle(
    _options: unknown,
    bundle: Record<string, { type: string; fileName: string; source?: unknown }>,
  ) {
    for (const file of Object.values(bundle)) {
      if (file.type === "asset" && file.fileName.endsWith(".css") && typeof file.source === "string") {
        file.source = file.source.replace(/\/\*\$vite\$:\d+\*\/\n?/g, "");
      }
    }
  },
};

const packageJsonUrl = new URL("./package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(fileURLToPath(packageJsonUrl), "utf8")) as { version: string };

export default defineConfig({
  plugins: [preact(), dropViteCssMarker],
  css: { postcss: { plugins: [stripCssComments] } },
  define: {
    // Preact reads this to drop its own dev-only warnings; a leftover "development" build would
    // both bloat the file and print console noise into a page that ships inside a signed PHAR.
    "process.env.NODE_ENV": JSON.stringify("production"),
    // main.ts exposes this as `window.LockrotReport.version`; baking it in at build time means the
    // shipped file always names the release it came from, with no separate version file to drift.
    __LOCKROT_REPORT_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // One CSS file, not one per chunk — there is only one entry, but this also stops Vite from
    // ever considering a `<link>`-per-chunk strategy for this bundle.
    cssCodeSplit: false,
    // Nothing here is minified on purpose (DESIGN.md §1): the built page ends up inside a signed
    // PHAR and a reviewer should be able to read it without a source map.
    minify: false,
    // The default modulepreload polyfill contains `fetch(` (critic.md R1), which the PHPUnit
    // suite on the lockrot side forbids appearing anywhere in the page; an IIFE needs no module
    // preloading in the first place, so this is off rather than merely unused.
    modulePreload: false,
    // Readable is the formatting and the names, not the prose: the comments stay in the source
    // repository, which is what a release attests, and would otherwise more than double the page
    // every report carries.
    rolldownOptions: { output: { comments: false } },
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      name: "LockrotReport",
      formats: ["iife"],
      // A function return is used verbatim (no extension appended), which is what lets the js and
      // css outputs land at exactly `lockrot-report.js`/`.css` instead of Vite's own `<name>.<format>.js`.
      fileName: () => "lockrot-report.js",
      cssFileName: "lockrot-report",
    },
  },
});
