/**
 * `.shell-detail` (`ui/app.css`, is-side/is-sheet) is the one element that scrolls at every
 * breakpoint (PD-DETAIL-3; DESIGN.md §8 named the 196px guess in `.detail` the bug).
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/** fixtures/bundles/wallabag_wallabag.json: two advisories plus two signals — the fix ladder, the
 *  advisory list, the signal rows and the three reference sections make the panel taller than the
 *  scroll container at every breakpoint this spec checks (measured: ~380px of overflow at 1440,
 *  ~110px at 1024, ~340px at 390 — 1024's sheet has the least headroom, being the full viewport). */
const LONG_PACKAGE = "spomky-labs/otphp";
/** The first (alphabetically earliest, critical) flagged package — DESIGN.md §8's boot-time pick
 *  on a wide screen, so it is always present to switch to without depending on scroll position. */
const OTHER_PACKAGE = "sensio/framework-extra-bundle";

const BREAKPOINTS = [
  { label: "1440×900 (side)", width: 1440, height: 900 },
  { label: "1024×900 (sheet)", width: 1024, height: 900 },
  { label: "390×844 (sheet)", width: 390, height: 844 },
] as const;

/** The detail's own scroll container, found the same way regardless of `is-side`/`is-sheet` — a
 *  raw class selector is fine here (unlike `support/new.ts`): this file is written against this
 *  renderer's implementation, not the cross-renderer accessibility contract. */
function scrollContainer(page: Page) {
  return page.locator(".shell-detail");
}

async function openLongDetail(page: Page, pkg: string = LONG_PACKAGE): Promise<ReportPage> {
  const report = await createReportPage(page);
  await report.goto(FIXTURES.wallabag);
  await report.openPackage(pkg);

  return report;
}

/** DESIGN.md §5 auto-opens the first flagged package on a wide screen; a "no detail open" case has
 *  to close it first there, and is a no-op everywhere narrower (nothing is auto-opened). */
async function ensureDetailClosed(report: ReportPage): Promise<void> {
  if ((await report.detail()).open) await report.closeDetail();
}

/**
 * `window.scrollY` right after hovering the target, not before: `Locator.hover()` scrolls the page
 * to bring an out-of-view element into view first (both `.shell-detail` and a list row far down a
 * 69-package list can start that way), and that scroll is not what either assertion below is about.
 */
async function scrollYAfterHover(page: Page, target: ReturnType<Page["locator"]>): Promise<number> {
  await target.hover();

  return page.evaluate(() => window.scrollY);
}

for (const { label, width, height } of BREAKPOINTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    test("wheel over the detail scrolls it alone, never the page", async ({ page }) => {
      await openLongDetail(page);
      const container = scrollContainer(page);
      await expect(container).toBeVisible();

      // Exactly one scrollable ancestor: `.detail` only lays out its children now (DESIGN.md §8);
      // `.shell-detail` is the one that owns the geometry and the scrollbar. Two `overflow-y: auto`
      // boxes stacked on top of each other is the double-scrollbar bug this fixes.
      const detailOverflow = await page.locator(".detail").evaluate((el) => getComputedStyle(el).overflowY);
      expect(["auto", "scroll"]).not.toContain(detailOverflow);
      expect(await container.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");

      const scrollable = await container.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(scrollable).toBeGreaterThan(0); // the fixture package is tall enough to need it

      const before = await scrollYAfterHover(page, container);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);

      // Scroll well past the end: `overscroll-behavior: contain` (`ui/app.css`, pre-existing on
      // both `.shell-detail` variants) keeps the wheel from chaining into the page once the detail
      // can scroll no further.
      await page.mouse.wheel(0, 5000);
      await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBe(scrollable);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });

    test("wheel over the list scrolls the page normally, with no detail open", async ({ page }) => {
      const report = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);
      await ensureDetailClosed(report);

      const row = page.getByRole("listitem", { name: LONG_PACKAGE, exact: true });
      const before = await scrollYAfterHover(page, row);
      await page.mouse.wheel(0, 600);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    });
  });
}

test.describe("switching the open package resets the detail's scroll", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("opening a different package returns .shell-detail to the top", async ({ page }) => {
    const report = await openLongDetail(page);
    const container = scrollContainer(page);
    await container.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    // A direct click on another row (`FindingRow`'s `rowInteractions`) switches `state.pkg` without
    // closing the panel first — `.shell-detail` stays mounted, so only the reset effect in `App.tsx`
    // stands between this and the old package's scroll position carrying over.
    await report.openPackage(OTHER_PACKAGE);
    expect(await container.evaluate((el) => el.scrollTop)).toBe(0);
  });
});
