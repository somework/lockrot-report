/**
 * At 1000 px and wider the package opens beside the list and focus stays on the row, so the opening
 * itself must reach a screen reader: a polite live region names the package.
 */
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";

const announcement = (page: import("@playwright/test").Page) =>
  page.locator(".open-note[aria-live='polite']");

for (const width of [1000, 1440]) {
  for (const view of ["findings", "packages", "advisories"]) {
    test(`Enter on a ${view} row at ${width} px opens its package and announces it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${report2Url("composite")}#view=${view}`);
      const row = page.locator(`[data-surface="${view}"] [role="row"][data-pkg="twig/twig"]`).first();
      await row.focus();

      await page.keyboard.press("Enter");

      await expect(page.locator('[data-surface="detail"]')).toBeVisible();
      await expect(row).toBeFocused();
      await expect(announcement(page)).toHaveText("twig/twig opened beside the list");
    });
  }
}

test("Escape empties the announcement, so opening the same package again is announced again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${report2Url("composite")}#view=findings`);
  const row = page.locator('[data-surface="findings"] [role="row"][data-pkg="twig/twig"]');
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(announcement(page)).toHaveText("twig/twig opened beside the list");

  await page.keyboard.press("Escape");

  await expect(announcement(page)).toHaveText("");
});

test("below 1000 px the sheet's heading takes focus and no live region repeats it", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(`${report2Url("composite")}#view=findings`);
  await page.locator('[data-surface="findings"] [role="row"][data-pkg="twig/twig"]').focus();

  await page.keyboard.press("Enter");

  await expect(page.locator("[data-detail-focus]")).toBeFocused();
  await expect(announcement(page)).toHaveText("");
});
