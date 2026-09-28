/**
 * Where a package came from, what a run note points at and whether an advisory's fix was looked for
 * are read from lockrot's own fields (`from_composer_repository`, `note_details`, S9's
 * `releases_read`), never guessed; a report without the field draws nothing in their place.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("koel 0.13: a package lockrot asked no repository about is not linked to Packagist", async () => {
  await report.goto(FIXTURES.koel013);
  await report.tab("packages");
  expect(await report.packageLinkHref("algolia/algoliasearch-client-php")).toBe(
    "https://packagist.org/packages/algolia/algoliasearch-client-php",
  );
  expect(await report.packageLinkHref("teamtnt/laravel-scout-tntsearch-driver")).toBeNull();
});

test("koel, an older report: a package no field places is not linked to Packagist", async () => {
  await report.goto(FIXTURES.koel);
  await report.tab("packages");
  expect(await report.packageLinkHref("algolia/algoliasearch-client-php")).toBeNull();
});

test("mini-0.13-edges: each run note links the page lockrot names for it, and only that", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.miniEdges013, "view=run");
  const notes = page.locator(".run-sections .note");
  await expect(notes).toHaveCount(21);
  await expect(notes.first().getByRole("link", { name: "what this means" })).toHaveAttribute(
    "href",
    "https://lockrot.dev/notes/#offline",
  );
  const unknown = notes.filter({ hasText: "acme licence scan skipped 2 packages" });
  await expect(unknown).toHaveText("acme licence scan skipped 2 packages");
  await expect(unknown.getByRole("link")).toHaveCount(0);
  await expect(page.locator(".run-sections .note a[href^='https://lockrot.dev/notes/#']")).toHaveCount(20);
});

test("koel, an older report: its note is shown with no link the page would have to guess", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.koel, "view=run");
  await expect(page.locator(".run-sections .note")).toHaveCount(1);
  await expect(page.locator(".run-sections .note a")).toHaveCount(0);
});

test("mini-0.13-edges: an advisory whose releases were not read says its fix was not checked", async ({
  page,
}) => {
  await report.goto(FIXTURES.miniEdges013);
  await report.tab("advisories");
  const row = page.getByRole("listitem", { name: /^acme\/silent-snapshot, / });
  await expect(row.locator(".ac-fix")).toHaveText("fix not checked");
  await expect(page.getByRole("list", { name: "Fix not checked" })).toContainText("silent-snapshot");
  await expect(page.getByRole("list", { name: "No fix listed" })).not.toContainText("silent-snapshot");

  await report.openPackage("acme/silent-snapshot");
  const detail = page.getByRole("complementary", { name: "acme/silent-snapshot" });
  await expect(detail.locator(".detail-rung-version")).toHaveText(["not checked"]);
  await detail.getByText("Every advisory").click();
  await expect(detail.locator(".detail-advisory-meta")).toContainText("fix not checked");
  await expect(detail).not.toContainText("no fix listed");
});
