import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Url } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-ROWS-9: only the reader or the address opens a package", () => {
  // Default Chromium viewport (1280x720) is wide (>=1181px).
  test("a wide screen opens nothing on load, and the address stays bare", async () => {
    await report.gotoReport2("composite");
    expect((await report.detail()).open).toBe(false);
    expect(await report.hash()).toBe("");
  });

  test("a deep link still opens its package on load, on Findings, and keeps it in the address", async () => {
    await report.gotoReport2WithHash("composite", "pkg=symfony%2Fyaml");
    expect((await report.detail()).name).toBe("symfony/yaml");
    expect(await report.activeTab()).toBe("findings");
    expect(await report.hash()).toBe("#view=findings&pkg=symfony%2Fyaml");
  });

  test("opening a package writes it to the address, and closing it takes it out again", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openPackage("symfony/yaml");
    // Polled: the address is written after the render that opens the panel, not in the same tick.
    await expect.poll(() => report.hash()).toContain("pkg=symfony%2Fyaml");
    await report.closeDetail();
    await expect.poll(() => report.hash()).toBe("#view=findings");
  });
});

test.describe("M12: a malformed %-escape must not blank the whole page", () => {
  test("the rest of the page still renders when one hash piece cannot be decoded", async () => {
    // M12 (DESIGN.md §5), fixed on purpose: readHash() used to let decodeURIComponent throw
    // unguarded, before anything else rendered, leaving tabs and rows all empty.
    await report.gotoReport2WithHash("composite", "q=%E0%A4%A");
    expect(await report.activeTab()).toBe("findings");
    expect(await report.rows()).toHaveLength(7);
  });
});

test.describe("M13: an unknown pkg= on a narrow screen must not strand a scroll lock", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("positive control: opening a real package on this viewport does lock scroll", async () => {
    // Proves isScrollLocked() actually detects the lock the M13 test below relies on being absent.
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openPackage("symfony/yaml");
    expect((await report.detail()).open).toBe(true);
    expect(await report.isScrollLocked()).toBe(true);
  });

  test("no scroll lock without a visible reason for it", async () => {
    // M13 (DESIGN.md §5), fixed on purpose: the page used to set the detail-open class off the bare
    // presence of state.pkg, locking scroll under 1180px with nothing visible to explain it.
    await report.gotoReport2WithHash("composite", "pkg=does-not-exist-in-this-report");
    const stuck = (await report.isScrollLocked()) && !(await report.detail()).open;
    expect(stuck).toBe(false);
  });

  test("nothing opens on load on a narrow screen either", async () => {
    await report.gotoReport2("composite");
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("hashchange: a link pasted into an open page", () => {
  test("a pasted link applies live", async () => {
    // Fixed on purpose (DESIGN.md §5): the page used to register no hashchange listener at all.
    await report.gotoReport2WithHash("composite", "view=findings");
    expect(await report.rows()).toHaveLength(7);
    await report.setLocationHash("q=cssmin");
    expect(await report.rows()).toEqual(["tubalmartin/cssmin"]);
  });
});

test.describe("SEARCH-FALLBACK: emptying the state must not erase location.search", () => {
  test("a query string survives a writeHash() that resets to the bare path", async ({ page }) => {
    // SEARCH-FALLBACK (DESIGN.md §5), fixed on purpose: writeHash() used to fall back to
    // location.pathname when the computed state was empty, dropping any ?query the URL carried.
    await page.goto(report2Url("composite") + "?debug=1#q=x");
    expect(report.url()).toContain("?debug=1");
    await report.search(""); // empties state.q -> nothing is open either, so the state is now empty
    expect(report.url()).toContain("?debug=1");
  });
});

test.describe("on a report-2 page", () => {
  const HASH =
    "view=packages&q=symfony&verdict=critical&scope=direct&gate=fails&flag=old-promise&accepted=hide&pkg=symfony%2Fdebug";

  test("a fragment with every report-2 group restores exactly the same state", async () => {
    await report.gotoReport2WithHash("composite", HASH);
    expect(await report.activeTab()).toBe("packages");
    expect(await report.searchValue()).toBe("symfony");
    expect((await report.detail()).name).toBe("symfony/debug");
    expect(await report.hash()).toBe("#" + HASH);
  });

  test("reload restores the same state from the same URL", async () => {
    await report.gotoReport2WithHash("composite", HASH);
    await report.reload();
    expect(await report.activeTab()).toBe("packages");
    expect(await report.searchValue()).toBe("symfony");
    expect(await report.hash()).toBe("#" + HASH);
  });

  test("an old prio= fragment opens verdict=", async () => {
    await report.gotoReport2WithHash("composite", "prio=low");
    expect(await report.rows()).toEqual(["symfony/yaml", "symfony/polyfill-intl-idn"]);
    expect(await report.hash()).toBe("#view=findings&verdict=low");
  });

  test("an old verdict=<flag> fragment opens flag=", async () => {
    await report.gotoReport2WithHash("composite", "verdict=left-behind");
    expect(await report.rows()).toEqual(["symfony/monolog-bridge"]);
    expect(await report.hash()).toBe("#view=findings&flag=left-behind");
  });
});
