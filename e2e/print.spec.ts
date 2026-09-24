import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * Print has no JS of its own (history.md §10: no `window.print()`, no `beforeprint` listener — it
 * is pure `@media print` CSS; `legacy/report.css:629-636` is the provenance for the rule). This
 * asserts that the print stylesheet hides the app chrome, unconditionally.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.mini);
});

test("screen media shows the tab bar", async () => {
  expect(await report.isNavigationVisible()).toBe(true);
});

test("print media hides the tab bar and the rest of the interactive chrome with it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
});

test("switching back to screen media restores it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
  await page.emulateMedia({ media: "screen" });
  expect(await report.isNavigationVisible()).toBe(true);
});

// print.css: colour that carries meaning (a verdict's tone) must survive an actual print, not just
// a screen render — Chromium drops background colour on print unless a rule opts out with
// `print-color-adjust: exact` (plus the `-webkit-` form older engines still read). A screenshot
// never exercises that default, so these assert on the computed property and value directly.
test("print keeps the ledger bar segments' colour, unlike Chromium's ink-saving print default", async ({
  page,
}) => {
  const before = await report.ledgerSegmentPrintStyle();

  await page.emulateMedia({ media: "print" });
  const after = await report.ledgerSegmentPrintStyle();

  // The colour itself is unchanged from screen to print...
  expect(after.backgroundColor).toBe(before.backgroundColor);
  expect(after.backgroundColor).not.toBe("");
  expect(after.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  // ...because the rule that keeps it there is in force.
  expect(after.printColorAdjust).toBe("exact");
});

test("print keeps a Findings row's verdict pill in its own tone", async ({ page }) => {
  // mini.json: vendor/transitive is the abandoned finding (fixtures/bundles/mini.json).
  const before = await report.pillPrintStyle("vendor/transitive", "abandoned");

  await page.emulateMedia({ media: "print" });
  const after = await report.pillPrintStyle("vendor/transitive", "abandoned");

  expect(after.borderColor).toBe(before.borderColor);
  expect(after.borderColor).not.toBe("");
  expect(after.printColorAdjust).toBe("exact");
});
