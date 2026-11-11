/**
 * A lock version with a right-to-left override must not read as another version: the page shows
 * each control as a visible escape, and the version is its own bidi run.
 */
import { expect, test } from "@playwright/test";
import { FIXTURES, pageUrl } from "./support/pages";

test("a version with bidi controls shows them as escapes in an isolated run", async ({ page }) => {
  await page.goto(`${pageUrl(FIXTURES.bidiReport2)}#view=findings`);
  const version = page.locator('[role="row"][data-pkg="symfony/yaml"] .fc-ver');

  await expect(version).toHaveText("dev-main\\u{202E}0.0.1 \\u{202C}");
  expect(await page.locator("main").evaluate((el) => /[‪-‮⁦-⁩]/.test(el.textContent))).toBe(false);
  expect(await version.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe("isolate");
});
