/**
 * A run that read no repository data or ran no advisory lookup says so: the header shows no data
 * date it does not have, and Security names a lookup that did not run as not run.
 */
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";

const runMeta = (page: Page) => page.locator(".topbar .run-meta");

test("the header shows the data date as absent when no finding read repository data", async ({ page }) => {
  // `unknown`: root data_date is null, generated_at is a real day.
  await page.goto(report2Url("unknown"));
  await expect(runMeta(page)).toContainText("data as of —");
  await expect(runMeta(page)).not.toContainText(/data as of \d{4}-\d{2}-\d{2}/);
});

test("the header shows the day of root data_date", async ({ page }) => {
  await page.goto(report2Url("B-offline-dagger"));
  await expect(runMeta(page)).toContainText("data as of 2026-10-01");
});

test("Overview Security and the Advisories tab say the lookup did not run", async ({ page }) => {
  await page.goto(report2Url("B-offline-dagger"));
  const security = page.locator(".ledger-advisories");
  await expect(security).toContainText("the advisory check did not run");
  await expect(security).not.toContainText("incomplete");
  await expect(page.getByRole("tab", { name: "Advisories 0, check not run" })).toBeVisible();
});
