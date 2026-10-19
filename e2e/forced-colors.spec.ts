/**
 * a11y review (DESIGN.md §5, PD-ROWS-2/PD-LEDGER-2): two surfaces paint their meaning entirely
 * through `--tone`-derived colour, which Windows/Chromium forced-colors mode replaces with Canvas —
 * the page's own background — leaving nothing behind. `ledger.css`'s own marks already carry the
 * fix this file proves for the age scale and the legend chip: measured before the fix, in both
 * colour schemes, every part named below computed to the same colour as the page itself.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";
import { findingsRow } from "./support/report2/findings";
import { flagBars, severityChips } from "./support/report2/overview";
import { decodePng, distinctPixelRatio } from "./support/png";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

const WALLABAG = "baselined-wallabag-2.6";

test.describe("report-2: the age bar and its guides stay visible in forced-colors mode", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`javibravo/simpleue (at-or-above-high zone), ${colorScheme} forced colors`, async ({ page }) => {
      await report.gotoReport2WithHash(WALLABAG, "view=findings");
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      expect(await report.ageScaleForcedColorsVisible("javibravo/simpleue")).toEqual({
        track: false,
        tick: true,
        dot: true,
      });
    });

    test(`symfony/http-foundation (warn..high zone), ${colorScheme} forced colors`, async ({ page }) => {
      await report.gotoReport2WithHash(WALLABAG, "view=findings");
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      expect(await report.ageScaleForcedColorsVisible("symfony/http-foundation")).toEqual({
        track: false,
        tick: true,
        dot: true,
      });
    });
  }

  // A colour check alone cannot tell a guide painted over by the bar from one that is missing.
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the warn tick survives under the bar, ${colorScheme} forced colors`, async ({ page }) => {
      await report.gotoReport2WithHash(WALLABAG, "view=findings");
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      expect(await report.ageScaleWarnTickSurvivesDot("symfony/http-foundation")).toBe(true);
    });
  }
});

/** A legend chip's colours: its own, and its swatch's (the swatch is the chip's first child). */
async function chipColours(chip: Locator): Promise<{ borderColor: string; swatch: string }> {
  return chip.evaluate((el) => {
    const swatch = el.children[0];
    if (!(swatch instanceof HTMLElement)) throw new Error("legend chip has no swatch");
    return {
      borderColor: getComputedStyle(el).borderColor,
      swatch: getComputedStyle(swatch).backgroundColor,
    };
  });
}

/** The share of pixels actually painted across a chip's label that differ from its backplate. A
 *  native `<button>`'s forced-colors paint can diverge from `getComputedStyle`, so this reads the
 *  screenshot. The 2px inset keeps the chip's own border out of the crop. */
async function labelPixelRatio(page: Page, chip: Locator): Promise<number> {
  const rect = await chip.evaluate((el) => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    }
    throw new Error("legend chip has no bare label text node to screenshot");
  });
  const inset = 2;
  const buf = await page.screenshot({
    clip: {
      x: rect.x + inset,
      y: rect.y + inset,
      width: Math.max(1, rect.width - inset * 2),
      height: Math.max(1, rect.height - inset * 2),
    },
  });
  return distinctPixelRatio(decodePng(buf));
}

test.describe("report-2: a severity chip stays legible in forced-colors mode", () => {
  test("an unpressed chip's swatch paints a colour distinct from the page", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=advisories");
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });

    const { swatch } = await chipColours(severityChips(page).first());

    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(swatch).not.toBe(pageBg);
    expect(swatch).not.toBe("rgba(0, 0, 0, 0)");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`pressing a chip changes its own colours, not just aria-pressed, ${colorScheme}`, async ({
      page,
    }) => {
      await report.gotoReport2WithHash("composite", "view=advisories");
      // Reduced motion lands the chip's colour transition in the click's own tick.
      await page.emulateMedia({ colorScheme, forcedColors: "active", reducedMotion: "reduce" });
      const chip = severityChips(page).first();

      const before = await chipColours(chip);
      await chip.click();
      const after = await chipColours(chip);

      expect(after.borderColor).not.toBe(before.borderColor);
      expect(after.swatch).not.toBe("rgba(0, 0, 0, 0)");
    });

    test(`the pressed chip's label paints pixels distinct from its backplate, ${colorScheme}`, async ({
      page,
    }) => {
      await report.gotoReport2WithHash("composite", "view=advisories");
      await page.emulateMedia({ colorScheme, forcedColors: "active", reducedMotion: "reduce" });
      const chip = severityChips(page).first();
      await chip.click();

      expect(await labelPixelRatio(page, chip)).toBeGreaterThan(0.15);
    });
  }
});

test.describe("report-2: a flag bar keeps its marks, not a frame, in forced-colors mode", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the bar's grade parts keep a fill and an unpressed row draws no box, ${colorScheme}`, async ({
      page,
    }) => {
      await report.gotoReport2(WALLABAG);
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      // Polled: under load Firefox can read styles before the forced palette has been applied.
      await expect
        .poll(() =>
          flagBars(page)
            .first()
            .evaluate((el) => {
              const part = el.querySelector(".legend-seg");
              if (!(part instanceof HTMLElement)) throw new Error("flag bar has no grade part");
              const pageBg = getComputedStyle(document.body).backgroundColor;
              const fill = getComputedStyle(part).backgroundColor;
              const row = getComputedStyle(el);
              return {
                partFilled: fill !== pageBg && fill !== "rgba(0, 0, 0, 0)",
                rowFramed: row.borderTopColor !== row.backgroundColor,
              };
            }),
        )
        .toEqual({ partFilled: true, rowFramed: false });
    });
  }
});

