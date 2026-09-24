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
