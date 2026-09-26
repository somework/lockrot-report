/**
 * PD-RUN-1..5 (DESIGN.md §5): Run data opens with the run in a sentence, names the fields a document
 * leaves out, draws the thresholds on the Findings list's scale and says why a value is missing; the
 * detail's check strip points at each check's evidence, Provenance's activity line included.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("wallabag: the run in one sentence, the thresholds as scales, axe-clean in both themes", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=run");
  await expect(page.locator(".run-answer")).toContainText(
    "lockrot 0.11.0 checked 271 packages in wallabag/wallabag’s composer.lock against PHP 8.4",
  );
  await expect(page.locator(".run-absent")).toHaveCount(0);
  // release and push share 3/5 here, so one scale carries both subjects.
  await expect(page.locator(".run-thr-row")).toHaveCount(1);
  await expect(page.locator(".run-thr-subject")).toHaveText(["release", "push"]);
  // The replacement count says apart the one named only in words (sensio/framework-extra-bundle).
  const abandoned = page
    .locator("dt", { hasText: /^abandoned with a replacement$/ })
    .locator("xpath=following-sibling::dd[1]");
  await expect(abandoned).toHaveText("0 of 21 · 1 more named in words only");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page }).include(".run-sections").analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
});

test("capsule 0.10: names the two fields it leaves out, and the rows that need them say so", async ({
  page,
}) => {
  await report.gotoWithHash("capsule-0.10-drupal" as FixtureName, "view=run");
  await expect(page.locator(".run-absent code")).toHaveText(["abandoned", "libyears"]);
  const row = page.locator("dt", { hasText: /^libyears behind$/ }).locator("xpath=following-sibling::dd[1]");
  await expect(row).toHaveText("not in this document");
  await expect(page.locator(".run-answer")).toContainText("was 24 hours old");
});

test("no sideways scroll on Run data at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await report.gotoWithHash("capsule-0.10-drupal" as FixtureName, "view=run");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("a quiet S4 cell opens Provenance at the repository activity line, and keeps the fragment", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.koel, "pkg=predis%2Fpredis");
  const hash = await report.hash();
  const detail = page.getByRole("complementary", { name: "predis/predis" });
  await detail.getByRole("button", { name: "S4 push age, quiet: show the evidence" }).click();
  await expect(detail.locator("#detail-provenance")).toHaveAttribute("open", "");
  const activity = detail.locator("#detail-prov-activity");
  await expect(activity).toBeInViewport();
  await expect(activity).toContainText("GitHub");
  await expect(activity).toContainText("during this run");
  // Focus lands on the facts themselves, not the section's summary.
  await expect(activity).toBeFocused();
  expect(await report.hash()).toBe(hash);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page })
      .include(".detail-checks")
      .include("#detail-provenance")
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
});

test("the gate flag stays whole in the sentence at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await report.gotoWithHash(FIXTURES.wallabag, "view=run");
  const flag = page.locator(".run-answer code", { hasText: "--fail-on=none" });
  const box = await flag.boundingBox();
  const lineHeight = await flag.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 20);
  expect(box?.height ?? 0).toBeLessThan(lineHeight * 1.5);
});

test("Provenance says why a source is absent instead of a dash, and reads S4's own forge facts", async ({
  page,
}) => {
  await report.gotoWithHash("capsule-0.10-drupal" as FixtureName, "pkg=drupal%2Fcore");
  let detail = page.getByRole("complementary", { name: "drupal/core" });
  await detail.getByRole("heading", { name: "Provenance", level: 3 }).click();
  await expect(detail.locator(".detail-prov")).toHaveText(
    "Package metadata · repository activitynone — not from a Composer repository",
  );

  await report.gotoWithHash("synthetic-no-details" as FixtureName, "pkg=daverandom%2Fresume");
  detail = page.getByRole("complementary", { name: "daverandom/resume" });
  await detail.getByRole("heading", { name: "Provenance", level: 3 }).click();
  const activity = detail.locator("#detail-prov-activity");
  await expect(activity.locator(".detail-prov-source")).toHaveText("github.com from S4’s data");
  await expect(activity).toContainText("DaveRandom/Resume");
  await expect(activity).toContainText("2018-06-25");
  await expect(detail.locator(".detail-prov")).toContainText("not in this document — it explains no package");
  const results = await new AxeBuilder({ page }).include("#detail-provenance").analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
