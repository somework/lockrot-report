/**
 * PD-ROWS-1/PD-ROWS-2 (DESIGN.md §5): a Findings row leads with one key-fact signal line instead of
 * up to three, plus a small age scale beside it — the up-to-three lines a reviewer read as "text,
 * text, text, no scales".
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-ROWS-1/PD-ROWS-2: the Findings row's key fact and age scale", () => {
  test("wallabag_wallabag: javibravo/simpleue shows exactly one fact line and a scale naming both thresholds", async () => {
    // javibravo/simpleue carries S2 (high, 8.9y), S4 (high, 8.8y) and S5 (warn) — S2 and S4 tie on
    // level, so S2 wins the numeric id order (DESIGN.md §5's own tie-break), and only its line
    // shows; the run's release-warn-years/release-high-years are 3/5.
    await report.goto(FIXTURES.wallabag);

    expect(await report.rowSignalIds("javibravo/simpleue")).toEqual(["S2"]);
    expect(await report.rowMoreSignalsText("javibravo/simpleue")).toBe("+ 2 more signals, open the package");
    expect(await report.rowAgeScaleLabel("javibravo/simpleue")).toBe(
      "last release 8.9 years ago; warn at 3 years, high at 5",
    );
  });

  test("koel_koel: daverandom/resume shows its highest-level signal, S2 over the tied S4", async () => {
    // daverandom/resume carries S2 (high, 8.7y), S4 (high, 8.2y) and S5 (warn) — the same S2/S4 tie
    // as wallabag's javibravo/simpleue, on a different fixture and a different package.
    await report.goto("koel_koel" as FixtureName);

    expect(await report.rowSignalIds("daverandom/resume")).toEqual(["S2"]);
    expect(await report.rowAgeScaleLabel("daverandom/resume")).toBe(
      "last release 8.7 years ago; warn at 3 years, high at 5",
    );
  });
});
