/** Page-quality checks (DESIGN.md §6) on every fixture page: axe in both colour schemes with a
 *  detail open, no CSP violation, no console error, no page overflow at 320px. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReportPage } from "./support/report";
import { pageUrl, REPO_ROOT, type FixtureName } from "./support/pages";

/** Every page `scripts/pages.mjs` built, one per fixture bundle. */
function builtFixtures(): FixtureName[] {
  return readdirSync(join(REPO_ROOT, "build/pages"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.replace(/\.html$/, "") as FixtureName);
}

const AXE_FIXTURES: readonly FixtureName[] = [
  "mini",
  "koel_koel",
  "wallabag_wallabag",
  "wallabag_baseline",
  // Every real 0.13 bundle and both hand-built edge bundles.
  "wallabag_wallabag-0.13",
  "koel_koel-0.13",
  "koel_koel-all-0.13",
  "mautic_mautic-0.13",
  "gh_akaunting_akaunting-0.13",
  "mini-0.13-edges",
  "mini-0.13-edges-lock-only",
];
const SCHEMES = ["light", "dark"] as const;
const VIEWS = ["findings", "advisories", "packages", "radius", "run"] as const;

async function load(page: Page, fixture: FixtureName, hash = ""): Promise<void> {
  await page.goto("about:blank");
  await page.goto(pageUrl(fixture) + (hash ? "#" + hash : ""));
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
  // An axe pass over a 271-row page takes minutes in Firefox or WebKit with all three browsers
  // running; the budget is for load.
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const fixture of AXE_FIXTURES) {
    for (const colorScheme of SCHEMES) {
      test(`${fixture}, ${colorScheme}, detail open`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await load(page, fixture);
        const report = await createReportPage(page);
        // Nothing opens by itself (PD-ROWS-9): open the first row, or the first package when
        // nothing is flagged.
        let first = (await report.rows())[0];
        if (first === undefined) {
          await report.tab("packages");
          first = (await report.rows())[0];
        }
        if (first !== undefined) await report.openPackage(first);
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

  // PD-BASELINE-1/4: the delta line's toned counts (one of them pressed) and Run data's stat row.
  for (const hash of ["since=new", "view=run"]) {
    test(`wallabag_baseline, ${hash}, both schemes`, async ({ page }) => {
      for (const colorScheme of SCHEMES) {
        await page.emulateMedia({ colorScheme });
        await load(page, "wallabag_baseline", hash);
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

test.describe("no horizontal overflow inside the open detail sheet at 320px (regression review)", () => {
  // `.shell-detail` scrolls on its own and can widen sideways even when the page does not: a
  // repository URL shown as link text must wrap.
  test.use({ viewport: { width: 320, height: 720 } });

  test("wallabag_wallabag: sensio/framework-extra-bundle's repository link wraps instead of widening the sheet", async ({
    page,
  }) => {
    await load(page, "wallabag_wallabag");
    const report = await createReportPage(page);
    await report.openPackage("sensio/framework-extra-bundle");

    const detail = page.getByRole("complementary", { name: "sensio/framework-extra-bundle" });
    for (const title of ["The lock entry", "Provenance"]) {
      await detail.locator("summary", { hasText: title }).click();
    }

    const { scrollWidth, clientWidth } = await page
      .locator(".shell-detail")
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

/** A publisher's provenance line (README): the page's policy refuses style attributes, so the
 *  renderer's `.lockrot-provenance` class styles it. */
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
