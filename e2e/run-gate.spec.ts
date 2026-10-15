/**
 * The report-2 gate: lockrot's `gate.text` printed as written in the overview lead and on the Run
 * tab, and the rail's "Fails this run" row.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { gateLine } from "./support/report2/overview";
import { runGateLine } from "./support/report2/run";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: the gate view prints gate.text as written", () => {
  for (const [name, text] of [
    [
      "B-gate-list",
      "gate: fails · --fail-on=left-behind,vulnerable-high · 1 finding fails it (left-behind 1, vulnerable-high 1) · target php 8.4 (--target-php)",
    ],
    ["B-gate-none", "gate: off · --fail-on=none · target php 8.4 (--target-php)"],
    [
      "stale-accepted-dagger",
      "gate: passes · --fail-on=high · no finding fails it · target php 8.4 (--target-php)",
    ],
  ] as const) {
    test(`${name}: in the overview lead and on the Run tab`, async ({ page }) => {
      await report.gotoReport2(name);
      await expect(gateLine(page)).toHaveText(text);
      await report.tab("run");
      await expect(runGateLine(page)).toHaveText(text);
    });
  }

  test("B-gate-list: the lead's gate line wraps inside the band at every width", async ({ page }) => {
    await report.gotoReport2("B-gate-list");
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("B-gate-none: a stale gate=fails lists every row, leaves the address and offers no Fails-this-run row", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("B-gate-none", "gate=fails");

    expect((await report.rows()).length).toBeGreaterThan(0);
    await expect.poll(() => report.hash()).not.toContain("gate=");
    await expect(page.getByRole("button", { name: /^Fails this run/ })).toHaveCount(0);
  });
});
