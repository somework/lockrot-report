/**
 * The libyears table's newest-release column (SPEC §7.9.4) and the detail header's out-links
 * (SPEC §7.9.8), on lockrot's recorded wallabag 2.6 page.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";
import { overviewSurface } from "./support/report2/overview";

const WALLABAG = "baselined-wallabag-2.6";
const ARCHIVED = "lexik/form-filter-bundle";

test.describe("the libyears table", () => {
  test("shows the most recent release in place of a grade, and a row still opens its package", async ({
    page,
  }) => {
    await page.goto(report2Url(WALLABAG));
    const table = overviewSurface(page).getByRole("table", { name: "Furthest behind, top 8" });

    await expect(table.getByRole("columnheader")).toHaveText(["Package", "Libyears", "Most recent release"]);
    await expect(table.locator("tbody tr").first().locator("td")).toHaveText([
      "willdurand/jsonp-callback-validator v1.1.0",
      "8.0",
      "v2.0.0 (2022-01-30)",
    ]);
    await expect(table.locator(".ov-ly-grade")).toHaveCount(0);

    await table.getByRole("link", { name: "willdurand/jsonp-callback-validator" }).click();
    await expect(page.locator('[data-surface="detail"]')).toHaveAttribute(
      "aria-label",
      "willdurand/jsonp-callback-validator",
    );
  });

  test("nothing scrolls sideways at 320", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(report2Url(WALLABAG));
    await expect(overviewSurface(page).getByRole("table")).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe("the detail header's out-links", () => {
  test("mark an archived repository in words and open in a new tab; the Reach row holds the reach", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, WALLABAG, ARCHIVED);
    const meta = sheet.locator(".d2-meta");

    await expect(meta).toHaveText("github.com ↗ (archived) · packagist.org ↗");
    const repository = meta.getByRole("link", {
      name: "github.com repository (archived), opens in a new tab",
    });
    const registry = meta.getByRole("link", {
      name: "packagist.org page of this package, opens in a new tab",
    });
    await expect(repository).toHaveAttribute("href", "https://github.com/lexik/LexikFormFilterBundle");
    await expect(registry).toHaveAttribute("href", "https://packagist.org/packages/lexik/form-filter-bundle");
    for (const link of [repository, registry]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the header passes axe with WCAG 2.2 AA, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDetail2(page, WALLABAG, ARCHIVED);

      const results = await new AxeBuilder({ page })
        .include('[data-surface="detail"] .detail-head')
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();

      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }

  test("nothing scrolls sideways at 320", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const sheet = await openDetail2(page, WALLABAG, ARCHIVED);
    await expect(sheet.locator(".d2-meta a")).toHaveCount(2);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
