import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * `fixtures/bundles/mini.json`: 4 findings, 2 of them flagged (vendor/transitive: abandoned/high,
 * vendor/snapshot: pinned/medium), 1 unknown (vendor/direct, direct requirement, pulls in the
 * abandoned one), 1 finished (private/thing). 1 exposure entry, 2 notes, no advisories.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.mini);
});

test.describe("tabs", () => {
  test("Findings is the default tab", async () => {
    expect(await report.activeTab()).toBe("findings");
  });

  test("switching tabs moves the aria-selected tab and closes any open detail", async () => {
    await report.tab("packages");
    expect(await report.activeTab()).toBe("packages");
    await report.openPackage("vendor/transitive");
    expect((await report.detail()).open).toBe(true);

    await report.tab("radius");
    expect(await report.activeTab()).toBe("radius");
    expect((await report.detail()).open).toBe(false);
  });

  test("badge counts reflect the whole report, not the current filter", async () => {
    expect(await report.tabCount("findings")).toBe("2");
    expect(await report.tabCount("advisories")).toBe("0");
    expect(await report.tabCount("packages")).toBe("4");
    expect(await report.tabCount("radius")).toBe("1");
    expect(await report.tabCount("run")).toBe("2");

    // Narrowing the list with a filter must not move any badge (report.js:319-321: rail/ledger
    // counts are computed once, over the whole population, independent of the query or filters).
    await report.search("does-not-exist-anywhere");
    expect(await report.tabCount("findings")).toBe("2");
  });
});

test.describe("Findings view", () => {
  test("renders one row per flagged package, grouped by priority (high before medium)", async () => {
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
  });

  test("the count line reads N of the total flagged", async () => {
    expect(await report.countLine()).toBe("2 of 2 flagged packages");
  });
});

test.describe("Packages view", () => {
  test("lists every finding, flagged or not", async () => {
    await report.tab("packages");
    const rows = await report.rows();
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining(["vendor/transitive", "vendor/snapshot", "vendor/direct", "private/thing"]),
    );
  });
});

test.describe("Blast radius view", () => {
  test("one card, naming the direct requirement that pulls in the abandoned package", async () => {
    await report.tab("radius");
    expect(await report.rows()).toEqual(["vendor/transitive"]);
  });
});

test.describe("a tab switch resets scroll (a first-time-reader walk found the old page)", () => {
  // wallabag_wallabag.json: 69 flagged findings, tall enough on every tab (findings, packages,
  // radius) that scrolling well down one and switching tabs lands mid-list in the next unless the
  // switch itself resets the scroll — `mini`'s own four findings are too short to reproduce it.
  test("a user-driven tab switch scrolls back to the top; a hashchange restore does not", async ({
    page,
  }) => {
    const wallabag = await createReportPage(page);
    await wallabag.goto(FIXTURES.wallabag);
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    // A click on a tab — Tabs.tsx's own dispatch, the same path "See the advisories" (FindingsView's
    // quiet note) uses — is the "user action" DESIGN.md means; the new tab's own first row should be
    // where the reader lands, not wherever the last tab happened to be scrolled to.
    await wallabag.tab("packages");

    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // A pasted link's hashchange restores state without the reader ever clicking a tab — it must
    // not fight a scroll position the reader chose themselves.
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    await wallabag.setLocationHash("view=radius");
    expect(await wallabag.activeTab()).toBe("radius");
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  });
});

test.describe("M14: an unrecognised view= falls back", () => {
  test("an unrecognised view falls back to Findings, tab marked selected (M14)", async () => {
    // M14 (DESIGN.md §5), fixed on purpose: legacy left no tab aria-selected and showed Run
    // content with the ledger still visible for an unknown view.
    await report.gotoWithHash(FIXTURES.mini, "view=not-a-real-view");
    expect(await report.activeTab()).toBe("findings");
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
  });
});
