/** Page-quality checks (DESIGN.md §6) on report-2 pages: axe in both colour schemes with a detail
 *  open, no CSP violation, no console error, no page overflow at 320px. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReportPage } from "./support/report";
import { isCorpusSlice, REPO_ROOT, report2Cases, report2Url } from "./support/pages";

/** The report-2 pages of the corpus slice: all of the built cases add minutes per browser, and
 *  `report2-pages.spec.ts` opens each of them once. */
const SLICE = report2Cases().filter(isCorpusSlice);

/** A spread of recorded cases for the axe pass: a small lock, a large real one, a baseline, a
 *  lock with nothing flagged, an offline run and a gate that fails. */
const AXE_CASES = [
  "composite",
  "B",
  "B-baselined-dagger",
  "baselined-wallabag-2.6",
  "A",
  "ok-unchecked",
  "B-offline-dagger",
  "unknown",
];
const SCHEMES = ["light", "dark"] as const;
const VIEWS = ["overview", "findings", "advisories", "packages", "radius", "run"] as const;

async function load(page: Page, caseName: string, hash = ""): Promise<void> {
  await page.goto("about:blank");
  await page.goto(report2Url(caseName) + (hash ? "#" + hash : ""));
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

  for (const caseName of AXE_CASES) {
    for (const colorScheme of SCHEMES) {
      test(`${caseName}, ${colorScheme}, detail open`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await load(page, caseName, "view=findings");
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
    test(`baselined-wallabag-2.6, ${view} tab, both schemes`, async ({ page }) => {
      for (const colorScheme of SCHEMES) {
        await page.emulateMedia({ colorScheme });
        await load(page, "baselined-wallabag-2.6", view === "overview" ? "" : `view=${view}`);
        expect(await seriousViolations(page)).toEqual([]);
      }
    });
  }

  // The rail's Since filter pressed, and the Run data tab of a baselined run.
  for (const hash of ["since=new", "view=run"]) {
    test(`baselined-wallabag-2.6, ${hash}, both schemes`, async ({ page }) => {
      for (const colorScheme of SCHEMES) {
        await page.emulateMedia({ colorScheme });
        await load(page, "baselined-wallabag-2.6", hash);
        expect(await seriousViolations(page)).toEqual([]);
      }
    });
  }

  test("composite, glossary open", async ({ page }) => {
    await load(page, "composite");
    await page.getByRole("button", { name: /what these words mean/i }).click();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe("CSP, console and runtime errors on every corpus-slice page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const caseName of SLICE) {
    test(caseName, async ({ page }) => {
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

      await load(page, caseName);
      for (const name of ["Findings", "Advisories", "All packages", "Blast radius", "Run data", "Findings"]) {
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

  for (const caseName of SLICE) {
    test(caseName, async ({ page }) => {
      const overflowing: string[] = [];
      for (const view of VIEWS) {
        await load(page, caseName, view === "overview" ? "" : `view=${view}`);
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

  test("baselined-wallabag-2.6: sensio/framework-extra-bundle's repository link wraps instead of widening the sheet", async ({
    page,
  }) => {
    await load(page, "baselined-wallabag-2.6", "view=findings");
    const report = await createReportPage(page);
    await report.openPackage("sensio/framework-extra-bundle");

    const detail = page.getByRole("dialog", { name: "sensio/framework-extra-bundle" });
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
    const source = readFileSync(join(REPO_ROOT, "build/pages/report2-composite.html"), "utf8");
    const banded = source.replace(
      "<body>",
      '<body>\n<div class="lockrot-provenance">Published by <a href="https://example.test/">a site</a>.</div>',
    );
    const file = join(REPO_ROOT, "build/pages/provenance-banded.tmp.html");
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
