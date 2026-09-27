/**
 * PD-S6-3: every document is worded from its fields in one way. An unmeasured package gives the
 * reason its libyears block counts it under, the lock entry never calls a commit date a release, and
 * S2 is not called "stable" where lockrot counts every tag.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

function libyearsWords(page: Page, pkg: string) {
  return page.locator(`.pk-table tr[data-pkg="${pkg}"] .pk-ly .vh`);
}

async function lockEntry(page: Page, pkg: string): Promise<Record<string, string>> {
  await report.openPackage(pkg);
  const detail = page.getByRole("complementary", { name: pkg });
  const section = detail.locator("details", { has: page.locator("summary", { hasText: "The lock entry" }) });
  // The section may stay open from the package opened before, and a click would close it.
  if ((await section.getAttribute("open")) === null) {
    await section.locator("summary").click();
  }
  await expect(section.locator("dt").first()).toBeVisible();
  const labels = await section.locator("dt").allInnerTexts();
  const values = await section.locator("dd").allInnerTexts();
  return Object.fromEntries(labels.map((label, index) => [label.trim(), (values[index] ?? "").trim()]));
}

test("mautic 0.13: a package with no S6 and no note has no release date lockrot trusts", async ({ page }) => {
  await report.goto(FIXTURES.mautic013);
  await report.tab("packages");
  for (const pkg of [
    "symfony/polyfill-ctype",
    "symfony/polyfill-intl-icu",
    "symfony/polyfill-php73",
    "symfony/polyfill-php80",
    "twig/string-extra",
  ]) {
    await expect(libyearsWords(page, pkg)).toHaveText("not measured: no release date lockrot trusts");
  }
  await expect(libyearsWords(page, "rector/rector")).toHaveText("not measured: branch snapshot");

  const entry = await lockEntry(page, "symfony/polyfill-ctype");
  expect(entry["libyears behind"]).toBe("not measured · no release date lockrot trusts");
});

test("mini-0.13-edges: each unmeasured package's reason is the one its libyears block counts", async ({
  page,
}) => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("packages");
  await expect(libyearsWords(page, "acme/untagged")).toHaveText(
    "not measured: no release date lockrot trusts",
  );
  await expect(libyearsWords(page, "acme/path-lib")).toHaveText(
    "not measured: not from a Composer repository",
  );

  await report.tab("run");
  await expect(page.getByText("no dated release 1", { exact: false })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("no stable release date");
});

test("capsule 0.10: a document without a libyears block names no reason", async ({ page }) => {
  await report.goto("capsule-0.10-drupal" as FixtureName);
  await report.tab("packages");
  const words = await page.locator(".pk-table .pk-ly .vh").allInnerTexts();
  expect(words.length).toBeGreaterThan(0);
  expect(new Set(words)).toEqual(new Set(["not measured"]));
});

test("the lock entry dates a snapshot's commit and an untagged version's lock time, never as a release", async ({
  page,
}) => {
  await report.goto(FIXTURES.miniEdges013);
  const pathLib = await lockEntry(page, "acme/path-lib");
  expect(pathLib).toHaveProperty("snapshot dated");
  expect(pathLib).not.toHaveProperty("released");

  const untagged = await lockEntry(page, "acme/untagged");
  expect(untagged).toHaveProperty("lock time");
  expect(untagged).not.toHaveProperty("released");

  const left = await lockEntry(page, "acme/left");
  expect(left).toHaveProperty("released");

  await report.goto(FIXTURES.mautic013);
  const rector = await lockEntry(page, "rector/rector");
  expect(rector["snapshot dated"]).toMatch(/^2026-08-04 · /);
  expect(rector).not.toHaveProperty("released");
});

test("wallabag: S2 is a recent release, not a stable one, on the rail and on a row", async ({ page }) => {
  await report.goto(FIXTURES.wallabag);
  const labels = (await report.railRows()).map((row) => row.label);
  expect(labels.some((label) => label.includes("no recent release"))).toBe(true);
  expect(labels.some((label) => /stable/.test(label))).toBe(false);
  await expect(
    page
      .locator("main")
      .getByText(/^no release since /)
      .first(),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("no stable release");
});
