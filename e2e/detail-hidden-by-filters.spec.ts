/**
 * PD-DETAIL-4 (DESIGN.md §5): "the detail survives a filter that hides its package" is kept on
 * purpose (§5's own "deliberately kept" list) — this only tells a reader it is happening, with a
 * control to undo it.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("on a report-2 page", () => {
  test("shows the hidden line, and its control clears the filters and moves focus to Close", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openPackage("twig/twig");
    expect((await report.detail()).text).not.toContain("Hidden by the current filters");

    await report.search("no-such-package");
    expect(await report.rows()).toEqual([]);
    expect((await report.detail()).text).toContain("Hidden by the current filters");
    expect(await report.countLine()).toContain("twig/twig is hidden by the current filters");

    await report.clearFiltersFromDetail();
    expect(await report.searchValue()).toBe("");
    expect(await report.rows()).toContain("twig/twig");
    expect(await report.isFocusOnDetailClose()).toBe(true);
  });

  test("shows the line when a rail filter hides the open package", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openPackage("twig/twig");
    await report.toggleRailRow("stale");

    expect(await report.rows()).not.toContain("twig/twig");
    expect((await report.detail()).text).toContain("Hidden by the current filters");
  });
});
