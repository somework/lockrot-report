/**
 * PD-DISCLOSURE-1 (DESIGN.md §5): every `<details>`/`<summary>` on the page — the rail's phone
 * fold, the glossary's own sections, the detail panel's reference sections — used to draw its
 * own "▸" text glyph as a disclosure marker, at slightly different sizes, with no hover or focus
 * state. A text glyph's exact shape depends on whatever font a viewer's OS (or a headless browser
 * with no system fonts) substitutes for it; one review environment rendered it as a near-invisible
 * 3-4px dot. `styles/base.css` now draws one CSS-border triangle for every fold instead, which needs
 * no font and renders identically everywhere.
 *
 * These specs read the marker the same way the page itself draws it — `getComputedStyle(el,
 * "::after")` — rather than through the `ReportPage` abstraction: the marker is a CSS implementation
 * detail every surface shares, not a fact any one page-object method already names (the existing
 * precedent for this is `theme-and-glossary.spec.ts`'s own direct locator/evaluate use for the
 * glossary's DOM structure).
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { openDetail2 } from "./support/report2/detail";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

/** The marker's own rendered box, from the border-triangle CSS alone (`content: ""`, `width: 0`,
 *  `height: 0`, a border on one side only) — real pixels a reader would see, not just "some rule
 *  matched". `content` is asserted too, so a summary this rule never reaches at all (`content: none`,
 *  the browser's own default) fails loudly instead of reading as a 0×0 marker. */
async function markerBox(summary: Locator): Promise<{ width: number; height: number; content: string }> {
  return summary.evaluate((el) => {
    const style = getComputedStyle(el, "::after");
    const width = parseFloat(style.borderLeftWidth) || 0;
    const height = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    return { width, height, content: style.content };
  });
}

async function markerRotation(summary: Locator): Promise<string> {
  return summary.evaluate((el) => getComputedStyle(el, "::after").transform);
}

test.describe("report-2: the glossary and the phone folds draw the one marker", () => {
  const glossary = (page: Page) => page.getByRole("dialog", { name: /what these words mean/i });

  test("the glossary's collapsed sections each draw a visible, sized marker", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();

    for (const title of ["The signals", "Keys and search", "One number for the lock: libyears"]) {
      const box = await markerBox(glossary(page).locator("summary", { hasText: title }));
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("rotates 90 degrees once its own <details> opens, and back once it closes", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const summary = glossary(page).locator("summary", { hasText: "The signals" });

    // Read once the rotate transition has settled: the end state is the point, not a frame mid-flight.
    await page.waitForTimeout(250);
    const closed = await markerRotation(summary);
    await summary.click();
    await expect.poll(() => markerRotation(summary)).not.toBe(closed);

    await summary.click();
    await expect.poll(() => markerRotation(summary)).toBe(closed);
  });

  test("the phone's rail fold draws the same marker shape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await report.gotoReport2WithHash("composite", "view=findings");

    const railSummary = page.getByText("Filters").locator("xpath=ancestor-or-self::summary[1]");
    for (const summary of [railSummary]) {
      const box = await markerBox(summary);
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("darkens on hover, a visible affordance and not only a cursor change", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const summary = glossary(page).locator("summary", { hasText: "The signals" });

    const before = await summary.evaluate((el) => getComputedStyle(el, "::after").borderLeftColor);
    await summary.hover();
    const hovered = await summary.evaluate((el) => getComputedStyle(el, "::after").borderLeftColor);
    expect(hovered).not.toBe(before);
  });
});

test.describe("report-2: the detail sheet's folds draw the one marker", () => {
  test("the two reference sections each draw a visible, sized marker", async ({ page }) => {
    const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");

    for (const title of ["The lock entry", "Provenance"]) {
      const box = await markerBox(sheet.locator("summary", { hasText: title }));
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("the Why and Security level-1 buttons draw the shared l1 marker", async ({ page }) => {
    const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");

    for (const name of ["Show the arithmetic", /^3 more ways out/]) {
      const mark = sheet.getByRole("button", { name }).locator(".l1-mark");
      await expect(mark).toBeAttached();
      expect(await mark.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(0);
    }
  });
});
