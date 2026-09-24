/**
 * Checks only the new renderer has to pass (DESIGN.md §6 "New-only checks"): the legacy page was
 * never written against them, so they are skipped under RENDERER=legacy rather than marked as
 * known failures.
 *
 * - axe: no serious or critical violation, in both colour schemes, with a package detail open;
 * - CSP: no `securitypolicyviolation` on any fixture page, through boot and the common
 *   interactions (every tab, the theme toggle, the glossary, a detail);
 * - no console error and no uncaught exception on any fixture page;
 * - no horizontal page overflow at 320px on any fixture page and tab.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReportPage } from "./support/report";
import { currentRenderer, pageUrl, REPO_ROOT, type FixtureName } from "./support/pages";

test.skip(currentRenderer() !== "new", "new-renderer-only checks (DESIGN.md §6)");

/** Every page `scripts/pages.mjs` built, one per fixture bundle. Empty under RENDERER=legacy, whose
 *  run skips this file and must not need `build/pages/` to exist. */
function builtFixtures(): FixtureName[] {
  if (currentRenderer() !== "new") return [];

  return readdirSync(join(REPO_ROOT, "build/pages"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.replace(/\.html$/, "") as FixtureName);
}

const AXE_FIXTURES = ["mini", "koel_koel", "wallabag_wallabag"] as FixtureName[];
const SCHEMES = ["light", "dark"] as const;
const VIEWS = ["findings", "advisories", "packages", "radius", "run"] as const;

async function load(page: Page, fixture: FixtureName, hash = ""): Promise<void> {
  await page.goto("about:blank");
  await page.goto(pageUrl("new", fixture) + (hash ? "#" + hash : ""));
  await expect(page.getByRole("tab").first()).toBeVisible();
}

/** Serious and critical violations only, as `id: target` lines, so a failure names what broke. */
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();

  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((node) => `${v.id} (${v.impact ?? "?"}): ${node.target.join(" ")}`));
}

test.describe("axe: no serious or critical violations", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const fixture of AXE_FIXTURES) {
    for (const colorScheme of SCHEMES) {
      test(`${fixture}, ${colorScheme}, detail open`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await load(page, fixture);
        const report = await createReportPage(page);
        if (!(await report.detail()).open) {
          // Nothing flagged to auto-open: open the first package of the full list instead.
          await report.tab("packages");
          const first = (await report.rows())[0];
          if (first !== undefined) await report.openPackage(first);
        }
        expect((await report.detail()).open).toBe(true);
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }

  for (const view of VIEWS) {
    test(`wallabag_wallabag, ${view} tab, both schemes`, async ({ page }) => {
      for (const colorScheme of SCHEMES) {
        await page.emulateMedia({ colorScheme });
        await load(page, "wallabag_wallabag", view === "findings" ? "" : `view=${view}`);
        expect(await seriousViolations(page)).toEqual([]);
      }
    });
  }

  test("mini, glossary open", async ({ page }) => {
    await load(page, "mini");
    await page.getByRole("button", { name: /what these words mean/i }).click();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe("CSP, console and runtime errors on every fixture page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const fixture of builtFixtures()) {
    test(fixture, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      // Installed before any page script runs, so a violation during boot is caught too.
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const store = window as unknown as { __csp?: string[] };
          (store.__csp ??= []).push(`${event.violatedDirective} ${event.blockedURI} ${event.sample}`);
        });
      });

      await load(page, fixture);
      for (const name of ["Advisories", "All packages", "Blast radius", "Run data", "Findings"]) {
        await page.getByRole("tab", { name }).click();
      }
      await page.getByRole("button", { name: /^(dark|light)$/i }).click();
      await page.getByRole("button", { name: /what these words mean/i }).click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("j");

      const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      expect(csp).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
});

test.describe("no horizontal overflow at 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  for (const fixture of builtFixtures()) {
    test(fixture, async ({ page }) => {
      const overflowing: string[] = [];
      for (const view of VIEWS) {
        await load(page, fixture, view === "findings" ? "" : `view=${view}`);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        if (width > 320) overflowing.push(`${view}: ${width}px`);
      }
      expect(overflowing).toEqual([]);
    });
  }
});

/**
 * A publisher's provenance line (README, "Publishing a report"): markup another site puts after
 * <body> in a copy of the page. The page's policy refuses style attributes, so the line is styled
 * by the renderer's `.lockrot-provenance` class — and adding it must not trip the policy.
 */
test.describe("a publisher's provenance line", () => {
  test("is styled by the page and trips no policy", async ({ page }) => {
    const source = readFileSync(join(REPO_ROOT, "build/pages/mini.html"), "utf8");
    const banded = source.replace(
      "<body>",
      '<body>\n<div class="lockrot-provenance">Published by <a href="https://example.test/">a site</a>.</div>',
    );
    const file = join(REPO_ROOT, "build/pages/mini-banded.tmp.html");
    writeFileSync(file, banded);
    const violations: string[] = [];
    await page.exposeFunction("reportViolation", (directive: string) => violations.push(directive));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { reportViolation: (d: string) => void }).reportViolation(
          event.violatedDirective,
        );
      });
    });
    try {
      await page.goto("file://" + file);
      const band = page.locator(".lockrot-provenance");
      await expect(band).toBeVisible();
      expect(await band.evaluate((node) => getComputedStyle(node).paddingTop)).toBe("8px");
      await expect(page.getByRole("tab").first()).toBeVisible();
      expect(violations).toEqual([]);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
