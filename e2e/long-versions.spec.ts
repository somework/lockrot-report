/**
 * A long branch version, as a real lock can hold, wraps in its cell: no view scrolls sideways at
 * 320 px, and All packages keeps every column in its box at 1440 px.
 */
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl } from "./support/pages";
import { LONG_VERSION } from "../scripts/report2-embed.ts";

const pageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const view of ["overview", "findings", "advisories", "packages", "radius", "run"]) {
  test(`${view} does not scroll sideways at 320 px with a long version`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=${view}`);
    await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();
    expect(await pageOverflow(page)).toBe(0);
  });
}

test("Findings at 320 px shows the whole long version", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=findings`);
  const version = page.locator('li[data-pkg="symfony/yaml"] .fc-ver');
  await expect(version).toHaveText(LONG_VERSION);
  const clipped = await version.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("All packages at 1440 px wraps the long version and keeps every column in its box", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=packages`);
  const wrap = page.locator('[data-surface="packages"] .tablewrap');
  await expect(wrap).toBeVisible();
  const sizes = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  await expect(page.locator('tr[data-pkg="symfony/yaml"] .p2-ver')).toHaveText(LONG_VERSION);
});

test("the detail sheet does not scroll sideways at 320 px with a long version", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=findings&pkg=symfony%2Fyaml`);
  await expect(page.locator('[data-surface="detail"]')).toBeVisible();
  expect(await pageOverflow(page)).toBe(0);
});
