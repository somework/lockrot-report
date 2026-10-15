/**
 * `.shell-detail` (`ui/app.css`, is-side/is-sheet) is the one element that scrolls at every
 * breakpoint (PD-DETAIL-3).
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage } from "./support/report";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";

/** A recorded lock long enough that its list needs the page to scroll at every breakpoint here. */
const LONG_CASE = "baselined-wallabag-2.6";
/** A flagged package of that lock whose sheet is taller than the side column. */
const LONG_PACKAGE = "spomky-labs/otphp";
/** Longer than Firefox's wheel transaction (`mousewheel.transaction.timeout`, 1500ms by default). */
const WHEEL_TRANSACTION_MS = 1600;

const BREAKPOINTS = [
  { label: "1440×900 (side)", width: 1440, height: 900 },
  { label: "1024×900 (sheet)", width: 1024, height: 900 },
  { label: "390×844 (sheet)", width: 390, height: 844 },
] as const;

/** `is-side` (≥1181px) chains a wheel that has exhausted the panel's own scroll into the page
 *  (PD-DETAIL-5); `is-sheet` (below that) keeps `overscroll-behavior: contain`, since it is a
 *  full-screen overlay with the page's own scroll locked behind it (M13). */
const SHEET_BREAKPOINTS = [
  { label: "1024×900 (sheet)", width: 1024, height: 900 },
  { label: "390×844 (sheet)", width: 390, height: 844 },
] as const;

/** The detail's own scroll container, found the same way regardless of `is-side`/`is-sheet`. */
function scrollContainer(page: Page) {
  return page.locator(".shell-detail");
}

/**
 * `window.scrollY` right after hovering the target, not before: `Locator.hover()` scrolls the page
 * to bring an out-of-view element into view first, and that scroll is not what the assertions are about.
 */
async function scrollYAfterHover(page: Page, target: ReturnType<Page["locator"]>): Promise<number> {
  await target.hover();

  return page.evaluate(() => window.scrollY);
}

for (const { label, width, height } of BREAKPOINTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height } });

    test("wheel over the list scrolls the page normally, with no detail open", async ({ page }) => {
      const report = await createReportPage(page);
      await report.gotoReport2(LONG_CASE);
      // Nothing opens by itself at any width (PD-ROWS-9), so the list is all there is on load.
      expect((await report.detail()).open).toBe(false);

      const row = page.getByRole("listitem", { name: LONG_PACKAGE, exact: true });
      const before = await scrollYAfterHover(page, row);
      await page.mouse.wheel(0, 600);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    });
  });
}

test.describe("1440×900 (side): every part of the detail is reachable by wheel (PD-DETAIL-5)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test(`${LONG_CASE}: wheeling over the detail from scroll 0 reaches its last section (Provenance)`, async ({
    page,
  }) => {
    const report = await createReportPage(page);
    await openDetail2(page, LONG_CASE, LONG_PACKAGE);
    const container = scrollContainer(page);
    await expect(container).toBeVisible();

    // Starts at the top of the page: the panel's bottom rendering below the fold at scroll 0 is the
    // bug, because `max-height` is measured against the panel's stuck position.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const provenance = container.locator("summary", { hasText: "Provenance" });
    await expect(provenance).toBeAttached();
    await expect(provenance).not.toBeInViewport();

    // A point inside the panel, close to its own top: one fixed mouse position stays over the panel
    // for the whole gesture, the way a reader's own mouse sits still while the wheel does the work.
    const box = await container.boundingBox();
    if (box === null) throw new Error("detail panel has no box to hover");
    await page.mouse.move(box.x + box.width / 2, box.y + 24);

    // Clipped by the panel as well as the window: the panel's `max-height` shrinks by the footer's
    // height once the footer scrolls into view (`:root.footer-in-view`), which can push a heading
    // that was just visible back below the panel's own bottom edge.
    const inViewport = () =>
      provenance.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const panel = el.closest(".shell-detail")?.getBoundingClientRect();
        const bottom = Math.min(window.innerHeight, panel?.bottom ?? Infinity);
        const top = Math.max(0, panel?.top ?? 0);
        return r.top < bottom && r.bottom > top && r.left < window.innerWidth && r.right > 0;
      });
    // The wheel first exhausts the panel's own scroll, then chains into the page, where Chromium
    // keeps a brief momentum scroll going after the call returns. Each round pauses past Firefox's
    // wheel transaction, as a reader does, then wheels again. The caps bound the gesture: if it has
    // not arrived by then the fix is not working, not merely slow.
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 25 && !(await inViewport()); i++) {
        await page.mouse.wheel(0, 400);
      }
      await page.waitForTimeout(WHEEL_TRANSACTION_MS);
      if (await inViewport()) break;
    }

    await expect(provenance).toBeInViewport();

    // Once the page settles, the panel's sticky header must have resumed below the fixed one, not
    // slid in behind it.
    expect(await report.detailHeaderClearsTopbar()).toBe(true);

    // Only the page's real end proves the header clears the fixed one, not merely "far enough to
    // see Provenance".
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(250);
    expect(await report.detailHeaderClearsTopbar()).toBe(true);
  });
});

test.describe("report-2: the sheet scrolls alone", () => {
  for (const { label, width, height } of SHEET_BREAKPOINTS) {
    test.describe(label, () => {
      test.use({ viewport: { width, height } });

      test("wheel over B's sheet scrolls it alone, never the page", async ({ page }) => {
        await openDetail2(page, "B", "symfony/monolog-bridge");
        const container = scrollContainer(page);
        await expect(container).toBeVisible();
        const scrollable = await container.evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(scrollable).toBeGreaterThan(0);

        const before = await scrollYAfterHover(page, container);
        // Firefox spends one wheel event's delta in steps, so the gesture is a few events, capped.
        for (let i = 0; i < 10 && (await container.evaluate((el) => el.scrollTop)) < scrollable; i++) {
          await page.mouse.wheel(0, 1500);
          await page.waitForTimeout(150);
        }

        await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBe(scrollable);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
      });
    });
  }

  test.describe("1440×900 (side)", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("opening another composite row returns .shell-detail to the top", async ({ page }) => {
      await page.goto(`${report2Url("composite")}#pkg=${encodeURIComponent("symfony/monolog-bridge")}`);
      const container = scrollContainer(page);
      await container.hover();
      await page.mouse.wheel(0, 400);
      await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

      await page.getByRole("listitem", { name: "twig/twig", exact: true }).click();

      await expect(page.getByRole("complementary", { name: "twig/twig" })).toBeVisible();
      await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBe(0);
    });
  });
});
