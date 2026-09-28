/** "Why this is <priority>" is lockrot's own priority_basis in words; a report without it draws no
 *  ladder. */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

function ladder(page: import("@playwright/test").Page, pkg: string) {
  return page.getByRole("complementary", { name: pkg }).locator(".detail-ladder-text");
}

test("mini-0.13-edges: each step as lockrot took it, an unknown one as written", async ({ page }) => {
  await report.goto(FIXTURES.miniEdges013);

  await report.openPackage("acme/dev-vuln");
  await expect(ladder(page, "acme/dev-vuln")).toHaveText([
    "Left-behind packages start at high.",
    "You don’t require it directly: one step down. It comes through acme/dev-tool.",
    "Installed for development only: one step down.",
    "An advisory no release will fix: one step up.",
    "So: medium.",
  ]);

  await report.openPackage("acme/silent-snapshot");
  await expect(ladder(page, "acme/silent-snapshot").nth(2)).toHaveText(
    "An advisory whose fix could not be looked for: one step up.",
  );

  await report.openPackage("acme/future-step");
  const unknown = ladder(page, "acme/future-step").nth(1);
  await expect(unknown).toHaveText("licence_change: high → critical.");
  await expect(unknown.locator("code")).toHaveText("licence_change");
});

test("koel lock-only: a transitive package reached from nothing steps down as unreached", async ({
  page,
}) => {
  await report.goto(FIXTURES.koelLockOnly013);
  await report.openPackage("predis/predis");
  await expect(ladder(page, "predis/predis").nth(1)).toHaveText(
    "No direct requirement this run knows reaches it: one step down.",
  );
});

test("wallabag before 0.13: the priority shows, with no ladder", async ({ page }) => {
  await report.goto(FIXTURES.wallabag);
  await report.openPackage("spomky-labs/otphp");
  const detail = await report.detail();
  expect(detail.text).not.toContain("Why this is");
  // Its evidence says "no fix expected" in prose only; no field says so, so the answer does not.
  await expect(page.locator(".detail-answer")).toHaveText(
    "Left behind on 10.x: its last release was 4.5 years ago while 11.x kept releasing. It comes in through scheb/2fa-google-authenticator. 2 security advisories affect your version; 11.5.0 fixes them.",
  );
});

test("wallabag 0.13: otphp's advisories are fixed only on a higher branch, so no fix is coming on 10.x", async ({
  page,
}) => {
  await report.goto(FIXTURES.wallabag013);
  await report.openPackage("spomky-labs/otphp");
  await expect(page.locator(".detail-answer")).toContainText(
    "2 security advisories affect your version and no fix is coming on 10.x.",
  );
  await expect(ladder(page, "spomky-labs/otphp").nth(2)).toHaveText(
    "An advisory no release will fix: one step up.",
  );
});
