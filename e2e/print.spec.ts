import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Url } from "./support/pages";
import { flagBars } from "./support/report2/overview";

/**
 * Print (print.css, print/PrintDocument.tsx): the stylesheet hides the app chrome, and while the
 * page prints (`beforeprint`, or a print medium, which is what `emulateMedia` gives) the printed
 * report replaces the open tab: one document in sections whatever tab was open.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.gotoReport2("composite");
});

test("screen media shows the tab bar", async () => {
  expect(await report.isNavigationVisible()).toBe(true);
});

test("print media hides the tab bar and the rest of the interactive chrome with it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
});

test("switching back to screen media restores it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
  await page.emulateMedia({ media: "screen" });
  expect(await report.isNavigationVisible()).toBe(true);
});

// Colour that carries meaning must survive an actual print, not just a screen render: Chromium drops
// background colour on print unless a rule opts out with `print-color-adjust: exact`. A screenshot
// never exercises that default, so these assert on the computed property and value directly.
test("print keeps the flag bar segments' colour, unlike Chromium's ink-saving print default", async ({
  page,
}) => {
  const segment = flagBars(page).first().locator(".legend-seg").first();
  const read = () =>
    segment.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        printColorAdjust:
          style.getPropertyValue("-webkit-print-color-adjust") ||
          style.getPropertyValue("print-color-adjust"),
      };
    });
  const before = await read();

  await page.emulateMedia({ media: "print" });
  const after = await read();

  // The colour itself is unchanged from screen to print...
  expect(after.backgroundColor).toBe(before.backgroundColor);
  expect(after.backgroundColor).not.toBe("");
  expect(after.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  // ...because the rule that keeps it there is in force.
  expect(after.printColorAdjust).toBe("exact");
});

// PD-PRINT-1: one printed document in sections, whatever tab is open.
const SECTIONS = ["1 Summary", "2 Findings", "3 Advisories", "4 Blast radius", "5 Run data"];

async function printedSections(page: Page): Promise<string[]> {
  const titles = await page.getByRole("heading", { level: 2 }).filter({ hasText: /^\d/ }).allInnerTexts();
  return titles.map((t) => t.replace(/\s+/g, " ").trim());
}

test("the header offers Print / PDF and Copy summary on screen, and neither prints", async ({ page }) => {
  const print = page.getByRole("button", { name: "Print / PDF" });
  const copy = page.getByRole("button", { name: "Copy summary" });
  await expect(print).toBeVisible();
  await expect(copy).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(print).toBeHidden();
  await expect(copy).toBeHidden();
});

test("print media prints the report in sections, whatever tab is open, and screen gets the tab back", async ({
  page,
}) => {
  await report.gotoReport2WithHash("composite", "view=radius");

  await page.emulateMedia({ media: "print" });

  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
  await expect(page.getByText("Printed from the Blast radius tab.")).toBeVisible();
  await expect(page.getByText("All packages is left out; print from that tab to include it.")).toBeVisible();
  // The overview band prints even from a tab whose screen had none (Run data hides it).
  await expect(page.locator('.pd [data-surface="overview"]')).toHaveCount(1);

  await page.emulateMedia({ media: "screen" });
  expect(await printedSections(page)).toEqual([]);
  expect(await report.isNavigationVisible()).toBe(true);
});

test("printing from All packages adds it as the last section and says why", async ({ page }) => {
  await report.gotoReport2WithHash("composite", "view=packages");

  await page.emulateMedia({ media: "print" });

  await expect.poll(() => printedSections(page)).toEqual([...SECTIONS, "6 All packages"]);
  await expect(page.getByText(/Printed because the page was open on All packages/)).toBeVisible();
});

test("the printed Blast radius opens every row's packages", async ({ page }) => {
  await report.gotoReport2WithHash("composite", "view=radius");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  // symfony/polyfill-intl-idn is listed under guzzlehttp/guzzle's row, closed on screen.
  await expect(
    page.locator('.pd [data-surface="radius"] li[data-pkg="symfony/polyfill-intl-idn"]'),
  ).toBeVisible();
});

test("print opens every fold and prints affected_versions in full", async ({ page }) => {
  await report.gotoReport2WithHash("composite", "view=run");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  await expect(page.locator(".pd details:not([open])")).toHaveCount(0);
  await expect(page.locator(".pd .run2-rule").first()).toBeVisible();
  const clamps = await page
    .locator(".pd .ac2-range")
    .evaluateAll((cells) => cells.filter((cell) => cell.scrollHeight > cell.clientHeight + 1).length);
  expect(clamps).toBe(0);
});

test("the printed weights table fits the page width", async ({ page }) => {
  // A4's printable width: 210mm less 2 x 13mm margins at 96 dpi.
  await page.setViewportSize({ width: 696, height: 1000 });
  await report.gotoReport2("composite");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const wrap = page.locator(".pd .run2-table-wrap").first();
  const sizes = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
});

test("with a sheet open, print prints that package's sheet, its folds open", async ({ page }) => {
  await report.gotoReport2WithHash("composite", "view=findings&pkg=twig%2Ftwig");
  await expect(page.locator('main [data-surface="detail"]')).toBeVisible();

  await page.emulateMedia({ media: "print" });

  const sheet = page.locator('.pd [data-surface="detail"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2, name: "twig/twig" })).toBeVisible();
  await expect(page.getByText("Printed from the sheet of twig/twig.", { exact: false })).toBeVisible();
  expect(await printedSections(page)).toEqual([]);
  await expect(sheet.locator("details:not([open])")).toHaveCount(0);
  await expect(sheet.locator('.l1-btn[aria-expanded="false"]')).toHaveCount(0);

  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".pd")).toHaveCount(0);
  await expect(page.locator('main [data-surface="detail"]')).toBeVisible();
});

test("the overview band carries the production rollup on screen and on paper", async ({ page }) => {
  const rollup = "all 7 in production · 6 required directly, 1 pulled in";
  await expect(page.getByText(rollup, { exact: true })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  // The screen's band is still in the DOM, hidden under the printed one.
  await expect(page.getByText(rollup, { exact: true }).filter({ visible: true })).toHaveCount(1);
});

test("a PDF of the page is the sectioned report, numbered, and leaves the screen as it was", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "page.pdf() is Chromium-only");
  await report.gotoReport2WithHash("composite", "view=advisories");
  await page.evaluate(() => {
    const host = document.querySelector(".print-doc");
    const seen: number[] = [];
    (window as unknown as { printKids: number[] }).printKids = seen;
    // App registered its listener first, so by the time this runs the report is in place.
    window.addEventListener("beforeprint", () => {
      seen.push(host?.childElementCount ?? -1);
    });
  });

  const pdf = await page.pdf({ format: "A4" });

  expect(await page.evaluate(() => (window as unknown as { printKids: number[] }).printKids)).toEqual([1]);
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  // Back on screen: the print is gone and the reader's tab is untouched.
  expect(await page.evaluate(() => document.querySelector(".print-doc")?.childElementCount)).toBe(0);
  await expect(page.getByRole("tab", { name: /Advisories/ })).toHaveAttribute("aria-selected", "true");
});

test("printing from the dark theme prints dark ink on white", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await report.gotoReport2("composite");

  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const ink = await page
    .getByRole("heading", { name: /Summary/ })
    .evaluate((el) => getComputedStyle(el).color);
  // --ink's light value, #0f1a19.
  expect(ink).toBe("rgb(15, 26, 25)");
});

test("printed All packages heads are words, so the repeated head on a continuation page is not blank", async ({
  page,
}) => {
  await report.gotoReport2WithHash("composite", "view=packages");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual([...SECTIONS, "6 All packages"]);

  await expect(page.locator(".pd-packages thead th")).toHaveText([
    /^package/i,
    /^version/i,
    /^libyears/i,
    /^age/i,
    /^verdict/i,
    /^score/i,
    /^flags/i,
    /^reached/i,
    /^signals/i,
    /^data as of/i,
  ]);
  await expect(page.locator(".pd-packages thead button")).toHaveCount(0);
});

// The scale that repeats over each printed Findings group reads as a scale: its ticks keep apart and
// in order, at A4's printable width (210mm less 2 x 13mm margins at 96 dpi).
test("the printed Findings scale keeps its tick captions apart", async ({ page }) => {
  await page.setViewportSize({ width: 696, height: 1000 });
  await report.gotoReport2("composite");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const ticks = page.locator(".pd-findings .fgroup").first().locator(".f2-print-scale .f2-head-tick");
  const boxes = await ticks.evaluateAll((items) =>
    items.map((item) => {
      const { left, right } = item.getBoundingClientRect();
      return { left, right };
    }),
  );

  expect(boxes).toHaveLength(4);
  boxes.slice(1).forEach((box, index) => {
    expect(box.left).toBeGreaterThanOrEqual((boxes[index]?.right ?? 0) + 2);
  });
});

test.describe("report-2: the printed report reads the report-2 model", () => {
  const MONOLOG = "symfony/monolog-bridge";

  test("every section prints its report-2 surface, whatever tab is open", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=radius");
    await page.emulateMedia({ media: "print" });
    await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
    for (const surface of ["overview", "findings", "advisories", "radius", "run"]) {
      await expect(page.locator(`.pd [data-surface="${surface}"]`)).toHaveCount(1);
    }
    await expect(page.locator(".pd .pd-lede").first()).toHaveText(
      "7 flagged packages, by grade, each with every flag that fired.",
    );
  });

  test("printed from Overview, the summary prints once, with the grade line and Weighs most as text", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));
    await page.emulateMedia({ media: "print" });
    await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

    await expect(page.locator('[data-surface="overview"]').filter({ visible: true })).toHaveCount(1);
    await expect(page.locator(".pd .ov-grade")).toHaveText(
      "Project grade: critical · 3 critical findings · 5 of 7 packages high or worse",
    );
    await expect(page.locator(".pd .ov-figure")).toHaveText("7 of 7 packages flagged · 0 ok · 0 allowlisted");
    await expect(page.locator(".pd .wm-load")).toHaveText(
      "144 points on 7 flagged packages · 140 (97 %) from high or worse · score model 1",
    );
    await expect(page.locator(".pd .wm-list > li .wm-text")).toHaveCount(7);
    await expect(page.locator(".pd .wm-seg").first()).toHaveCSS("border-top-style", "solid");
    await expect(page.locator(".pd .f2-strip")).toHaveCount(0);
  });

  test("the bar keeps its colours and prints the number of a segment of 6 blocks or more", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));
    await page.emulateMedia({ media: "print" });
    await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
    const row = page.locator(`.pd [data-surface="findings"] li[data-pkg="${MONOLOG}"]`);
    const adjust = await row
      .locator(".sbar-seg")
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).printColorAdjust));
    expect(adjust).toEqual(["exact", "exact", "exact"]);
    // left-behind 16 and vulnerable 16 are 8 blocks each; old-promise 4 is 2.
    await expect(row.locator(".sbar-n")).toHaveText(["16", "16"]);
    await expect(row.locator(".sbar-n").first()).toBeVisible();
  });

  test("the score scale repeats over each printed Findings group", async ({ page }) => {
    await page.goto(report2Url("composite"));
    await page.emulateMedia({ media: "print" });
    const groups = page.locator('.pd [data-surface="findings"] .fgroup');
    // composite grades: critical, high and low.
    await expect(groups).toHaveCount(3);
    await expect(groups.locator(".f2-print-scale")).toHaveCount(3);
    await expect(groups.first().locator(".f2-print-scale .f2-head-tick")).toHaveText(["0", "8", "16", "32"]);
    await page.emulateMedia({ media: "screen" });
    await expect(page.locator(".f2-print-scale")).toHaveCount(0);
  });

  test("the Why bar's ruler keeps its tones on paper", async ({ page }) => {
    await page.goto(`${report2Url("composite")}#pkg=${encodeURIComponent(MONOLOG)}`);
    await expect(page.locator('main [data-surface="detail"] .d2-ruler')).toBeVisible();
    await page.emulateMedia({ media: "print" });
    // With a sheet open, the printed document is that sheet.
    const ruler = page.locator('.pd [data-surface="detail"] .d2-ruler');
    await expect(ruler).toBeVisible();
    expect(await ruler.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe("exact");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the hatch's two tones stay apart in greyscale, from the theme's tokens, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(report2Url("composite") + "#view=findings");
      const seg = page.locator(
        `[data-surface="findings"] li[data-pkg="${MONOLOG}"] .sbar-seg.is-corroborating`,
      );
      const [tone, soft] = await seg.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.getPropertyValue("--tone"), style.getPropertyValue("--tone-soft")];
      });
      const lightness = (color: string): Promise<number> =>
        page.evaluate((c) => {
          const canvas = document.createElement("canvas").getContext("2d");
          if (canvas === null) return -1;
          canvas.fillStyle = c;
          canvas.fillRect(0, 0, 1, 1);
          const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        }, color);
      expect(Math.abs((await lightness(tone)) - (await lightness(soft)))).toBeGreaterThan(0.25);
    });
  }

  test("the tone tokens differ between the themes", async ({ page }) => {
    const toneIn = async (colorScheme: "light" | "dark") => {
      await page.emulateMedia({ colorScheme });
      await page.goto(report2Url("composite") + "#view=findings");
      return page
        .locator(`[data-surface="findings"] li[data-pkg="${MONOLOG}"] .sbar-seg.is-lead`)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    };
    expect(await toneIn("light")).not.toBe(await toneIn("dark"));
  });
});

// A spread of recorded cases: a lock with nothing flagged, a gate that fails, a baseline, an
// offline run and a large real lock.
const SWEEP = ["A", "B-offline-dagger", "D", "E", "G", "ok-unchecked", "baselined-wallabag-2.6", "unknown"];

test.describe("report-2: print across recorded cases", () => {
  for (const name of SWEEP) {
    test(`${name}: the chrome hides, every section prints, the tones survive`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      await page.goto(report2Url(name));
      const bar = flagBars(page).first().locator(".legend-seg").first();
      const before =
        (await bar.count()) > 0 ? await bar.evaluate((el) => getComputedStyle(el).backgroundColor) : null;

      await page.emulateMedia({ media: "print" });
      await expect(page.getByRole("tab", { name: /^Findings/ })).toBeHidden();
      await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
      if (before !== null) {
        expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
        expect(await bar.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe("exact");
      }

      await page.emulateMedia({ media: "screen" });
      await expect(page.getByRole("tab", { name: /^Findings/ })).toBeVisible();
      expect(problems).toEqual([]);
    });
  }
});
