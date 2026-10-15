/**
 * `.shell`'s grid (`ui/app.css`) reserves a third, `minmax(0, 420px)` column for the detail at wide
 * widths whether or not `.shell-detail` is actually mounted — a first-time-reader walk found the
 * All packages table at 1440px stopping well short of the viewport, its last column cut to
 * "tran…", with the space a closed detail would have used left empty beside it. `App.tsx`'s own
 * `no-detail` modifier is what this spec proves fixed: raw class selectors, not role/name queries,
 * since the question here is this implementation's own grid geometry, the same reasoning
 * `detail-scroll.spec.ts` gives for reaching into `.shell-detail` directly. The Findings list gets the
 * same check on load, where no package opens by itself (PD-ROWS-9).
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

const WIDE_BREAKPOINTS = [
  { label: "1440×900", width: 1440, height: 900 },
  { label: "1024×900", width: 1024, height: 900 },
] as const;

function shellLocator(page: Page) {
  return page.locator(".shell");
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
      await report.gotoReport2WithHash("composite", "view=findings");
      expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
      await report.tab("packages");
      expect((await report.detail()).open).toBe(false);

      const shellBox = await box(shellLocator(page));
      const tableBox = await box(tableWrapLocator(page));

      // Within `.shell`'s own right gutter padding (`--gutter`, 20px) of its edge, not stopping
      // ~420px further in with an empty reserved column between the table and that gutter.
      expect(shellBox.x + shellBox.width - (tableBox.x + tableBox.width)).toBeLessThan(30);
    });
  });
}

test.describe("Blast radius shares the same fix", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the ledger fills the shell's own width when no detail is open", async ({ page }) => {
    const report: ReportPage = await createReportPage(page);
    await report.gotoReport2WithHash("composite", "view=findings");
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
    await report.tab("radius");
    expect((await report.detail()).open).toBe(false);

    const shellBox = await box(shellLocator(page));
    const radiusBox = await box(page.locator('[data-surface="radius"]'));

    // Same allowance as the packages table above: `.shell`'s own right gutter padding, not a
    // reserved, empty detail column.
    expect(shellBox.x + shellBox.width - (radiusBox.x + radiusBox.width)).toBeLessThan(30);
  });
});

// PD-ROWS-9 (DESIGN.md §5/§8): a wide screen used to open the first flagged package on load, so the
// Findings list first met a reader squeezed beside a detail it had not asked for. Now nothing opens
// by itself: the list takes the shell's whole width, and closing a package the reader opened gives
// that width back.
for (const width of [1181, 1280, 1440, 1920]) {
  test.describe(`${width}×900, Findings on load (PD-ROWS-9)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("the list fills the shell with nothing open; a row opens beside it and Close gives the width back", async ({
      page,
    }) => {
      const report: ReportPage = await createReportPage(page);
      await report.gotoReport2WithHash("composite", "view=findings");
      expect((await report.detail()).open).toBe(false);
      expect(await report.hash()).toBe("#view=findings");

      const list = page.locator('[data-surface="findings"]');
      const shellBox = await box(shellLocator(page));
      const atLoad = await box(list);
      expect(shellBox.x + shellBox.width - (atLoad.x + atLoad.width)).toBeLessThan(30);

      await report.openPackage("twig/twig");
      const detailBox = await box(page.locator(".shell-detail"));
      const beside = await box(list);
      expect(beside.x + beside.width).toBeLessThanOrEqual(detailBox.x);
      expect(beside.width).toBeLessThan(atLoad.width - 300);

      await report.closeDetail();
      expect((await report.detail()).open).toBe(false);
      expect((await box(list)).width).toBe(atLoad.width);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("data-pkg"))).toBe("twig/twig");
    });
  });
}

test.describe("report-2, 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the table fills the shell with nothing open, and sits beside an open package", async ({ page }) => {
    const report: ReportPage = await createReportPage(page);
    await report.gotoReport2WithHash("composite", "view=packages");

    const shellBox = await box(shellLocator(page));
    expect(
      shellBox.x +
        shellBox.width -
        ((await box(tableWrapLocator(page))).x + (await box(tableWrapLocator(page))).width),
    ).toBeLessThan(30);

    await report.openPackage("symfony/debug");
    const tableBox = await box(tableWrapLocator(page));
    const detailBox = await box(page.locator(".shell-detail"));
    expect(shellBox.x + shellBox.width - (tableBox.x + tableBox.width)).toBeGreaterThan(300);
    expect(detailBox.x - (tableBox.x + tableBox.width)).toBeLessThan(40);
  });
});
