import { expect, test } from "@playwright/test";
import { FIXTURES, pageUrl, report2Cases, report2Url } from "./support/pages";
import { findingsNextStep, findingsRowCells, findingsSurface } from "./support/report2/findings";
import { pageGolden } from "./support/report2/page-goldens";
import { overviewSurface } from "./support/report2/overview";

/**
 * Every report-2 page built from lockrot's recorded bundle opens clean, on the report-2 surfaces.
 * A report-1 document gets the report-1 screen, through the page's own boot.
 */
const cases = report2Cases();

test("the build wrote report-2 pages", () => {
  expect(cases).toEqual(expect.arrayContaining(["composite", "A", "B", "F", "B-baselined-dagger"]));
  expect(cases.some((name) => name.startsWith("baselined-"))).toBe(true);
});

test("the composite's Findings rows draw the score, the package, the pills, the reach and the next step", async ({
  page,
}) => {
  await page.goto(report2Url("composite") + "#view=findings");

  const [score, pkg, flags, , reach] = await findingsRowCells(page, "symfony/polyfill-intl-idn");
  expect([score, pkg, flags, reach]).toEqual([
    "2",
    "symfony/polyfill-intl-idn v1.37.0",
    "vulnerable·1maintenance accepted (lockrot's list)",
    "via guzzlehttp/guzzle",
  ]);
  const golden = pageGolden("composite").findings_rows.find((row) => row.package === "symfony/polyfill-intl-idn");
  expect(reach).toBe(golden?.reach);
  const next = await findingsNextStep(page, "symfony/polyfill-intl-idn");
  expect(next.move).toBe("composer update");
  expect(next.after).toBe(golden?.after);
});

for (const name of cases) {
  test(`report-2 page ${name} routes to the report-2 shell with no console error`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));

    await page.goto(report2Url(name));
    await page.waitForLoadState("load");

    await expect(overviewSurface(page)).toBeAttached();
    await page.getByRole("tab", { name: /^Findings/ }).click();
    await expect(findingsSurface(page)).toBeAttached();
    expect(problems).toEqual([]);
  });
}

test("a report-1 document gets the report-1 screen: what to do, and no report", async ({ page }) => {
  await page.goto(pageUrl(FIXTURES.report1));

  await expect(
    page.getByRole("heading", { name: "This page reads lockrot 0.14 reports only" }),
  ).toBeVisible();
  await expect(page.getByText("This report is older than this page.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rerun lockrot 0.14" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Open it with lockrot-report 0.13" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
});
