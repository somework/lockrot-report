/**
 * `.shell`'s grid (`ui/app.css`) reserves a third, `minmax(0, 420px)` column for the detail at wide
 * widths whether or not `.shell-detail` is actually mounted — a first-time-reader walk found the
 * All packages table at 1440px stopping well short of the viewport, its last column cut to
 * "tran…", with the space a closed detail would have used left empty beside it. `App.tsx`'s own
 * `no-detail` modifier is what this spec proves fixed: raw class selectors, not role/name queries,
 * since the question here is this implementation's own grid geometry, the same reasoning
 * `detail-scroll.spec.ts` gives for reaching into `.shell-detail` directly. The Findings list gets the
 * same check on load, where no package opens by itself any more (PD-ROWS-9).
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

const WIDE_BREAKPOINTS = [
  { label: "1440×900", width: 1440, height: 900 },
  { label: "1024×900", width: 1024, height: 900 },
] as const;

function shellLocator(page: Page) {
  return page.locator("main.shell");
}

function tableWrapLocator(page: Page) {
  return page.locator(".tablewrap");
}

async function box(locator: ReturnType<Page["locator"]>) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error("expected element to have a layout box");
  return rect;
}

for (const { label, width, height } of WIDE_BREAKPOINTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    test("the table fills the shell's own width when no detail is open", async ({ page }) => {
      const report: ReportPage = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);
      expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
      await report.tab("packages");
      expect((await report.detail()).open).toBe(false);

      const shellBox = await box(shellLocator(page));
      const tableBox = await box(tableWrapLocator(page));

      // Within `.shell`'s own right gutter padding (`--gutter`, 20px) of its edge — not stopping
      // ~420px further in, with an empty reserved column between the table and that gutter, which
      // is what the walk found.
      expect(shellBox.x + shellBox.width - (tableBox.x + tableBox.width)).toBeLessThan(30);
    });
  });
}

// Only ≥1181px lays the detail out as a grid column beside the list at all (DESIGN.md §8); at
// 1024px it opens as a full-screen sheet over everything, so there is no "beside the detail" to
// check there — the grid there was already two columns regardless of the detail, before this fix.
test.describe("1440×900, a package open", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the table sits beside the detail column, not overlapping it or leaving an unexplained gap", async ({
    page,
  }) => {
    const report: ReportPage = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);
    await report.tab("packages");
    await report.openPackage("sensio/framework-extra-bundle");

    const shellBox = await box(shellLocator(page));
    const tableBox = await box(tableWrapLocator(page));
    const detailBox = await box(page.locator(".shell-detail"));

    // The table now stops well short of the shell's own edge — the open detail's column, not
    // empty space, accounts for the difference.
    expect(shellBox.x + shellBox.width - (tableBox.x + tableBox.width)).toBeGreaterThan(300);
    // The gap between the table and the detail is the grid's own 20px column gap (`.shell`), not
    // the ~460px of dead space the walk found between a shorter table and a detail column that
    // was reserved but, at the time, unused.
    expect(detailBox.x - (tableBox.x + tableBox.width)).toBeLessThan(40);
    expect(detailBox.width).toBeGreaterThan(300);
  });
});

test.describe("Blast radius shares the same fix", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the cards grid fills the shell's own width when no detail is open", async ({ page }) => {
    const report: ReportPage = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
    await report.tab("radius");
    expect((await report.detail()).open).toBe(false);

    const shellBox = await box(shellLocator(page));
    const cardsBox = await box(page.locator(".cards"));

    // Same allowance as the packages table above: `.shell`'s own right gutter padding, not a
    // reserved, empty detail column.
    expect(shellBox.x + shellBox.width - (cardsBox.x + cardsBox.width)).toBeLessThan(30);
  });
});

// PD-ROWS-9 (DESIGN.md §5/§8): a wide screen used to open the first flagged package on load, so the
// Findings list first met a reader squeezed beside a detail it had not asked for, two lines a row.
// Now nothing opens by itself: the list takes the shell's whole width (one 36px line a row once it
// has 990px, from 1440 up), and closing a package the reader opened gives that width back.
const FINDINGS_WIDE = [
  { width: 1181, oneLine: false },
  { width: 1280, oneLine: false },
  { width: 1440, oneLine: true },
  { width: 1920, oneLine: true },
] as const;

for (const { width, oneLine } of FINDINGS_WIDE) {
  test.describe(`${width}×900, Findings on load (PD-ROWS-9)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("the list fills the shell with nothing open; a row opens beside it and Close gives the width back", async ({
      page,
    }) => {
      const report: ReportPage = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);
      expect((await report.detail()).open).toBe(false);
      expect(await report.hash()).toBe("");

      // The first group's list: every group's `.frows` shares the one list column.
      const list = page.locator(".frows").first();
      const shellBox = await box(shellLocator(page));
      const atLoad = await box(list);
      expect(shellBox.x + shellBox.width - (atLoad.x + atLoad.width)).toBeLessThan(30);
      if (oneLine) {
        const heights = await page
          .locator(".frow")
          .evaluateAll((rows) => rows.slice(0, 12).map((row) => row.getBoundingClientRect().height));
        expect(Math.max(...heights)).toBeLessThanOrEqual(40);
      }

      await report.openPackage("javibravo/simpleue");
      const detailBox = await box(page.locator(".shell-detail"));
      const beside = await box(list);
      expect(beside.x + beside.width).toBeLessThanOrEqual(detailBox.x);
      expect(beside.width).toBeLessThan(atLoad.width - 300);

      await report.closeDetail();
      expect((await report.detail()).open).toBe(false);
      expect((await box(list)).width).toBe(atLoad.width);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("data-pkg"))).toBe(
        "javibravo/simpleue",
      );
    });
  });
}
