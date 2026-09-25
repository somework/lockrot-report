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

  await expect(page.locator(".al-answer")).toContainText("6 advisories on 5 packages: 1 critical, 2 high");
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
  await page.locator(".al-empty").getByRole("button", { name: "Run data" }).click();
  expect(await report.hash()).toContain("view=run");
});

for (const width of [320, 390, 1024]) {
  test(`no horizontal overflow at ${String(width)}px, and below the one-line width the rows label their own cells`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await report.gotoWithHash(FIXTURES.miniAdvisories, "view=advisories");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".al-head")).toBeHidden();
  });
}

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
