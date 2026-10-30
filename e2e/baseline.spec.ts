/**
 * The baseline surfaces of a report-2 page: the rail's Since and Fails-this-run rows, the flag
 * pills' baseline marks and the detail sheet's Baseline row.
 */
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";
import { findingsRow, findingsRows } from "./support/report2/findings";
import { report2Pages } from "../scripts/report2-embed.ts";

test.describe("report-2: the baseline on the Findings tab and the rail", () => {
  const CASE = "baselined-wallabag-2.6";
  const embed = report2Pages().find((p) => p.name === `report2-${CASE}`)?.embed;
  const graded = (embed?.report.findings ?? [])
    .filter((f) => (embed?.report.run.graded_verdicts as readonly string[] | undefined)?.includes(f.verdict))
    .sort((a, b) => a.rank - b.rank);
  const rows = (page: Page) =>
    findingsRows(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-pkg") ?? ""));

  test("the rail's Since rows count the graded findings in each baseline state", async ({ page }) => {
    await page.goto(report2Url(CASE) + "#view=findings");
    const rail = page.getByRole("group", { name: "Filters" });
    const newCount = graded.filter((f) => f.baseline?.status === "new").length;
    expect(newCount).toBeGreaterThan(0);
    await expect(rail.getByRole("button", { name: /^New/ })).toContainText(String(newCount));
  });

  test("a pasted since=new link lists exactly the new findings, in rank order", async ({ page }) => {
    await page.goto(report2Url(CASE) + "#since=new");
    await expect(findingsRows(page).first()).toBeVisible();
    expect(await rows(page)).toEqual(
      graded.filter((f) => f.baseline?.status === "new").map((f) => f.package),
    );
    await expect(
      page.getByRole("group", { name: "Filters" }).getByRole("button", { name: /^New/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the rail's 'Fails this run' lists the findings whose gate fails", async ({ page }) => {
    await page.goto(report2Url(CASE) + "#view=findings");
    await page
      .getByRole("group", { name: "Filters" })
      .getByRole("button", { name: /^Fails this run/ })
      .click();
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("gate=fails");
    expect(await rows(page)).toEqual(graded.filter((f) => f.gate.fails).map((f) => f.package));
  });

  test("the rail's Since title names the baseline file", async ({ page }) => {
    await page.goto(report2Url(CASE) + "#view=findings");
    await expect(page.locator(".rail-path")).toHaveText(embed?.report.baseline?.path ?? "");
  });

  test("a known flag carries a tick with hidden words, a covered one names its cover", async ({ page }) => {
    await page.goto(report2Url("B-baselined-dagger") + "#view=findings");
    const pills = findingsRow(page, "symfony/monolog-bridge").locator(".fp");
    const pill = (flag: string) => pills.filter({ has: page.locator(".fp-word", { hasText: flag }) });
    await expect(pill("left-behind").locator(".fp-mark")).toHaveText("known to the baseline");
    await expect(pill("old-promise").locator(".fp-mark")).toHaveText("covered by the recorded left-behind");
  });

  test("the detail sheet's Baseline row says what is new and what the baseline covers", async ({ page }) => {
    const sheet = await openDetail2(page, "B-baselined-dagger", "symfony/monolog-bridge");
    const row = sheet.locator(".d2-row", { has: page.getByRole("heading", { name: "Baseline" }) });

    await expect(row.locator(".d2-row-text")).toHaveText(
      /^\(baseline: .*1 new advisory.*covered by the recorded left-behind/,
    );
  });

  test("a run without a baseline draws no Baseline row", async ({ page }) => {
    const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");

    await expect(sheet.getByRole("heading", { name: "Baseline" })).toHaveCount(0);
  });
});
