/**
 * WCAG 1.4.12: a reader's text-spacing style loses no content and scrolls no page sideways.
 */
import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";

// The reader's own style sheet, which the page's CSP would refuse.
test.use({ bypassCSP: true });

const TEXT_SPACING =
  "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }" +
  " p { margin-bottom: 2em !important; }";

for (const caseName of ["composite", "baselined-wallabag-2.6"]) {
  test(`${caseName}: Overview at 320 px with text spacing scrolls no page sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${report2Url(caseName)}#view=overview`);
    await expect(page.locator('[data-surface="overview"]')).toBeVisible();
    await page.addStyleTag({ content: TEXT_SPACING });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
}
