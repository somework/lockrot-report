/**
 * a11y review (DESIGN.md §5, PD-ROWS-2/PD-LEDGER-2): two surfaces paint their meaning entirely
 * through `--tone`-derived colour, which Windows/Chromium forced-colors mode replaces with Canvas —
 * the page's own background — leaving nothing behind. `ledger.css`'s own marks already carry the
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

test.describe("PD-ROWS-2/PD-ROWS-4: the age bar and its guides stay visible in forced-colors mode", () => {
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

  test("defuse/php-encryption (wallabag, warn..high zone), light forced colors", async ({ page }) => {
    // "stale" (S2 3.3 years, against warn=3/high=5): the hatched middle zone (PD-ROWS-4), not the
    // solid or hollow ends. Not sensio/framework-extra-bundle (also in this range, at 3.6y) — its own verdict
    // is "abandoned", so PD-ROWS-3 (DESIGN.md §5) now draws its scale in the neutral `contextOnly`
    // tone regardless of zone; this test wants the zone shapes themselves, so it picks a verdict
    // ("stale") whose priority actually comes from age.
    await report.goto(FIXTURES.wallabag);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const parts = await report.ageScaleForcedColorsVisible("defuse/php-encryption");
    expect(parts).toEqual({ track: true, tick: true, dot: true });
  });

  // Second a11y review: a colour check alone can't tell a guide painted over by the bar from one
  // that's genuinely missing. jwilsson/spotify-web-api-php sits at 3.1y against koel_koel's own
  // warn=3 threshold — its bar ends right on the warn guide, which must stay on top.
  test("jwilsson/spotify-web-api-php (koel_koel, 3.1y against warn=3): the warn tick survives under the dot", async ({
    page,
  }) => {
    await report.goto(FIXTURES.koel);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    expect(await report.ageScaleWarnTickSurvivesDot("jwilsson/spotify-web-api-php")).toBe(true);
  });

  test("jwilsson/spotify-web-api-php (koel_koel, 3.1y against warn=3): the warn tick survives under the dot, dark forced colors", async ({
    page,
  }) => {
    await report.goto(FIXTURES.koel);
    await page.emulateMedia({ colorScheme: "dark", forcedColors: "active" });

    expect(await report.ageScaleWarnTickSurvivesDot("jwilsson/spotify-web-api-php")).toBe(true);
  });

  // PD-ROWS-3 (DESIGN.md §5): sensio/framework-extra-bundle's own bar draws in the neutral
  // `contextOnly` tone (abandoned, from S1/S3, not from its own S2 age) — GrayText in forced-colors
  // mode, distinct from both the page and the zone patterns. Still a real mark, not an invisible one.
  test("sensio/framework-extra-bundle's own contextOnly bar is still visible in forced colors", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabag);
    await page.emulateMedia({ colorScheme: "dark", forcedColors: "active" });

    const parts = await report.ageScaleForcedColorsVisible("sensio/framework-extra-bundle");
    expect(parts).toEqual({ track: true, tick: true, dot: true });
  });
});

test.describe("PD-LEDGER-2: a ledger legend chip stays legible in forced-colors mode", () => {
  // A priority chip ("high 1" on mini.json): the verdicts mini flags are drawn as bars now, with no
  // swatch of their own (PD-SUMMARY-7) — `verdictBarForcedColors` below covers those.
  test("an unpressed chip's swatch paints a colour distinct from the page", async ({ page }) => {
    await report.goto(FIXTURES.mini);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const style = await report.legendButtonForcedColorsStyle("prio", "high");
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

    const before = await report.legendButtonForcedColorsStyle("prio", "high");
    await report.ledgerButton("prio", "high");
    const after = await report.legendButtonForcedColorsStyle("prio", "high");

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

  // Second a11y review: `legendButtonForcedColorsStyle` above only proves `getComputedStyle`
  // changed on press — it stayed green before this fix too, because a native `<button>`'s
  // forced-colors paint can diverge from its own computed style: `getComputedStyle` kept reporting
  // `.legend-btn[aria-pressed="true"]`'s own `background: Highlight`, but the button's real content
  // face painted as a light, near-white system colour regardless, with the label's `color:
  // HighlightText` (also light) on top of it — a light-on-light label no colour-only check could
  // tell from a working one (confirmed by screenshot: reverting the fix reproduces exactly this,
  // the word rendered but not one pixel of it distinguishable from its own backplate). This
  // screenshots the label's own text and reads its pixels instead. Measured against that broken
  // build: this ratio reads exactly 0 there, and ~30-40% once the label actually paints — 0.15 is a
  // wide margin between the two, not a tuned edge.
  test("the pressed chip's label actually paints pixels distinct from its own backplate, light forced colors", async ({
    page,
  }) => {
    await report.goto(FIXTURES.mini);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active", reducedMotion: "reduce" });
    await report.ledgerButton("verdict", "abandoned");

    const ratio = await report.legendButtonPressedLabelDistinctPixelRatio("verdict", "abandoned");
    expect(ratio).toBeGreaterThan(0.15);
  });

  test("the pressed chip's label actually paints pixels distinct from its own backplate, dark forced colors", async ({
    page,
  }) => {
    await report.goto(FIXTURES.mini);
    await page.emulateMedia({ colorScheme: "dark", forcedColors: "active", reducedMotion: "reduce" });
    await report.ledgerButton("verdict", "abandoned");

    const ratio = await report.legendButtonPressedLabelDistinctPixelRatio("verdict", "abandoned");
    expect(ratio).toBeGreaterThan(0.15);
  });
});

test.describe("PD-SUMMARY-7: a verdict bar keeps its marks, not a frame, in forced-colors mode", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the bar's priority parts keep a fill and an unpressed row draws no box, ${colorScheme}`, async ({
      page,
    }) => {
      await report.goto(FIXTURES.wallabag);
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      // Polled: under load Firefox can read styles before the forced palette has been applied.
      await expect
        .poll(() => report.verdictBarForcedColors("left-behind"))
        .toEqual({
          partFilled: true,
          rowFramed: false,
        });
    });
  }
});

test.describe("PD-SUMMARY-6: the summary band's waffle stays readable in forced-colors mode", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`flagged squares keep a fill and quiet ones an outline, ${colorScheme} forced colors`, async ({
      page,
    }) => {
      await report.goto(FIXTURES.wallabag);
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      await expect
        .poll(() => report.summaryWaffleForcedColors())
        .toEqual({ flaggedDistinct: true, restOutlined: true });
    });
  }
});
