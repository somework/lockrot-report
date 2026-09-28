/**
 * PD-S6-3: every document is worded from its fields in one way. An unmeasured package gives its own
 * `libyears_unmeasured`, the lock entry never calls a commit date a release, and S2 is not called
 * "stable" where lockrot counts every tag.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

function libyearsWords(pkg: string): Promise<string> {
  return report.packageCellWords(pkg, "libyears");
}

async function lockEntry(pkg: string): Promise<Record<string, string>> {
  await report.openPackage(pkg);
  return report.detailFacts("The lock entry");
}

test("mautic 0.13: each unmeasured package gives its own libyears_unmeasured", async () => {
  await report.goto(FIXTURES.mautic013);
  await report.tab("packages");
  for (const pkg of [
    "symfony/polyfill-ctype",
    "symfony/polyfill-intl-icu",
    "symfony/polyfill-php73",
    "symfony/polyfill-php80",
    "twig/string-extra",
  ]) {
    expect(await libyearsWords(pkg)).toBe("not measured: no release date lockrot trusts");
  }
  expect(await libyearsWords("rector/rector")).toBe("not measured: branch snapshot");
  expect(await libyearsWords("mautic/core-lib")).toBe("not measured: not from a Composer repository");

  const entry = await lockEntry("symfony/polyfill-ctype");
  expect(entry["libyears behind"]).toBe("not measured · no release date lockrot trusts");
});

test("mini-0.13-edges: each unmeasured package's reason is the one its libyears block counts", async ({
  page,
}) => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("packages");
  expect(await libyearsWords("acme/untagged")).toBe("not measured: no release date lockrot trusts");
  expect(await libyearsWords("acme/path-lib")).toBe("not measured: not from a Composer repository");

  await report.tab("run");
  await expect(page.getByText("no release date lockrot trusts 1", { exact: false })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("no dated release");
  await expect(page.locator("main")).not.toContainText("no stable release date");
});

test("mini-0.13-edges: a reason the page does not know is shown as written", async () => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("packages");
  expect(await libyearsWords("acme/future-reason")).toBe("not measured: yanked_release");

  await report.tab("run");
  const row = report.runField("libyears not measured");
  await expect(row.locator("code")).toHaveText(["yanked_release"]);
  await expect(row).toContainText("not from a Composer repository 1");
  await expect(row).not.toContainText("yanked release");
});

for (const fixture of ["capsule-0.10-drupal" as FixtureName, FIXTURES.mautic]) {
  test(`${fixture}: a document without libyears_unmeasured names no reason`, async () => {
    await report.goto(fixture);
    await report.tab("packages");
    const words = await report.packageColumnWords("libyears");
    const unmeasured = words.filter((word) => word.startsWith("not measured"));
    expect(unmeasured.length).toBeGreaterThan(0);
    expect(new Set(unmeasured)).toEqual(new Set(["not measured"]));
  });
}

test("the lock entry dates a snapshot's commit and an untagged version's lock time, never as a release", async () => {
  await report.goto(FIXTURES.miniEdges013);
  const pathLib = await lockEntry("acme/path-lib");
  expect(pathLib).toHaveProperty("snapshot dated");
  expect(pathLib).not.toHaveProperty("released");

  const untagged = await lockEntry("acme/untagged");
  expect(untagged).toHaveProperty("lock time");
  expect(untagged).not.toHaveProperty("released");

  const left = await lockEntry("acme/left");
  expect(left).toHaveProperty("released");

  await report.goto(FIXTURES.mautic013);
  const rector = await lockEntry("rector/rector");
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
