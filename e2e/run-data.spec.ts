/**
 * The report-2 Run data tab: how the score works, the advisory lookup, the gate and the thresholds
 * in force.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Cases, report2Url } from "./support/pages";
import { ruleRows, runHeadings, runSurface } from "./support/report2/run";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: the Run tab of SPEC §7.9.16", () => {
  test("composite: How the score works, the advisory lookup, the gate and the thresholds, axe-clean in both themes", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=run");
    await expect(runHeadings(page)).toHaveText([
      "How the score works · score model 1",
      "Advisory lookup",
      "Gate",
      "Thresholds in force",
    ]);
    await expect(runSurface(page).getByRole("table", { name: "Weights" })).toBeVisible();
    await expect(runSurface(page).getByRole("table", { name: "Advisories" })).toBeVisible();
    await expect(runSurface(page)).toContainText("packagist.org: 33 on record · 4 packages with records");
    await runSurface(page).getByText("The 16 rules").click();
    await expect(ruleRows(page)).toHaveCount(16);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect
        .poll(async () =>
          (await new AxeBuilder({ page }).include('[data-surface="run"]').analyze()).violations.map(
            (v) => v.id,
          ),
        )
        .toEqual([]);
    }
  });

  test("composite: the 16 rule rows open from their fold, each linked to its docs anchor", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=run");
    await expect(ruleRows(page).first()).toBeHidden();
    await runSurface(page).getByText("The 16 rules").click();
    await expect(ruleRows(page)).toHaveCount(16);
    await expect(ruleRows(page).nth(1).getByRole("link")).toHaveAttribute(
      "href",
      "https://lockrot.dev/verdicts/model-1/#score-lead-first",
    );
    await expect(ruleRows(page).nth(1)).toContainText("used on 4");
  });

  test("routing: the not-from-a-Composer-repository note says the advisories were asked", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("routing", "view=run");
    await expect(runSurface(page)).toContainText(
      "1 package is not from a Composer repository: its release metadata and repository activity were not read · advisories asked",
    );
  });

  test("no sideways scroll on Run data at 320px, on every report-2 page", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const cases = report2Cases();
    expect(cases).toContain("B-gate-list");
    for (const name of cases) {
      await page.goto(`${report2Url(name)}#view=run`);
      await expect(runSurface(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, name).toBe(0);
    }
  });
});
