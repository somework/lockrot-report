/**
 * a11y review (DESIGN.md §5, PD-ROWS-2/PD-LEDGER-2): two surfaces paint their meaning entirely
 * through `--tone`-derived colour, which Windows/Chromium forced-colors mode replaces with Canvas —
 * the page's own background — leaving nothing behind. `ledger.css`'s bar segments already carry the
 * fix this file proves for the age scale and the legend chip: measured before the fix, in both
 * colour schemes, every part named below computed to the same colour as the page itself.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-ROWS-2: the age scale stays visible in forced-colors mode", () => {
  test("javibravo/simpleue (wallabag, at-or-above-high zone), light forced colors", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const parts = await report.ageScaleForcedColorsVisible("javibravo/simpleue");
    expect(parts).toEqual({ track: true, tick: true, dot: true });
  });

  test("javibravo/simpleue (wallabag, at-or-above-high zone), dark forced colors", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
    await page.emulateMedia({ colorScheme: "dark", forcedColors: "active" });

    const parts = await report.ageScaleForcedColorsVisible("javibravo/simpleue");
    expect(parts).toEqual({ track: true, tick: true, dot: true });
  });

  test("sensio/framework-extra-bundle (wallabag, warn..high zone), light forced colors", async ({ page }) => {
    // 3.6 years against warn=3/high=5: the dashed-ring middle zone, not the filled or hollow ends.
    await report.goto(FIXTURES.wallabag);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const parts = await report.ageScaleForcedColorsVisible("sensio/framework-extra-bundle");
    expect(parts).toEqual({ track: true, tick: true, dot: true });
  });
});

test.describe("PD-LEDGER-2: a ledger legend chip stays legible in forced-colors mode", () => {
  test("an unpressed chip's swatch paints a colour distinct from the page", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const style = await report.legendButtonForcedColorsStyle("verdict", "abandoned");
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(style.swatchBackgroundColor).not.toBe(pageBg);
    expect(style.swatchBackgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("pressing a chip changes its own colours, not just its aria-pressed attribute", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    // `.legend-btn` carries a `background-color`/`border-color` transition for every reader, on or
    // off forced colors — reduced motion (`styles/base.css`'s own `!important` override) makes the
    // change land in the same tick as the click, so this reads the settled colour, not a mid-fade one.
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active", reducedMotion: "reduce" });

    const before = await report.legendButtonForcedColorsStyle("verdict", "abandoned");
    await report.ledgerButton("verdict", "abandoned");
    const after = await report.legendButtonForcedColorsStyle("verdict", "abandoned");

    // `border-color` is the property `.legend-btn[aria-pressed="true"]` itself declares (`Highlight`,
    // against the unpressed rule's `--border`, both forced); `background-color` also changes but
    // isn't asserted on its own, since `Highlight`'s alpha channel can read close to `Canvas` by
    // coincidence on some system palettes.
    expect(after.borderColor).not.toBe(before.borderColor);
    expect(after.swatchBackgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("pressing a chip changes its colours in dark forced colors too", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await page.emulateMedia({ colorScheme: "dark", forcedColors: "active", reducedMotion: "reduce" });

    const before = await report.legendButtonForcedColorsStyle("verdict", "abandoned");
    await report.ledgerButton("verdict", "abandoned");
    const after = await report.legendButtonForcedColorsStyle("verdict", "abandoned");

    expect(after.borderColor).not.toBe(before.borderColor);
  });
});