test.describe("report-2: the Overview waffle stays readable in forced-colors mode", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`flagged squares keep a fill and quiet ones an outline, ${colorScheme} forced colors`, async ({
      page,
    }) => {
      await report.gotoReport2(WALLABAG);
      await page.emulateMedia({ colorScheme, forcedColors: "active" });

      await expect
        .poll(() => report.summaryWaffleForcedColors())
        .toEqual({ flaggedDistinct: true, restOutlined: true });
    });
  }
});

test.describe("report-2: the score bars and the band ruler keep their marks in forced colours", () => {
  /** The forced palette's text colour, read off a probe, as the page's own text would compute. */
  const canvasText = (page: Page) =>
    page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
  const borders = (segments: Locator) =>
    segments.evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item);
        return {
          role: (item.getAttribute("class") ?? "").match(/is-(lead|corroborating|security)/)?.[1],
          style: style.borderTopStyle,
          color: style.borderTopColor,
        };
      }),
    );
  // composite symfony/monolog-bridge: left-behind 16 (lead), old-promise 4 (corroborating),
  // vulnerable 16 (security).
  const PKG = "symfony/monolog-bridge";
  const ROLES = [
    { role: "lead", style: "solid" },
    { role: "corroborating", style: "dashed" },
    { role: "security", style: "dotted" },
  ];

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the Findings bar: a CanvasText border by role, numbers left to paper, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      await page.goto(report2Url("composite") + "#view=findings");
      const row = findingsRow(page, PKG);
      const ink = await canvasText(page);
      const seen = await borders(row.locator(".sbar-seg"));
      expect(seen.map(({ role, style }) => ({ role, style }))).toEqual(ROLES);
      expect(seen.every(({ color }) => color === ink)).toBe(true);
      // 16 points is 8 blocks: labelled; 4 points is 2 blocks: not. The labels are for paper: on
      // screen the row's own score and its terms carry the numbers.
      await expect(row.locator(".sbar-n")).toHaveText(["16", "16"]);
      await expect(row.locator(".sbar-n").first()).toBeHidden();
      const tick = await row
        .locator(".sbar-tick")
        .first()
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(tick).toBe(ink);
    });

    test(`the Why bar, its legend swatches and the band ruler, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      const sheet = await openDetail2(page, "composite", PKG);
      const ink = await canvasText(page);
      const bar = await borders(sheet.locator(".d2-why-bar .sbar-seg"));
      expect(bar.map(({ role, style }) => ({ role, style }))).toEqual(ROLES);
      const swatches = await borders(sheet.locator(".d2-swatch"));
      expect(swatches.map(({ role, style }) => ({ role, style }))).toEqual(ROLES);
      expect([...bar, ...swatches].every(({ color }) => color === ink)).toBe(true);
      const ticks = await sheet
        .locator(".d2-ruler-tick:not(.is-start):not(.is-end)")
        .evaluateAll((items) => items.map((item) => getComputedStyle(item).borderLeftColor));
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.every((color) => color === ink)).toBe(true);
    });
  }

  test("the accepted pill keeps its dashed border and its word", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(report2Url("D-partial-dagger") + "#view=findings");
    const pill = page.locator('[data-surface="findings"] .fp.is-accepted').first();
    await expect(pill).toContainText("accepted");
    expect(await pill.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  });
});

// A spread of recorded cases: a lock with nothing flagged, a gate that fails, a baseline, an
// offline run and a large real lock.
const SWEEP = ["A", "B-offline-dagger", "D", "E", "G", "ok-unchecked", "baselined-wallabag-2.6", "unknown"];

test.describe("report-2: forced colours across recorded cases", () => {
  for (const name of SWEEP) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${name}, ${colorScheme}: the waffle and flag bar keep their marks`, async ({ page }) => {
        const problems: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") problems.push(`console: ${message.text()}`);
        });
        page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
        await report.gotoReport2(name);
        await page.emulateMedia({ colorScheme, forcedColors: "active" });

        const waffle = await report.summaryWaffle();
        if (waffle !== null && waffle.flagged > 0 && waffle.total > waffle.flagged) {
          await expect
            .poll(() => report.summaryWaffleForcedColors())
            .toEqual({ flaggedDistinct: true, restOutlined: true });
        }
        if ((await flagBars(page).count()) > 0) {
          await expect
            .poll(() =>
              flagBars(page)
                .first()
                .evaluate((el) => {
                  const part = el.querySelector(".legend-seg");
                  if (!(part instanceof HTMLElement)) throw new Error("flag bar has no grade part");
                  // A grade takes its tone's pattern in forced colors, so a fill is a colour or an image.
                  const style = getComputedStyle(part);
                  return (
                    (style.backgroundColor !== getComputedStyle(document.body).backgroundColor &&
                      style.backgroundColor !== "rgba(0, 0, 0, 0)") ||
                    style.backgroundImage !== "none"
                  );
                }),
            )
            .toBe(true);
        }
        expect(problems).toEqual([]);
      });
    }
  }
});
