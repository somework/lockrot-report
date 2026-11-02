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
  test("composite: the run facts, How the score works, the advisory lookup, the PHP window, the gate and the thresholds, axe-clean in both themes", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=run");
    await expect(runHeadings(page)).toHaveText([
      "This run",
      "How the score works · score model 1",
      "Advisory lookup",
      "PHP window",
      "Gate",
      "Thresholds in force",
    ]);
    await expect(runSurface(page).getByRole("table", { name: "Weights" })).toBeVisible();
    await expect(runSurface(page).getByRole("table", { name: "Advisories" })).toBeVisible();
    await expect(runSurface(page)).toContainText(
      "packagist.org: answered · 49 on record · 6 packages with records",
    );
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

  test("a baselined run states its counts and every stale entry", async ({ page }) => {
    await report.gotoReport2WithHash("baselined-wallabag-2.6", "view=run");
    const baseline = runSurface(page).locator(".run2-baseline");
    await expect(baseline).toContainText("48 known · 61 new · 6 worsened · 2 stale");
    await expect(baseline.getByRole("listitem")).toHaveText(["behat/transliterator", "true/punycode"]);
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
    await expect(ruleRows(page).nth(1)).toContainText("used on 6");
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
    // One test walks every page, the multi-megabyte locks of the PHP window cases included.
    test.slow();
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

test.describe("a score-model table is a Tab stop only while it scrolls sideways (PD-A11Y-SWEEP-10)", () => {
  test("at 1440 px neither table scrolls, so neither wrap is a region or a Tab stop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report.gotoReport2WithHash("composite", "view=run");
    const wraps = runSurface(page).locator(".run2-table-wrap");
    await expect(wraps).toHaveCount(2);

    for (const wrap of await wraps.all()) {
      const [scroll, client] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);
      await expect(wrap).not.toHaveAttribute("tabindex");
      await expect(wrap).not.toHaveAttribute("role");
    }
  });

  test("at 375 px both tables scroll, so each wrap is a named region that takes focus", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await report.gotoReport2WithHash("composite", "view=run");

    for (const name of ["Weights", "Advisories"]) {
      const region = runSurface(page).getByRole("region", { name });
      await expect(region).toHaveAttribute("tabindex", "0");
      const [scroll, client] = await region.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeGreaterThan(client);
      await region.focus();
      await expect(region).toBeFocused();
    }
  });
});

test("the Advisories score table names its two Band columns apart (PD-A11Y-SWEEP-11)", async ({ page }) => {
  await report.gotoReport2WithHash("composite", "view=run");
  const table = runSurface(page).getByRole("table", { name: "Advisories" });

  await expect(table.locator("thead th")).toHaveText([
    "Severity",
    "Points",
    "Band",
    "× 2: no reachable fix",
    "Band",
  ]);
  await expect(table.getByRole("columnheader", { name: "Band", exact: true })).toHaveCount(1);
  await expect(table.getByRole("columnheader", { name: "Band with no reachable fix" })).toHaveCount(1);
});
