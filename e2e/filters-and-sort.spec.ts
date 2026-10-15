import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { rowPills } from "./support/report2/findings";
import { gradeChips, severityChips } from "./support/report2/overview";
import { packagesColumn, packagesOrder, sortPackagesBy } from "./support/report2/packages";

let report: ReportPage;

/** The grade chip whose label starts with the grade, such as "high". */
const gradeChipNamed = (page: Page, grade: string) =>
  gradeChips(page).filter({ hasText: new RegExp(`^${grade}`) });

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: rail filters, the accepted toggle and the All packages sort", () => {
  test("grade: selecting a grade chip narrows Findings to that grade", async ({ page }) => {
    await report.gotoReport2("composite");
    await gradeChipNamed(page, "high").click();

    expect(await report.rows()).toEqual(["friendsofsymfony/oauth-server-bundle", "tubalmartin/cssmin"]);
  });

  test("M17: grade chips expose a pressed state to assistive tech", async ({ page }) => {
    await report.gotoReport2("composite");
    const chip = gradeChipNamed(page, "high");
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    await chip.click();

    await expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  test("a legend chip's title names the click's effect, and changes once pressed", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=advisories");
    const chip = severityChips(page).filter({ hasText: /^critical/ });
    await expect(chip).toHaveAttribute("title", "Show only critical");

    await chip.click();

    await expect(chip).toHaveAttribute("title", "Showing only critical — click to clear this filter");
  });

  test("severity: selecting a severity chip narrows Advisories to that severity", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=advisories");
    await severityChips(page)
      .filter({ hasText: /^critical/ })
      .click();

    expect(await report.rows()).toEqual(["twig/twig"]);
  });

  test("scope: transitive narrows out the direct requirements", async () => {
    await report.gotoReport2("composite");
    await report.railOption("scope", "transitive");

    expect(await report.rows()).toEqual(["symfony/polyfill-intl-idn"]);
    expect(await report.railOptionPressed("scope", "transitive")).toBe(true);
  });

  test("clear resets the query and every filter group, but not the tab or the open package", async () => {
    await report.gotoReport2("composite");
    await report.tab("packages");
    await report.openPackage("twig/twig");
    await report.railOption("scope", "transitive");
    await report.search("snapshot");
    expect(await report.rows()).toEqual([]);

    await report.clear();

    expect(await report.searchValue()).toBe("");
    expect(await report.rows()).toHaveLength(7);
    expect(await report.activeTab()).toBe("packages");
    expect((await report.detail()).name).toBe("twig/twig");
  });

  test("sort: clicking a different column switches the sort key and resets to ascending", async () => {
    await report.gotoReport2("composite");
    await report.tab("packages");
    await report.sortBy("package");
    expect(await report.sortState()).toEqual({ key: "package", desc: false });
    await report.sortBy("package");
    expect(await report.sortState()).toEqual({ key: "package", desc: true });

    await report.sortBy("verdict");

    expect(await report.sortState()).toEqual({ key: "verdict", desc: false });
  });
  test("flag: a flag row narrows Findings to the packages whose score counts it", async ({ page }) => {
    await report.gotoReport2("composite");
    await report.toggleRailRow("stale");

    expect(await report.rows()).toEqual(["friendsofsymfony/oauth-server-bundle", "tubalmartin/cssmin"]);
    await expect(page).toHaveURL(/flag=stale/);
    await expect(page.getByRole("button", { name: /^stale \d+$/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("scope: not in composer.json keeps the package no line names", async () => {
    await report.gotoReport2("composite");
    await report.toggleRailRow("not in composer.json");

    expect(await report.rows()).toEqual(["symfony/polyfill-intl-idn"]);
  });

  test("accepted: the toggle hides the accepted pills, keeps every row, and is no filter chip", async ({
    page,
  }) => {
    await report.gotoReport2("B-accepted-dagger");
    const before = await report.rows();
    await expect(rowPills(page, "symfony/monolog-bridge")).toHaveText([
      "vulnerable·1",
      "left-behind·accepted",
      "old-promise·accepted",
    ]);

    await report.toggleRailRow("Hide accepted flags");

    expect(await report.rows()).toEqual(before);
    await expect(rowPills(page, "symfony/monolog-bridge")).toHaveText(["vulnerable·1"]);
    await expect(page).toHaveURL(/accepted=hide/);
    await expect(page.locator("button.af-chip")).toHaveCount(0);

    await report.toggleRailRow("Hide accepted flags");
    await expect(rowPills(page, "symfony/monolog-bridge")).toHaveCount(3);
  });

  test("clear resets the flag filter and the accepted toggle", async ({ page }) => {
    await report.gotoReport2WithHash("B-accepted-dagger", "flag=vulnerable&accepted=hide");
    await expect(rowPills(page, "symfony/monolog-bridge")).toHaveText(["vulnerable·1"]);

    await report.clear();

    await expect(page).not.toHaveURL(/flag=/);
    await expect(rowPills(page, "symfony/monolog-bridge")).toHaveCount(3);
  });

  test("sort: All packages opens in rank order; Score sorts highest first, then reverses", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await report.tab("packages");
    const byRank = await packagesOrder(page);
    expect(byRank[0]).toBe("twig/twig");

    await sortPackagesBy(page, "Score");
    const scores = (await packagesColumn(page, "score")).map(Number);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    await sortPackagesBy(page, "Score");
    const reversed = (await packagesColumn(page, "score")).map(Number);
    expect(reversed).toEqual([...reversed].sort((a, b) => a - b));
  });

  test.describe("PD-RAIL-1: every filter row's count is the list it selects", () => {
    test.describe.configure({ timeout: 120_000 });
    test.use({ viewport: { width: 1440, height: 900 } });

    for (const name of ["composite", "baselined-wallabag-main"]) {
      for (const view of ["findings", "packages"] as const) {
        test(`${name}, ${view}`, async () => {
          await report.gotoReport2(name);
          await report.tab(view);
          // The accepted toggle filters no package: its count is the rows whose pills it hides.
          const rows = (await report.railRows()).filter((row) => row.label !== "Hide accepted flags");
          expect(rows.length).toBeGreaterThan(0);

          const mismatches: string[] = [];
          for (const row of rows) {
            await report.toggleRailRow(row.label, row.group);
            const listed = await report.listedPackageCount();
            if (listed !== row.count) mismatches.push(`${row.label}: shows ${row.count}, lists ${listed}`);
            await report.toggleRailRow(row.label, row.group);
          }

          expect(mismatches).toEqual([]);
        });
      }
    }
  });
});
