/**
 * A run that read no repository data or ran no advisory lookup says so: the header shows no data
 * date it does not have, and Security names a lookup that did not run as not run.
 */
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, report2Url } from "./support/pages";

const runMeta = (page: Page) => page.locator(".topbar .run-meta");

test("the header names only the ages date when no finding read repository data", async ({ page }) => {
  // `unknown`: root data_date is null, generated_at is a real day.
  await page.goto(report2Url("unknown"));
  await expect(runMeta(page)).toContainText("ages as of 2026-10-01");
  await expect(runMeta(page)).not.toContainText(/data (and ages as of|\d|—)/);
});

test("the header shows the day of root data_date", async ({ page }) => {
  await page.goto(report2Url("B-offline-dagger"));
  await expect(runMeta(page)).toContainText("data and ages as of 2026-10-01");
});

test("Overview Security and the Advisories tab say the lookup did not run", async ({ page }) => {
  await page.goto(report2Url("B-offline-dagger"));
  const security = page.locator(".ledger-advisories");
  await expect(security).toContainText("the advisory check did not run");
  await expect(security).not.toContainText("incomplete");
  await expect(page.getByRole("tab", { name: "Advisories 0, check not run" })).toBeVisible();
});

// R16-9b: the sticky header stays one row at a common laptop width.
test.describe("the header's dates at 1366 px", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  for (const [name, url, dates] of [
    ["one day", report2Url("composite"), "data and ages as of 2026-10-01"],
    ["two days", pageUrl(FIXTURES.olderDataReport2), "data 2026-09-24 · ages 2026-10-01"],
  ] as const) {
    test(`${name}: "${dates}" keeps every header fact on the brand's row`, async ({ page }) => {
      await page.goto(url);
      await expect(runMeta(page)).toContainText(dates);
      const brand = await page.locator(".topbar .brand").boundingBox();
      const tops = await runMeta(page)
        .locator(":scope > *")
        .evaluateAll((facts) => facts.map((f) => f.getBoundingClientRect().top));
      const brandBottom = (brand?.y ?? 0) + (brand?.height ?? 0);

      expect(brand).not.toBeNull();
      expect(tops.filter((top) => top >= brandBottom)).toEqual([]);
    });
  }
});
