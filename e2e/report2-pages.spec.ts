import { expect, test } from "@playwright/test";
import { report2Cases, report2Url } from "./support/pages";
import { findingsRowCells, findingsSurface } from "./support/report2/findings";
import { overviewSurface } from "./support/report2/overview";

/**
 * Every report-2 page built from lockrot's recorded bundle opens clean, on the report-2 surfaces
 * and with no newer-schema banner.
 */
const cases = report2Cases();

test("the build wrote report-2 pages", () => {
  expect(cases).toEqual(expect.arrayContaining(["composite", "A", "B", "F", "B-baselined-dagger"]));
  expect(cases.some((name) => name.startsWith("baselined-"))).toBe(true);
});

test("the composite's Findings rows draw the score, the package, the version and the reach word", async ({
  page,
}) => {
  await page.goto(report2Url("composite"));

  expect(await findingsRowCells(page, "twig/twig")).toEqual(["32", "twig/twig", "v2.16.1", "direct"]);
  expect(await findingsRowCells(page, "symfony/polyfill-intl-idn")).toEqual([
    "2",
    "symfony/polyfill-intl-idn",
    "v1.37.0",
    "via guzzlehttp/guzzle",
  ]);
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

    await expect(findingsSurface(page)).toBeAttached();
    await expect(overviewSurface(page)).toBeAttached();
    await expect(page.locator(".schema-banner")).toHaveCount(0);
    expect(problems).toEqual([]);
  });
}
