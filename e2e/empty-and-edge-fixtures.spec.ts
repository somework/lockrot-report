import { expect, test } from "@playwright/test";
import { report2Url } from "./support/pages";
import { advisoryRows } from "./support/report2/advisories";
import { openDetail2 } from "./support/report2/detail";
import { findingsSurface } from "./support/report2/findings";
import { packagesOrder } from "./support/report2/packages";

/** report2-ok-unchecked: five packages checked, one `ok` finding, so nothing is flagged. */
test.describe("report-2: a lock with nothing flagged", () => {
  const PKG = "scheb/2fa-google-authenticator";

  test.beforeEach(async ({ page }) => {
    await page.goto(report2Url("ok-unchecked"));
  });

  test("Findings reads zero and says nothing was flagged, not that a filter matched nothing", async ({
    page,
  }) => {
    await expect(page.getByRole("tab", { name: /^Findings/ })).toHaveText("Findings0");
    await expect(findingsSurface(page).locator("li[data-pkg]")).toHaveCount(0);
    await expect(findingsSurface(page)).toContainText("Nothing was flagged.");
    await expect(findingsSurface(page)).not.toContainText("matches this filter");
  });

  test("Advisories reads zero rows the same way", async ({ page }) => {
    await page.getByRole("tab", { name: /^Advisories/ }).click();

    await expect(advisoryRows(page)).toHaveCount(0);
  });

  test("the ok finding is not on Findings and its sheet still opens from All packages", async ({ page }) => {
    await page.getByRole("tab", { name: /^All packages/ }).click();
    expect(await packagesOrder(page)).toEqual([PKG]);

    const sheet = await openDetail2(page, "ok-unchecked", PKG);

    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(PKG);
  });
});
