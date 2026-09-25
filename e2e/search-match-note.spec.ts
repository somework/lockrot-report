import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * PD-SEARCH-1 (DESIGN.md §5): free text keeps legacy's semantics — a word in the package name,
 * version, verdict or evidence — and the address keeps `q=`, but the page now says when a package
 * was found outside its name. On wallabag, "hoa/" lists the 14 hoa/* packages and the two
 * wallabag/rulerz packages whose evidence names the hoa/* packages they pull in.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.wallabag);
});

test("the status line splits the count and names the two packages that only mention the word", async () => {
  await report.search("hoa/");
  expect(await report.rows()).toHaveLength(16);
  expect(await report.countLine()).toContain(
    "16 match “hoa/”: 14 by name, 2 mention it (wallabag/rulerz, wallabag/rulerz-bundle)",
  );
  // The address is unchanged: the query is still just q=.
  expect(await report.hash()).toContain("q=hoa%2F");
});

test("a row found only in its evidence quotes the hit; a row found by its name does not", async ({
  page,
}) => {
  await report.search("hoa/");
  const rulerz = page.locator('[data-pkg="wallabag/rulerz"]');
  await expect(rulerz.locator(".match-note")).toHaveText(
    "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
  );
  await expect(rulerz.locator(".match-note mark")).toHaveText("hoa/");
  await expect(page.locator('[data-pkg="hoa/compiler"] .match-note')).toHaveCount(0);
  // The row's accessible name is still the package alone.
  await expect(page.getByRole("listitem", { name: "wallabag/rulerz", exact: true })).toBeVisible();
});

test("a #q= link loads with the split and the notes already in place", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=packages&q=hoa%2F");
  expect(await report.countLine()).toContain("14 by name, 2 mention it");
  await expect(page.locator('[data-pkg="wallabag/rulerz-bundle"] .match-note mark')).toHaveText("hoa/");
});

test("the Advisories tab counts packages, and each row of one found in its evidence carries the note", async ({
  page,
}) => {
  await report.tab("advisories");
  await report.search("11.x");
  expect(await report.countLine()).toContain("1 package matches “11.x”: 1 mentions it (spomky-labs/otphp)");
  await expect(page.locator(".adv .match-note")).toHaveCount(2);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious axe violation with the notes on screen, ${colorScheme}`, async ({ page }) => {
    // The scheme is set before the page loads, so no colour is caught mid-transition.
    await page.emulateMedia({ colorScheme });
    await report.gotoWithHash(FIXTURES.wallabag, "q=hoa%2F");
    await expect(page.locator(".match-note").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".fledger").include('[role="status"]').analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
  });
}
