/**
 * The PHP window and the capped flag (SPEC §5.9, §5.10): the Overview's PHP state line (§7.9.4),
 * the Run tab's window rows (§7.9.16) and the move card on a refused baseline (§7.9.8.14), on the
 * page cases of real locks.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { overviewSurface } from "./support/report2/overview";
import { pageGolden } from "./support/report2/page-goldens";
import { runSurface } from "./support/report2/run";

const phpLine = (page: Page) => overviewSurface(page).locator(".ov-state.is-php");
const goldenPhpLine = (golden: string): string => {
  const line = (pageGolden(golden).state_lines as string[]).find((l) => l.startsWith("PHP: "));
  if (line === undefined) throw new Error(`${golden} has no PHP state line`);
  return line;
};

const CASES = [
  { page: "page-run.W74-dagger", golden: "run.W74‡" },
  { page: "baselined-wallabag-2.6", golden: "wallabag-2.6" },
  { page: "page-run.MON-8.5-dagger", golden: "run.MON-8.5‡" },
  { page: "page-run.LAM-dagger", golden: "run.LAM‡" },
  { page: "page-drupal-site", golden: "drupal-site" },
] as const;

for (const { page: name, golden } of CASES) {
  test(`${golden}: the PHP state line reads its golden and opens the Run tab's window rows`, async ({
    page,
  }) => {
    await page.goto(report2Url(name));

    await expect(phpLine(page)).toHaveText(`${goldenPhpLine(golden)} ›`);
    await phpLine(page)
      .getByRole("link", { name: /The PHP window/ })
      .click();

    const rows = runSurface(page)
      .locator(".sect", { has: page.getByRole("heading", { name: "PHP window", exact: true }) })
      .locator(".run2-kv-row");
    await expect(rows.first()).toBeVisible();
    const texts = await rows.evaluateAll((items) =>
      items.map((row) => `${row.querySelector("dt")?.textContent}: ${row.querySelector("dd")?.textContent}`),
    );
    expect(texts).toEqual(pageGolden(golden).php_rows);
  });
}

test("a run whose target is inside the window, with no cap and no override, shows no PHP state line", async ({
  page,
}) => {
  await page.goto(report2Url("composite"));

  await expect(overviewSurface(page)).toBeVisible();
  await expect(phpLine(page)).toHaveCount(0);
});

test("a move on a refused baseline points to the PHP line in the Overview", async ({ page }) => {
  await page.goto(report2Url("baselined-wallabag-2.6") + "#pkg=twig/twig");

  await expect(page.locator('[data-surface="detail"] .d3-after-cond').first()).toHaveText(
    "if Composer resolves it (not checked: Composer's solver refuses the lock itself at the target PHP; see the PHP line in the Overview)",
  );
});

test.describe("at 320 px", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("the longest PHP state line wraps without a sideways scroll", async ({ page }) => {
    await page.goto(report2Url("page-drupal-site"));
    await expect(phpLine(page)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

const SHOT_PAGES = [
  "page-run.W74-dagger",
  "baselined-wallabag-2.6",
  "page-run.MON-dagger",
  "page-run.MAU-dagger",
  "page-run.LAM-dagger",
] as const;

for (const name of SHOT_PAGES) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const view of ["overview", "run"] as const) {
      test(`axe finds no violation on ${name}'s ${view}, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`${report2Url(name)}#view=${view}`);
        await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();
        const results = await new AxeBuilder({ page }).include(`[data-surface="${view}"]`).analyze();
        expect(
          results.violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`)),
        ).toEqual([]);
      });
    }
  }
}
