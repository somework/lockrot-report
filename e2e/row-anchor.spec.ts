/**
 * PD-ROWS-10 (DESIGN.md §5): the row a reader acts on stays where they saw it. Since nothing opens by
 * itself (PD-ROWS-9), the first open on a wide screen switches the Findings list from one line a row
 * to two (PD-ROWS-4), and every row above the clicked one grows: a row thirty down slid 350-400px,
 * off the screen, on the click that opened it. The question is this implementation's own geometry:
 * the spec reads each row's box through the page object (`rowGeometry`), which finds the row by
 * role and package name, and which row has focus through its `data-pkg`.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage, type RowGeometry } from "./support/report";
import { FIXTURES } from "./support/pages";

/** The wallabag list's 31st row: deep enough that thirty rows above it reflow. */
const DEEP_ROW = 30;

/** The name of the list's row at `index`, in document order. */
async function rowAt(report: ReportPage, index: number): Promise<string> {
  const pkg = await report.rowNameAt(index);
  if (pkg === null) throw new Error(`no row ${index}`);

  return pkg;
}

function place(report: ReportPage, pkg: string): Promise<RowGeometry> {
  return report.rowGeometry(pkg);
}

async function focusedPkg(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-pkg") ?? null);
}

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const) {
  test.describe(`${width}×${height}`, () => {
    test.use({ viewport: { width, height } });

    test("a row clicked deep in the list stays put as the detail opens beside it, and again as Escape closes it", async ({
      page,
    }) => {
      const report = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);
      const pkg = await rowAt(report, DEEP_ROW);
      await report.centerRow(pkg);
      const before = await place(report, pkg);

      await report.clickPackage(pkg);
      expect((await report.detail()).name).toBe(pkg);
      const open = await place(report, pkg);
      expect(open.inView).toBe(true);
      expect(Math.abs(open.top - before.top)).toBeLessThanOrEqual(2);

      // Escape, not the Close button: a pointer click on Close first scrolls the button into view,
      // which moves the page by itself before the page's own code runs.
      await report.pressEscape();
      expect((await report.detail()).open).toBe(false);
      const closed = await place(report, pkg);
      expect(Math.abs(closed.top - before.top)).toBeLessThanOrEqual(2);
      expect(await focusedPkg(page)).toBe(pkg);
    });
  });
}

test.describe("1440×900 keyboard and links", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("j opens the first row and puts focus on it, not only once Escape closes it", async ({ page }) => {
    const report = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);
    const first = await rowAt(report, 0);

    await report.pressJ();

    expect((await report.detail()).name).toBe(first);
    expect(await focusedPkg(page)).toBe(first);
    await report.pressJ();
    expect(await focusedPkg(page)).toBe(await rowAt(report, 1));
  });

  // PD-ROWS-11: a row `j` walks to past the screen's bottom edge is brought into view by the least
  // scroll that shows it — glided by default, and at once for a reader who asked for less motion.
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    test(`j walked past the screen's edge keeps the focused row on screen (${reducedMotion} motion)`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      const report = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);

      for (let i = 0; i < DEEP_ROW; i++) await report.pressJ();
      const pkg = await rowAt(report, DEEP_ROW - 1);
      expect(await focusedPkg(page)).toBe(pkg);
      if (reducedMotion === "reduce") {
        expect((await place(report, pkg)).inView).toBe(true);
      } else {
        await expect.poll(async () => (await place(report, pkg)).inView).toBe(true);
      }
      // `nearest`, not `start` or `center`: the row lands at the bottom edge, not scrolled to the top.
      await expect.poll(async () => (await place(report, pkg)).top).toBeGreaterThan(900 / 2);
    });
  }

  // PD-SEARCH-1 polish item 8: `html`'s `scroll-padding-bottom` (app.css) keeps the same clearance
  // at the bottom edge that `scroll-padding-top` already keeps at the top, so a row `j` walks to
  // does not land flush against the viewport's own bottom edge with nothing of the list below it.
  test("j walked past the screen's edge leaves a little clearance below the focused row", async ({
    page,
  }) => {
    const report = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);

    for (let i = 0; i < DEEP_ROW; i++) await report.pressJ();
    const pkg = await rowAt(report, DEEP_ROW - 1);
    await expect.poll(async () => (await place(report, pkg)).inView).toBe(true);

    // Polled: the last `j` opens the detail beside the list, and the rows it narrows can still be
    // settling for a frame or two after the row first reads as in view (seen in Firefox under load).
    await expect.poll(async () => (await place(report, pkg)).clearance).toBeGreaterThan(20);
  });

  test("a #pkg= link scrolls its row into view on load, so Close hands focus to a row on screen", async ({
    page,
  }) => {
    const report = await createReportPage(page);
    // spomky-labs/otphp sits about 2900px down wallabag's list.
    await report.gotoWithHash(FIXTURES.wallabag, "view=findings&pkg=spomky-labs%2Fotphp");
    expect((await report.detail()).name).toBe("spomky-labs/otphp");
    expect((await place(report, "spomky-labs/otphp")).inView).toBe(true);

    await report.pressEscape();
    expect(await focusedPkg(page)).toBe("spomky-labs/otphp");
    expect((await place(report, "spomky-labs/otphp")).inView).toBe(true);
  });
});
