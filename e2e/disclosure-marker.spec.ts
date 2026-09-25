/**
 * PD-DISCLOSURE-1 (DESIGN.md §5): every `<details>`/`<summary>` on the page — the ledger and rail
 * phone folds, the glossary's own sections, the detail panel's reference sections — used to draw its
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
import { expect, type Locator, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

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

test.describe("PD-DISCLOSURE-1: one marker, every fold", () => {
  test("the glossary's own collapsed sections each draw a visible, sized marker", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });

    for (const title of ["The signals", "How a priority is reached", "Keys and search"]) {
      const summary = dialog.locator("summary", { hasText: title });
      const box = await markerBox(summary);
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("the detail panel's three reference sections each draw the same marker", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    const detail = page.getByRole("complementary", { name: "vendor/transitive" });

    for (const title of ["How it is reached", "The lock entry", "Provenance"]) {
      const summary = detail.locator("summary", { hasText: title });
      const box = await markerBox(summary);
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("rotates 90 degrees once its own <details> opens, and back once it closes", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });
    const summary = dialog.locator("summary", { hasText: "The signals" });

    // Reads the CSS `transform` once the 0.15s rotate transition has settled, not mid-flight — the
    // marker's whole point is the *end* state, and a snapshot taken during the animation would read
    // as neither "closed" nor "open".
    async function settledRotation(): Promise<string> {
      await page.waitForTimeout(250);
      return markerRotation(summary);
    }

    const closed = await settledRotation();
    await summary.click();
    const open = await settledRotation();
    expect(open).not.toBe(closed);

    await summary.click();
    const closedAgain = await settledRotation();
    expect(closedAgain).toBe(closed);
  });

  test("the phone fold's own ledger and rail summaries draw the same marker shape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await report.goto(FIXTURES.mini);

    const ledgerSummary = page
      .getByText("More about this lock")
      .locator("xpath=ancestor-or-self::summary[1]");
    const railSummary = page.getByText("Filters").locator("xpath=ancestor-or-self::summary[1]");
    for (const summary of [ledgerSummary, railSummary]) {
      const box = await markerBox(summary);
      expect(box.content).not.toBe("none");
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("darkens on hover — a visible affordance, not just a cursor change", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });
    const summary = dialog.locator("summary", { hasText: "The signals" });

    const before = await summary.evaluate((el) => getComputedStyle(el, "::after").borderLeftColor);
    await summary.hover();
    const hovered = await summary.evaluate((el) => getComputedStyle(el, "::after").borderLeftColor);
    expect(hovered).not.toBe(before);
  });
});
