/**
 * PD-ROWS-10 (DESIGN.md §5): the row a reader acts on stays where they saw it. Since nothing opens by
 * itself (PD-ROWS-9), the first open on a wide screen switches the Findings list from one line a row
 * to two (PD-ROWS-4), and every row above the clicked one grows: a row thirty down slid 350-400px,
 * off the screen, on the click that opened it. The question is this implementation's own geometry,
 * so this spec reads row boxes through `[data-pkg]` directly, as `detail-scroll.spec.ts` and
 * `packages-table-width.spec.ts` read theirs.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/** The wallabag list's 31st row: deep enough that thirty rows above it reflow. */
const DEEP_ROW = 30;

async function rowAt(page: Page, index: number): Promise<string> {
  const pkg = await page.locator(".frow").nth(index).getAttribute("data-pkg");
  if (pkg === null) throw new Error(`row ${index} has no data-pkg`);

  return pkg;
}

/** The row's viewport top, and whether all of it is on screen. */
async function place(page: Page, pkg: string): Promise<{ top: number; inView: boolean }> {
  return page.evaluate((name) => {
    const row = [...document.querySelectorAll(".frow")].find(
      (node) => node.getAttribute("data-pkg") === name,
    );
    if (row === undefined) throw new Error(`no row for ${name}`);
    const rect = row.getBoundingClientRect();

    return { top: rect.top, inView: rect.top >= 0 && rect.bottom <= innerHeight };
  }, pkg);
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
      const pkg = await rowAt(page, DEEP_ROW);
      await page
        .locator(".frow")
        .nth(DEEP_ROW)
        .evaluate((row) => {
          row.scrollIntoView({ block: "center" });
        });
      const before = await place(page, pkg);

      await page.locator(".frow").nth(DEEP_ROW).click();
      expect((await report.detail()).name).toBe(pkg);
      const open = await place(page, pkg);
      expect(open.inView).toBe(true);
      expect(Math.abs(open.top - before.top)).toBeLessThanOrEqual(2);

      // Escape, not the Close button: a pointer click on Close first scrolls the button into view,
      // which moves the page by itself before the page's own code runs.
      await report.pressEscape();
      expect((await report.detail()).open).toBe(false);
      const closed = await place(page, pkg);
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
    const first = await rowAt(page, 0);

    await report.pressJ();

    expect((await report.detail()).name).toBe(first);
    expect(await focusedPkg(page)).toBe(first);
    await report.pressJ();
    expect(await focusedPkg(page)).toBe(await rowAt(page, 1));
  });

  test("a #pkg= link scrolls its row into view on load, so Close hands focus to a row on screen", async ({
    page,
  }) => {
    const report = await createReportPage(page);
    // spomky-labs/otphp sits about 2900px down wallabag's list.
    await report.gotoWithHash(FIXTURES.wallabag, "view=findings&pkg=spomky-labs%2Fotphp");
    expect((await report.detail()).name).toBe("spomky-labs/otphp");
    expect((await place(page, "spomky-labs/otphp")).inView).toBe(true);

    await report.pressEscape();
    expect(await focusedPkg(page)).toBe("spomky-labs/otphp");
    expect((await place(page, "spomky-labs/otphp")).inView).toBe(true);
  });
});
