// Screenshots every page in a directory at the breakpoints the suite cares about, in both colour
// schemes: node scripts/shoot.mjs <pages-dir> <out-dir>. A review aid, not a gate — the gate is
// the e2e suite, which asserts behaviour rather than pixels.
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [pagesDir, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!pagesDir || !outDir) throw new Error("usage: shoot.mjs <pages-dir> <out-dir>");
const WIDTHS = [320, 768, 1024, 1440];
const SCHEMES = ["light", "dark"];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith(".html"))) {
  for (const colorScheme of SCHEMES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      await page.goto("file://" + join(pagesDir, file));
      await page.waitForLoadState("load");
      const name = `${file.replace(/\.html$/, "")}-${colorScheme}-${width}.png`;
      await page.screenshot({ path: join(outDir, name), fullPage: false });
      await page.close();
    }
  }
}
await browser.close();
console.log(`screenshots in ${outDir}`);
