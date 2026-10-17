/**
 * The page's first Tab stop skips the header and the filter rail to the list, and below the wide
 * layout the sheet that covers the page is a modal dialog to assistive technology.
 */
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";

test("the first Tab reaches the skip link, which moves focus to the list's Tab stop row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(report2Url("composite") + "#view=findings");
  await expect(page.locator('[data-surface="findings"]')).toBeVisible();

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to the list" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.locator('[data-surface="findings"] li[data-pkg][tabindex="0"]')).toBeFocused();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#view=findings");
});

test("on a tab with no list, the skip link moves focus to the tab's content", async ({ page }) => {
  await page.goto(report2Url("composite"));
  await page.keyboard.press("Tab");
  await page.getByRole("link", { name: "Skip to the content" }).press("Enter");
  await expect(page.getByRole("tabpanel")).toBeFocused();
});

for (const width of [1024, 768]) {
  test(`at ${String(width)} px the open sheet is a modal dialog named for its package`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(report2Url("composite") + "#view=findings&pkg=twig%2Ftwig");
    const sheet = page.getByRole("dialog", { name: "twig/twig" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");
  });
}

test("at 1440 px the open sheet is a complementary column beside the list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(report2Url("composite") + "#view=findings&pkg=twig%2Ftwig");
  await expect(page.getByRole("complementary", { name: "twig/twig" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
