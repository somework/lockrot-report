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
  const version = page.locator('[role="row"][data-pkg="symfony/yaml"] .fc-ver');
  await expect(version).toHaveText(LONG_VERSION);
  // An inline box has no client width in every engine, so the version is held to its row's box.
  const outside = await version.evaluate((el) => {
    const row = el.closest('[role="row"]')?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return row === undefined ? true : box.left < row.left || box.right > row.right + 1;
  });
  expect(outside).toBe(false);
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

test("the printed All packages table fits A4's printable width with a long version", async ({ page }) => {
  // A4's printable width, as print.spec.ts sets it.
  await page.setViewportSize({ width: 696, height: 1000 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=packages`);
  await page.emulateMedia({ media: "print" });
  const wrap = page.locator('.pd [data-surface="packages"] .tablewrap');
  await expect(wrap.getByRole("row", { name: "symfony/yaml", exact: true })).toContainText(LONG_VERSION);

  const sizes = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});

test("a package name wider than its Findings cell is cut there with an ellipsis", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=findings&pkg=symfony%2Fyaml`);
  const cell = page.locator('[role="row"][data-pkg="symfony/yaml"] .fc-pkg');
  await expect(cell).toBeVisible();
  // The page holds no name this long, so the test writes one into the rendered row.
  await cell.locator(".fc-name").evaluate((el) => {
    el.textContent = "package-versions-deprecated-and-longer-still";
  });

  const word = await cell.locator(".pkg-word").evaluate((el) => ({
    clips: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
  }));
  const sizes = await cell.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));

  expect(word).toEqual({ clips: true, ellipsis: true });
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});

test("a requirement name wider than its Reach cell is cut there with an ellipsis", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${pageUrl(FIXTURES.longVersionReport2)}#view=findings`);
  const cell = page.locator('[role="row"] .f2-reach:has(.pkg-word)').first();
  await expect(cell).toBeVisible();
  // The page holds no name this long, so the test writes one into the rendered row.
  await cell
    .locator(".pkg-word .f2-unit")
    .last()
    .evaluate((el) => {
      el.textContent = "package-versions-deprecated-and-longer-still-than-any-reach-cell";
    });

  const word = await cell.locator(".pkg-word").evaluate((el) => ({
    clips: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
  }));
  const sizes = await cell.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));

  expect(word).toEqual({ clips: true, ellipsis: true });
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});
