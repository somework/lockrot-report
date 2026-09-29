/**
 * Every report renders by the same rules: an older document and a 0.13 one of the same project give
 * a pinned package the same answer, key facts and release-branches rows.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

interface Lead {
  readonly answer: string;
  readonly slot: string;
  readonly timeline: readonly string[];
}

async function lead(page: Page, fixture: FixtureName, pkg: string): Promise<Lead> {
  await report.gotoWithHash(fixture, `pkg=${encodeURIComponent(pkg)}`);
  const detail = page.getByRole("complementary", { name: pkg });
  await expect(detail).toBeVisible();
  const answer = (await detail.locator(".detail-answer").innerText()).trim();
  const slot = (await detail.locator(".detail-fact").nth(1).innerText()).replace(/\s+/g, " ").trim();
  const timeline = await detail.locator(".detail-timeline [role='rowheader']").allTextContents();
  return { answer, slot, timeline };
}

for (const [older, current, pkg] of [
  [FIXTURES.wallabag, FIXTURES.wallabag013, "wallabag/rulerz"],
  [FIXTURES.wallabag, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle"],
  [FIXTURES.mautic, FIXTURES.mautic013, "rector/rector"],
  [FIXTURES.mautic, FIXTURES.mautic013, "mautic/core-lib"],
] as const) {
  test(`${pkg}: ${older} renders as ${current} does`, async ({ page }) => {
    const before = await lead(page, older, pkg);
    const after = await lead(page, current, pkg);
    expect(before).toEqual(after);
  });
}

test("wallabag/rulerz on the older page: no tagged release, dated by the commit", async ({ page }) => {
  const { answer, slot } = await lead(page, FIXTURES.wallabag, "wallabag/rulerz");
  expect(answer).toMatch(/^Pinned to dev-master, a branch snapshot of a package with no tagged release\. /);
  expect(slot).toMatch(/^Last release none, a snapshot commit dated /i);
});

test("rector/rector on the older page: a Snapshot slot, never a release", async ({ page }) => {
  const { slot, timeline } = await lead(page, FIXTURES.mautic, "rector/rector");
  expect(slot).toMatch(/^Snapshot .+ a branch commit, not a release$/i);
  expect(timeline[0]).toBe("dev-main, yours");
});
