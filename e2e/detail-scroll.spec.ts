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

/** fixtures/bundles/koel_koel.json's own tallest detail (PD-DETAIL-5): 21 release branches, one
 *  timeline lane apiece — far more than `spomky-labs/otphp`'s own two advisories give the panel. */
const KOEL_LONG_PACKAGE = "meilisearch/meilisearch-php";

const BREAKPOINTS = [
  { label: "1440×900 (side)", width: 1440, height: 900 },
  { label: "1024×900 (sheet)", width: 1024, height: 900 },
  { label: "390×844 (sheet)", width: 390, height: 844 },
] as const;

/** `is-side` (≥1181px) chains a wheel that has exhausted the panel's own scroll into the page
 *  (PD-DETAIL-5); `is-sheet` (below that) keeps `overscroll-behavior: contain`, since it is a
 *  full-screen overlay with the page's own scroll locked behind it (M13) and nothing to chain
 *  into — a wheel over it must never move a page a reader cannot see anyway. */
const SHEET_BREAKPOINTS = [
  { label: "1024×900 (sheet)", width: 1024, height: 900 },
  { label: "390×844 (sheet)", width: 390, height: 844 },
] as const;

/** The detail's own scroll container, found the same way regardless of `is-side`/`is-sheet` — a
 *  raw class selector is fine here (unlike `support/new.ts`): this file is written against this
 *  renderer's implementation, not the cross-renderer accessibility contract. */
function scrollContainer(page: Page) {
  return page.locator(".shell-detail");
}

async function openLongDetail(
  page: Page,
  fixture: (typeof FIXTURES)[keyof typeof FIXTURES] = FIXTURES.wallabag,
  pkg: string = LONG_PACKAGE,
): Promise<ReportPage> {
  const report = await createReportPage(page);
  await report.goto(fixture);
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

for (const { label, width, height } of SHEET_BREAKPOINTS) {
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

      // Scroll well past the end: `overscroll-behavior: contain` (`ui/app.css`, still on `is-sheet`)
      // keeps the wheel from chaining into the page (which is locked behind it, M13) once the
      // detail can scroll no further.
      await page.mouse.wheel(0, 5000);
      await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBe(scrollable);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });
}

test.describe("1440×900 (side): every part of the detail is reachable by wheel (PD-DETAIL-5)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const { name, fixture, pkg } of [
    { name: "wallabag_wallabag", fixture: FIXTURES.wallabag, pkg: LONG_PACKAGE },
    { name: "koel_koel", fixture: FIXTURES.koel, pkg: KOEL_LONG_PACKAGE },
  ] as const) {
    test(`${name}: wheeling over the detail from scroll 0 reaches its last section (Provenance)`, async ({
      page,
    }) => {
      await openLongDetail(page, fixture, pkg);
      const container = scrollContainer(page);
      await expect(container).toBeVisible();

      // Starts at the top of the page, not wherever opening the package happened to leave it —
      // the panel's own bottom rendering below the fold at scroll 0 is exactly the bug (DESIGN.md
      // §5/§8): `max-height` is measured against the panel's stuck position, but at scroll 0 it is
      // still at its normal in-flow one, further down the page, under the ledger.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const provenance = page.getByRole("heading", { name: "Provenance", level: 3 });
      await expect(provenance).toBeAttached();
      await expect(provenance).not.toBeInViewport();

      // A point inside the panel, close to its own top: internal scrolling never moves the panel's
      // own box, and paging the *document* only ever moves the box's top toward this point (never
      // past it — the sticky offset it settles into is well below the viewport's own top edge), so
      // one fixed mouse position stays over the panel for the whole gesture below, the same way a
      // reader's own mouse would sit still while their wheel does the work.
      const box = await container.boundingBox();
      if (box === null) throw new Error("detail panel has no box to hover");
      await page.mouse.move(box.x + box.width / 2, box.y + 24);

      // First exhausts the panel's own internal scroll (`overflow-y: auto`), then — with
      // `overscroll-behavior: contain` dropped from `is-side` — chains into the page, which is
      // what carries a sticky element from its in-flow position into its stuck one. A hard cap
      // instead of an unbounded loop: this is a wheel gesture, not a retry loop, so if it has not
      // reached the target by a generous multiple of the tallest measured panel's own overflow, the
      // fix is not working, not merely slow.
      //
      // `isVisible()` is not what this loop needs to poll: it is true for an element that is
      // rendered but scrolled out of view (exactly the starting state here), so the exit condition
      // has to read the viewport intersection `toBeInViewport()` checks, not plain visibility.
      const inViewport = () =>
        provenance.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
        });
      for (let i = 0; i < 25 && !(await inViewport()); i++) {
        await page.mouse.wheel(0, 400);
      }

      await expect(provenance).toBeInViewport();
    });
  }
});

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
