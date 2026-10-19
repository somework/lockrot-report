import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl } from "./support/pages";
import { findingsRows } from "./support/report2/findings";
import { METACHAR_NAME } from "../scripts/report2-embed.ts";

test.describe("report-2: a package name of CSS-selector metacharacters", () => {
  const rows = (page: Page) =>
    findingsRows(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-pkg") ?? ""));

  test("lists, opens and walks by j/k without throwing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(pageUrl(FIXTURES.metacharReport2) + "#view=findings");
    expect(await rows(page)).toContain(METACHAR_NAME);

    const row = page
      .locator('[data-surface="findings"]')
      .getByRole("row", { name: METACHAR_NAME, exact: true });
    await row.click();
    await expect(page.locator('[data-surface="detail"]')).toContainText(METACHAR_NAME);
    await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toContain(METACHAR_NAME);

    await row.focus();
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await expect(row).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("a #pkg= link to it opens its detail and its Advisories rows", async ({ page }) => {
    await page.goto(
      `${pageUrl(FIXTURES.metacharReport2)}#view=advisories&pkg=${encodeURIComponent(METACHAR_NAME)}`,
    );
    const current = page.locator('[data-surface="advisories"] [role="row"][aria-current="true"]');
    await expect(current.first()).toBeVisible();
    expect(
      await current.evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute("data-pkg")))]),
    ).toEqual([METACHAR_NAME]);
  });
});
