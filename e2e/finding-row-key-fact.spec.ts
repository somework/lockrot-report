/**
 * PD-ROWS-1/PD-ROWS-2 (DESIGN.md §5): a Findings row leads with one key-fact signal line instead of
 * up to three, plus a small age scale beside it — the up-to-three lines a reviewer read as "text,
 * text, text, no scales".
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, report2Url } from "./support/pages";
import {
  findingsHeadCaptions,
  findingsRow,
  findingsRowCell,
  findingsRowCells,
  findingsSurface,
  rowAge,
  scoreSegmentWidths,
} from "./support/report2/findings";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-ROWS-1/PD-ROWS-2: the Findings row's key fact and age scale", () => {
  test("wallabag_wallabag: javibravo/simpleue shows exactly one fact line and a scale naming both thresholds", async () => {
    // javibravo/simpleue carries S2 (high, 8.9y), S4 (high, 8.8y) and S5 (warn) — S2 and S4 tie on
    // level, so S2 wins on S-id order (a tie on level goes to the lower id), and only its line
    // shows; the run's release-warn-years/release-high-years are 3/5.
    await report.goto(FIXTURES.wallabag);

    expect(await report.rowSignalIds("javibravo/simpleue")).toEqual(["S2"]);
    // PD-ROWS-4 (DESIGN.md §5): the "+ 2 more signals, open the package" note is gone on purpose —
    // the one-line row quotes its key fact, and the detail lists every signal.
    expect(await report.rowMoreSignalsText("javibravo/simpleue")).toBeNull();
    expect(await report.rowAgeScaleLabel("javibravo/simpleue")).toBe(
      "last release 8.9 years ago; warn at 3 years, high at 5",
    );
  });

  test("koel_koel: daverandom/resume shows its highest-level signal, S2 over the tied S4", async () => {
    // daverandom/resume carries S2 (high, 8.7y), S4 (high, 8.2y) and S5 (warn) — the same S2/S4 tie
    // as wallabag's javibravo/simpleue, on a different fixture and a different package.
    await report.goto(FIXTURES.koel);

    expect(await report.rowSignalIds("daverandom/resume")).toEqual(["S2"]);
    expect(await report.rowAgeScaleLabel("daverandom/resume")).toBe(
      "last release 8.7 years ago; warn at 3 years, high at 5",
    );
  });

  test("wallabag_wallabag: the scale's title matches its aria-label, so hovering a tick shows a reader what it means", async () => {
    // PD-ROWS-3 (DESIGN.md §5): before this, the run's own thresholds sat only in the accessible
    // name — nothing a sighted reader hovering the ticks themselves ever saw.
    await report.goto(FIXTURES.wallabag);

    const label = await report.rowAgeScaleLabel("javibravo/simpleue");
    expect(label).not.toBeNull();
    expect(await report.rowAgeScaleTitle("javibravo/simpleue")).toBe(label);
  });

  test("wallabag_wallabag: the column head captions the one age axis with the run's own thresholds", async () => {
    // PD-ROWS-4 (DESIGN.md §5): replaces PD-ROWS-3's floating "age scale: warn 3 y high 5 y" line
    // above the list — the thresholds (3/5) caption their own guides, over the bars they measure.
    await report.goto(FIXTURES.wallabag);

    expect(await report.ageAxisText()).toBe("Years since release 0 3y 5y 10y+");
    expect(await report.ageAxisAccessibleName()).toBe(
      "age axis: years since the last release, 0 to 10 and more; warn at 3 years, high at 5 years",
    );
  });

  test("wallabag_wallabag: draws no age axis on a tab that draws no age at all", async () => {
    await report.goto(FIXTURES.wallabag);
    await report.tab("run");

    expect(await report.ageAxisText()).toBeNull();
  });

  test("wallabag_wallabag: sensio/framework-extra-bundle's bar crosses the warn guide without erasing it, in the default colour scheme too", async () => {
    // Regression review: this finding's own S2 (3.6y against a 3/5 warn/high pair) runs its bar
    // across the warn guide. The guides paint above the bars (PD-ROWS-4), so a guide stays readable
    // where a bar crosses it — the same paint-order check PD-ROWS-2/3 kept for the scale's ticks.
    await report.goto(FIXTURES.wallabag);

    expect(await report.ageScaleWarnTickSurvivesDot("sensio/framework-extra-bundle")).toBe(true);
    expect(await report.ageScaleHighTickSurvivesDot("sensio/framework-extra-bundle")).toBe(true);
  });
});

test.describe("PD-ROWS-3: a scale drawn for context, not for the verdict's own priority", () => {
  test("wallabag_wallabag: sensio/framework-extra-bundle reads its own S1/S3 as CRITICAL, but its S2 age is only warn — the scale must say so, not agree with a zone it did not cause", async () => {
    // The shape this test pins (PD-ROWS-3): abandoned (S1, marked abandoned; S3,
    // archived) starts this finding at critical — its S2 (3.6y, against a 3/5 warn/high pair)
    // would, on its own, only ever reach the warn zone. The scale still draws (the age fact is
    // real) but must name itself as context, not as the reason for the row's own priority.
    await report.goto(FIXTURES.wallabag);

    const label = await report.rowAgeScaleLabel("sensio/framework-extra-bundle");
    expect(label).toContain("age shown for context");
    expect(label).toContain("flagged for being marked abandoned");
    expect(label).not.toContain("warn at");
    expect(await report.rowAgeScaleTitle("sensio/framework-extra-bundle")).toBe(label);
  });
});

test.describe("report-2: the Findings row leads with the score, then the pills, the age and the next step", () => {
  test("composite: symfony/monolog-bridge draws its score, its three pills, its age scale, its reach and its move", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));

    expect(await findingsRowCells(page, "symfony/monolog-bridge")).toEqual([
      "36",
      "symfony/monolog-bridge v2.6.13",
      "left-behind·6.9 yold-promise·PHP 5vulnerable·1",
      "6.9",
      "direct",
      "require ^5.4.52",
    ]);
    const age = await rowAge(page, "symfony/monolog-bridge");
    expect(age?.label).toBe("installed branch last released 6.9 years ago; warn at 3 years, high at 5");
    expect(age?.title).toBe(age?.label);
  });

  test("composite: a row whose age no check judged draws no scale, and a held move says so", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));

    expect(await rowAge(page, "twig/twig")).toBeNull();
    expect(await findingsRowCell(page, "twig/twig", "next")).toBe("php floor raise · held");
  });

  test("composite: the column head captions the score scale at the band floors and the age axis", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url("composite"));

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
    await page.goto(report2Url("composite"));

    const [width] = await scoreSegmentWidths(page, "symfony/yaml");
    expect(width).toBeGreaterThanOrEqual(4);
    await expect(findingsRow(page, "symfony/yaml").locator(".sbar")).toHaveAttribute("aria-hidden", "true");
  });
});

test.describe("report-2: no serious axe violation on the Findings tab", () => {
  for (const name of ["B", "F", "B-baselined-dagger"]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${name}, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(report2Url(name));
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
