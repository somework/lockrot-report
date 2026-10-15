import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl } from "./support/pages";
import { METACHAR_NAME } from "../scripts/report2-embed.ts";

/**
 * history.md item 4: package names are untrusted document data, and `rowFor()` deliberately avoids
 * building a CSS selector out of one (a name containing `[`, `]`, `\` or a quote would otherwise
 * throw out of `querySelector` and "take the keyboard with it").
 *
 * None of `fixtures/bundles/*.json` contains a package name with a CSS-selector metacharacter —
 * checked programmatically (`/[[\]\\'"<>]/`) against every finding's `package` across all eight
 * report-1 fixtures. The task's own instructions are explicit that this case is skipped when no fixture has
 * one, rather than fabricated, so this file records that check and its result instead of silently
 * omitting the scenario.
 */
test.skip("rows for a package name containing CSS-selector metacharacters", () => {
  // Intentionally empty: no fixture exercises this path. If a future fixture adds a package name
  // matching /[[\]\\'"<>]/, un-skip this and assert that opening it, and pressing j/k onto it,
  // does not throw and does not break the page's own selector-building (report.js:83-95).
});

test.describe("report-2: a package name of CSS-selector metacharacters", () => {
  const rows = (page: Page) =>
    page
      .locator('[data-surface="findings"] li[data-pkg]')
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-pkg") ?? ""));

  test("lists, opens and walks by j/k without throwing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(pageUrl(FIXTURES.metacharReport2));
    expect(await rows(page)).toContain(METACHAR_NAME);

    const row = page
      .locator('[data-surface="findings"]')
      .getByRole("listitem", { name: METACHAR_NAME, exact: true });
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
    const current = page.locator('[data-surface="advisories"] li[aria-current="true"]');
    await expect(current.first()).toBeVisible();
    expect(
      await current.evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute("data-pkg")))]),
    ).toEqual([METACHAR_NAME]);
  });
});
