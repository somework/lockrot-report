/**
 * PD-ROWS-1/PD-ROWS-2 (DESIGN.md §5): a Findings row leads with one key-fact signal line instead of
 * up to three, plus a small age scale beside it — the up-to-three lines a reviewer read as "text,
 * text, text, no scales".
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

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

  test("wallabag_wallabag: the Findings tab names the run's own age thresholds once, above the list", async () => {
    // PD-ROWS-3: the run's release-warn-years/release-high-years (3/5), named once for the whole
    // list rather than repeated on every row.
    await report.goto(FIXTURES.wallabag);

    expect(await report.ageScaleLegendText()).toBe("age scale: warn 3 y high 5 y");
  });

  test("wallabag_wallabag: the legend's accessible name spells out the unit, ahead of a raw tick glyph a screen reader would otherwise read aloud", async () => {
    // a11y review: `▏` (U+258F) used to sit in the line's own accessible text — VoiceOver reads it
    // as "left one-eighth block" — and the short "y" read oddly outside the visual, skimmable line
    // it sits in.
    await report.goto(FIXTURES.wallabag);

    expect(await report.ageScaleLegendAccessibleName()).toBe("age scale: warn at 3 years, high at 5 years");
  });

  test("wallabag_wallabag: names no legend on a tab that draws no age scale at all", async () => {
    await report.goto(FIXTURES.wallabag);
    await report.tab("run");

    expect(await report.ageScaleLegendText()).toBeNull();
  });

  test("wallabag_wallabag: sensio/framework-extra-bundle's dot sits on the warn tick without erasing it, in the default colour scheme too", async () => {
    // Regression review: PD-ROWS-3's own shared maximum bunches every row's warn/high ticks at a
    // fixed spot, and this finding's own S2 (3.6y against a 3/5 warn/high pair, the same shape
    // DESIGN.md §5 records for it) puts its dot right on the warn tick — before this, the dot's
    // opaque fill painted over it, in the page's ordinary colours, not only in forced-colors mode
    // (`ageScaleWarnTickSurvivesDot`'s own comment; DESIGN.md §5 PD-ROWS-2 first proved this same
    // paint-order technique against a forced-colors screenshot of a different package).
    await report.goto(FIXTURES.wallabag);

    expect(await report.ageScaleWarnTickSurvivesDot("sensio/framework-extra-bundle")).toBe(true);
    expect(await report.ageScaleHighTickSurvivesDot("sensio/framework-extra-bundle")).toBe(true);
  });
});

test.describe("PD-ROWS-3: a scale drawn for context, not for the verdict's own priority", () => {
  test("wallabag_wallabag: sensio/framework-extra-bundle reads its own S1/S3 as CRITICAL, but its S2 age is only warn — the scale must say so, not agree with a zone it did not cause", async () => {
    // The exact shape DESIGN.md §5 (PD-ROWS-3) records: abandoned (S1, marked abandoned; S3,
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
