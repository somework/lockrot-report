/**
 * PD-TABS-1 (DESIGN.md §5): the tab row at phone widths. wallabag_wallabag's five labels with their
 * real badge counts take 582px, so from 320px to 390px "Blast radius" was cut mid-word and
 * "Run data" sat off-screen with nothing to say either was there. The row now fades out on the side
 * with tabs out of sight, under a chevron that scrolls it, and scrolls the selected tab into full
 * view on load and on every switch — without adding a Tab stop or touching the arrow-key roving.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

const NARROW = [320, 360, 390] as const;
const WIDE = [768, 1024, 1440, 1920] as const;
/** More chevron clicks than the widest overflow could ever need: a hard cap, not a wait. */
const MAX_PAGES = 6;

async function pageUntil(report: ReportPage, side: "prev" | "next", name: "findings" | "run") {
  for (let i = 0; i < MAX_PAGES && !(await report.tabInFullView(name)); i += 1) {
    await report.scrollTabs(side);
  }
}

for (const width of NARROW) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${width}px, ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 800 }, colorScheme });

      test("the row says it scrolls, and the chevrons walk it end to end", async ({ page }) => {
        const report = await createReportPage(page);
        await report.goto(FIXTURES.wallabag);

        expect(await report.tabsOverflow()).toBe(true);
        expect(await report.tabInFullView("findings")).toBe(true);
        expect(await report.tabInFullView("run")).toBe(false);
        expect(await report.tabsOverflowCue()).toEqual({ prev: false, next: true });

        await pageUntil(report, "next", "run");
        expect(await report.tabInFullView("run")).toBe(true);
        expect(await report.tabsOverflowCue()).toEqual({ prev: true, next: false });

        await pageUntil(report, "prev", "findings");
        expect(await report.tabInFullView("findings")).toBe(true);
        expect(await report.tabsOverflowCue()).toEqual({ prev: false, next: true });

        // A chevron click is a pointer affordance: it never takes focus or selects a tab.
        expect(await report.isFocusOnTabsChevron()).toBe(false);
        expect(await report.activeTab()).toBe("findings");
        // The row scrolls inside itself; the page never scrolls sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });

      test("a shared link to the last tab opens with that tab in full view", async ({ page }) => {
        const report = await createReportPage(page);
        await report.gotoWithHash(FIXTURES.wallabag, "view=run");

        expect(await report.activeTab()).toBe("run");
        expect(await report.tabInFullView("run")).toBe(true);
        expect(await report.tabsOverflowCue()).toEqual({ prev: true, next: false });
      });
    });
  }
}

test.describe("390px, keyboard", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("one Tab stop, arrows rove and bring the tab into view, chevrons never take focus", async ({
    page,
  }) => {
    const report = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);

    await report.focusTab("findings");
    await report.pressKey("ArrowLeft");
    expect(await report.activeTab()).toBe("run");
    expect(await report.focusedTab()).toBe("run");
    await expect.poll(() => report.tabInFullView("run")).toBe(true);

    await report.pressKey("Home");
    expect(await report.focusedTab()).toBe("findings");
    await expect.poll(() => report.tabInFullView("findings")).toBe(true);

    await report.pressKey("End");
    expect(await report.focusedTab()).toBe("run");

    // Tab leaves the list in one step and lands past it, on neither chevron; Shift+Tab comes back
    // to the selected tab.
    await report.pressTab();
    expect(await report.focusedTab()).toBe(null);
    expect(await report.isFocusOnTabsChevron()).toBe(false);
    await report.pressTab(true);
    expect(await report.focusedTab()).toBe("run");
  });

  test("with reduced motion, a switch lands the tab in view without a glide", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const report = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);

    // A pasted link switches tabs without focusing any: only the row's own reveal can bring it in.
    await report.setLocationHash("view=radius");
    await expect.poll(() => report.activeTab()).toBe("radius");
    expect(await report.tabInFullView("radius")).toBe(true);
  });
});

test.describe("390px, forced colours", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the chevron stays visible in the system's colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    const report = await createReportPage(page);
    await report.goto(FIXTURES.wallabag);

    expect(await report.tabsOverflowCue()).toEqual({ prev: false, next: true });
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  // 320px: the one width where a single chevron click stops short of the end, so both show at once.
  test.describe(`320px axe, ${colorScheme}`, () => {
    test.describe.configure({ timeout: 90_000 });
    test.use({ viewport: { width: 320, height: 800 }, colorScheme });

    test("both chevrons shown, no serious or critical violation in the header", async ({ page }) => {
      const report = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);
      await report.scrollTabs("next");
      expect(await report.tabsOverflowCue()).toEqual({ prev: true, next: true });

      const results = await new AxeBuilder({ page }).include("header").analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`));
      expect(serious).toEqual([]);
    });
  });
}

for (const width of WIDE) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("the row fits: no fade, no chevron, every tab in view", async ({ page }) => {
      const report = await createReportPage(page);
      await report.goto(FIXTURES.wallabag);

      expect(await report.tabsOverflow()).toBe(false);
      expect(await report.tabsOverflowCue()).toEqual({ prev: false, next: false });
      for (const view of ["findings", "advisories", "packages", "radius", "run"] as const) {
        expect(await report.tabInFullView(view)).toBe(true);
      }
    });
  });
}
