/**
 * A report-2 Findings row leads with the score, then the flag pills, the age scale and the next
 * step.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Url } from "./support/pages";
import { pageGolden } from "./support/report2/page-goldens";
import {
  findingsHeadCaptions,
  findingsNextStep,
  findingsRow,
  findingsRowCells,
  findingsSurface,
  rowAge,
  scoreSegmentWidths,
} from "./support/report2/findings";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: the Findings row leads with the score, then the pills, the age and the next step", () => {
  test("composite: symfony/monolog-bridge draws its score, its three pills, its age scale, its reach and its move", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=findings");

    const [score, pkg, flags, ageCell, reach] = await findingsRowCells(page, "symfony/monolog-bridge");
    expect([score, pkg, flags, ageCell, reach]).toEqual([
      "36",
      "symfony/monolog-bridge v2.6.13",
      "left-behind·6.9 y old-promise·PHP 5 vulnerable·1",
      "",
      "direct",
    ]);
    // The bar is a drawing, so the cell has no words of its own: the reading is in the left-behind
    // pill and in the cell's label.
    const golden = pageGolden("composite").findings_rows.find(
      (row) => row.package === "symfony/monolog-bridge",
    );
    const next = await findingsNextStep(page, "symfony/monolog-bridge");
    expect(next.move).toBe("require ^5.4.52");
    expect(next.held).toBe(golden?.held);
    expect(next.after).toBe(golden?.after);
    expect(next.major).toBe(golden?.major);
    expect(next.command).toBe(golden?.command);
    const age = await rowAge(page, "symfony/monolog-bridge");
    expect(age?.label).toBe("installed branch last released 6.9 years ago; warn at 3 years, high at 5");
    expect(age?.title).toBe(age?.label);
  });

  test("composite: a row whose age no check judged draws no scale, and a held move names its holder", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=findings");

    expect(await rowAge(page, "twig/twig")).toBeNull();
    const next = await findingsNextStep(page, "twig/twig");
    expect(next.move).toBe("php floor raise");
    expect(next.held).toBe(
      pageGolden("composite").findings_rows.find((row) => row.package === "twig/twig")?.held,
    );
  });

  test("composite: the column head captions the score scale at the band floors and the age axis", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url("composite") + "#view=findings");

    // SPEC §7.9.5: ticks at 8, 16 and 32, none at low's floor 1.
    expect(await findingsHeadCaptions(page)).toEqual({
      score: "Score 0 8 16 32",
      age: "Years since release 0 3y 5y 10y+",
    });
  });

  test("composite at 390px: a 2-point segment is still drawn 4px wide, and the bar is hidden from a screen reader", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report2Url("composite") + "#view=findings");

    const [width] = await scoreSegmentWidths(page, "symfony/yaml");
    expect(width).toBeGreaterThanOrEqual(4);
    await expect(findingsRow(page, "symfony/yaml").locator(".sbar")).toHaveAttribute("aria-hidden", "true");
  });
});

test.describe("report-2: the age scale and axis", () => {
  test("a tab that draws no age draws no age axis", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    expect(await report.ageAxisText()).toBe("Years since release 0 3y 5y 10y+");

    await report.tab("run");

    expect(await report.ageAxisText()).toBeNull();
  });

  test("the axis describes the run's own thresholds to a screen reader", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");

    expect(await report.ageAxisDescription()).toBe(
      "age axis: years since the last release, 0 to 10 and more; warn at 3 years, high at 5 years",
    );
  });

  test("a bar that crosses a guide does not erase it, in the default colour scheme too", async () => {
    await report.gotoReport2WithHash("baselined-wallabag-2.6", "view=findings");

    expect(await report.ageScaleWarnTickSurvivesDot("symfony/http-foundation")).toBe(true);
    expect(await report.ageScaleHighTickSurvivesDot("symfony/http-foundation")).toBe(true);
  });
});

test.describe("report-2: no serious axe violation on the Findings tab", () => {
  for (const name of ["B", "F", "B-baselined-dagger"]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${name}, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(report2Url(name) + "#view=findings");
        await expect(findingsSurface(page).locator(".fp").first()).toBeVisible();

        const results = await new AxeBuilder({ page }).include('[data-surface="findings"]').analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual(
          [],
        );
      });
    }
  }
});
