import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * PD-ADV-1..4 (DESIGN.md §5): the Advisories tab answers first, then lists each advisory as one
 * ledger row under its fix shape, most severe first; Findings and All packages rows carry the same
 * advisory chip. `fixtures/bundles/mini-advisories.json`: six advisories on five packages, every
 * fix shape, prod and dev, dated one month to 2.6 years before the run.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("the answer leads, then one row per advisory, grouped by fix shape and most severe first", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");

  await expect(page.locator(".al-answer")).toContainText(
    "6 advisories on 5 packages, by severity 1 critical, 2 high",
  );
  await expect(page.locator(".al-group-head h2")).toHaveText([
    "A release on the branch you are on",
    "Only a move to another branch",
    "No fix listed",
  ]);
  expect(await report.rows()).toEqual([
    "acme/http-client",
    "acme/http-client",
    "acme/yaml",
    "acme/templating",
    "acme/markdown",
    "acme/debug-toolbar",
  ]);
  // Wide, the column head captions the row's cells and the reported-ago axis.
  await expect(page.locator(".al-head")).toBeVisible();
  await expect(page.locator(".al-tick")).toHaveText(["0", "1y", "2y", "3y"]);
  await expect(page.locator(".ac-bar")).toHaveCount(6);
});

test("each row is named by its package, severity and CVE or id, so two on one package differ", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
  await expect(
    page.getByRole("listitem", { name: "acme/http-client, critical, CVE-2026-31337" }),
  ).toHaveCount(1);
  await expect(page.getByRole("listitem", { name: "acme/http-client, medium, CVE-2026-29904" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("listitem", { name: "acme/yaml, low, GHSA-p9xw-66fq-2mhv" })).toHaveCount(1);
});

test("advisories found by a check that may not have covered every package say so under the answer", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniAdvisoriesPartial, "view=advisories");
  await expect(page.locator(".al-answer")).toContainText("6 advisories on 5 packages");
  const partial = page.locator(".al-partial");
  await expect(partial).toContainText("this list may be partial");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page }).include(".al-top").analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
  await partial.getByRole("button", { name: "Run data" }).click();
  await expect.poll(() => report.hash()).toContain("view=run");
});

test("a fragment opens its package and marks each of its rows current", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories&pkg=acme%2Fhttp-client");
  const current = page.locator('.adv[aria-current="true"]');
  await expect(current).toHaveCount(2);
  expect((await report.detail()).name).toBe("acme/http-client");
});

test("the same chip sits on a Findings row and an All packages row", async ({ page }) => {
  await report.goto(FIXTURES.miniAdvisories);
  await expect(page.locator('[data-pkg="acme/http-client"] .adv-chip')).toHaveText("2 advisories");
  await report.tab("packages");
  const chip = page.getByRole("row", { name: "acme/http-client" }).locator(".adv-chip");
  await expect(chip).toHaveText("2 advisories");
  await expect(chip).toHaveAttribute("title", "1 critical, 1 medium · fixed by 2.3.4 on your branch");
});

test("an incomplete check never reads as clean, and points at Run data", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.advisoryIncomplete, "view=advisories");
  await expect(page.locator(".al-empty")).toContainText(
    "No advisory found; 2 packages could not be confirmed clear.",
  );
  // No "0 of 0 advisories" above the sentence.
  await expect(page.locator(".count-line")).toHaveCount(0);
  await page.locator(".al-empty").getByRole("button", { name: "Run data" }).click();
  expect(await report.hash()).toContain("view=run");
});

for (const width of [320, 390]) {
  test(`no horizontal overflow at ${String(width)}px, and on a phone the rows label their own cells`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".al-head")).toBeHidden();
    await expect(page.locator(".ac-reported").first()).toHaveText("reported 2026-08-12, 6 weeks ago");
  });
}

test("at 1024 the two-column rows keep the reported-ago axis, captioned over the right-hand column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expect(page.locator(".al-head")).toBeVisible();
  await expect(page.locator(".al-col-pkg")).toBeHidden();
  await expect(page.locator(".al-tick")).toHaveText(["0", "1y", "2y", "3y"]);
  await expect(page.locator(".ac-bar")).toHaveCount(6);
  await expect(page.locator(".ac-bar").first()).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious axe violation on the ledger, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories&pkg=acme%2Ftemplating");
    await expect(page.locator(".aledger")).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".aledger").include(".al-top").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
  });
}
