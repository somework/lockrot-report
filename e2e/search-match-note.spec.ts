import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

// report-2 free text matches the name and the version only (`domain/query2.ts`), both on the row,
// so a found row never carries a match note and the count line never splits.
test.describe("report-2: free text finds what the row shows", () => {
  test("a word lists the rows that name it, with no match note and no split", async ({ page }) => {
    await report.gotoReport2("composite");
    await report.search("Symfony/");

    expect(await report.rows()).toEqual([
      "symfony/monolog-bridge",
      "symfony/debug",
      "friendsofsymfony/oauth-server-bundle",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    await expect(page.locator('[data-surface="findings"] .match-note')).toHaveCount(0);
    await expect(page.locator(".match-split")).toHaveCount(0);
    await expect(page).toHaveURL(/q=Symfony%2F/);
  });

  test("a #q= link loads with the list already narrowed, on All packages too", async () => {
    await report.gotoReport2WithHash("composite", "view=packages&q=v5.4");
    expect(await report.rows()).toEqual(["symfony/yaml"]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`no serious axe violation with a search on, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await report.gotoReport2WithHash("composite", "q=symfony%2F");
      await expect(page.locator('[data-surface="findings"] .fp').first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('[data-surface="findings"]')
        .include('[role="status"]')
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});
