import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: tabs and counts on the composite", () => {
  test.beforeEach(async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
  });

  test("Overview is the default tab, and a list key with no view opens Findings", async () => {
    await report.gotoReport2("composite");
    expect(await report.activeTab()).toBe("overview");
    await report.gotoReport2WithHash("composite", "scope=direct");
    expect(await report.activeTab()).toBe("findings");
  });

  test("switching tabs moves the aria-selected tab and closes any open detail", async () => {
    await report.tab("packages");
    expect(await report.activeTab()).toBe("packages");
    await report.openPackage("twig/twig");
    expect((await report.detail()).open).toBe(true);

    await report.tab("run");
    expect(await report.activeTab()).toBe("run");
    expect((await report.detail()).open).toBe(false);
  });

  test("badge counts reflect the whole report, not the current filter", async () => {
    expect(await report.tabCount("overview")).toBe("");
    expect(await report.tabCount("findings")).toBe("9");
    expect(await report.tabCount("advisories")).toBe("29");
    expect(await report.tabCount("packages")).toBe("9");
    expect(await report.tabCount("radius")).toBe("2");

    await report.search("does-not-exist-anywhere");
    expect(await report.tabCount("findings")).toBe("9");
  });

  test("Findings renders one row per flagged package, grouped by grade (critical before low)", async () => {
    expect(await report.rows()).toEqual([
      "twig/twig",
      "symfony/monolog-bridge",
      "guzzlehttp/guzzle",
      "symfony/debug",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
      "friendsofsymfony/oauth2-php",
    ]);
  });

  test("the count line reads N of the total flagged", async () => {
    expect(await report.countLine()).toBe("9 of 9 flagged packages");
  });

  test("All packages lists every finding, flagged or not", async () => {
    await report.tab("packages");
    expect(await report.rows()).toHaveLength(9);
  });

  test("Blast radius lists the two direct requirements that pull in a flagged package, each folded", async ({
    page,
  }) => {
    await report.tab("radius");
    // A requirement's packages are folded under it until its toggle opens them.
    expect(await report.rows()).toEqual(["friendsofsymfony/oauth-server-bundle", "guzzlehttp/guzzle"]);
    await page.getByRole("button", { name: /Show the 1 package listed under guzzlehttp\/guzzle/ }).click();
    expect(await report.rows()).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "guzzlehttp/guzzle",
      "symfony/polyfill-intl-idn",
    ]);
  });

  // The long recorded lock is tall enough on every tab that scrolling well down one and switching
  // tabs lands mid-list in the next unless the switch itself resets the scroll.
  test("a user-driven tab switch scrolls back to the top; a hashchange restore does not", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("baselined-wallabag-2.6", "view=findings");
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);

    // A click on a tab is the "user action" DESIGN.md means: the new tab's first row is where the
    // reader lands, not wherever the last tab happened to be scrolled to.
    await report.tab("packages");

    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // A pasted link's hashchange restores state without the reader ever clicking a tab, so it must
    // not fight a scroll position the reader chose themselves.
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
    });
    await report.setLocationHash("view=radius");
    await expect.poll(() => report.activeTab()).toBe("radius");
    // Not back at 0. WebKit clamps the offset while the new view's container-query layout settles
    // (no scrollTo or scrollIntoView runs), so the exact offset is the engine's.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("PD-ADV-7: a count from a complete advisory check carries no ring", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Advisories 29" }).locator(".tab-flag")).toHaveCount(0);
  });

  test("M14: an unrecognised view falls back by rule R1, tab marked selected", async () => {
    // M14 (DESIGN.md §5), fixed on purpose: no tab used to be aria-selected for an unknown view.
    await report.gotoReport2WithHash("composite", "view=not-a-real-view");
    expect(await report.activeTab()).toBe("overview");
    await report.gotoReport2WithHash("composite", "view=not-a-real-view&scope=direct");
    expect(await report.activeTab()).toBe("findings");
    expect(await report.rows()).toHaveLength(7);
  });
});

test("PD-ADV-7: the Advisories count from a lookup that did not run carries a ring, named in words", async ({
  page,
}) => {
  await report.gotoReport2("B-offline-dagger");

  const tab = page.getByRole("tab", { name: /^Advisories \d+, check not run$/ });
  await expect(tab.locator(".tab-flag")).toBeVisible();
  await expect(tab.locator(".tab-flag")).toHaveAttribute("title", "advisory check not run");
});
