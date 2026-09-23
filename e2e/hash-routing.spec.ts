import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES, pageUrl } from "./support/pages";

const renderer = currentRenderer();
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("round-trip: every key, in the documented order", () => {
  const HASH =
    "view=packages&q=snap&prio=medium&verdict=pinned&scope=transitive&signal=S6&sev=high&fix=move&since=new&pkg=vendor%2Fsnapshot";

  test("a fragment with every group restores exactly the same state", async () => {
    await report.gotoWithHash(FIXTURES.mini, HASH);
    expect(await report.activeTab()).toBe("packages");
    expect(await report.searchValue()).toBe("snap");
    // Round-tripped unchanged: writing it back reproduces the identical fragment, group order
    // included (DESIGN.md §4: `prio,verdict,scope,signal,sev,fix,since`, then `pkg`) — the
    // authoritative check that every group's value, not just the two rendered ones above, made it
    // through readHash() and back out through writeHash() unchanged.
    expect(await report.hash()).toBe("#" + HASH);
  });

  test("reload restores the same state from the same URL", async () => {
    await report.gotoWithHash(FIXTURES.mini, HASH);
    await report.reload();
    expect(await report.activeTab()).toBe("packages");
    expect(await report.searchValue()).toBe("snap");
    expect(await report.hash()).toBe("#" + HASH);
  });
});

test.describe("pkg omission: the page's own auto-pick never reaches the address bar", () => {
  test("the boot auto-open does not appear in the hash", async () => {
    // Default Chromium viewport (1280x720) is wide enough (>=1181px) for the boot auto-open.
    await report.goto(FIXTURES.mini);
    expect((await report.detail()).name).toBe("vendor/transitive"); // FLAGGED[0]
    expect(await report.hash()).not.toContain("pkg=");
  });

  test("touching selection at all clears pkgAuto and the package starts appearing", async () => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/snapshot");
    expect(await report.hash()).toContain("pkg=vendor%2Fsnapshot");
  });
});

test.describe("M12: a malformed %-escape must not blank the whole page", () => {
  test("the rest of the page still renders when one hash piece cannot be decoded", async () => {
    test.fail(
      renderer === "legacy",
      "M12: decodeURIComponent throws unguarded in readHash(), which runs before fillLegend/" +
        "renderLedger/render, so an uncaught URIError leaves tabs, ledger and rows all empty",
    );
    await report.gotoWithHash(FIXTURES.mini, "q=%E0%A4%A");
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
  });
});

test.describe("M13: an unknown pkg= on a narrow screen must not strand a scroll lock", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("no scroll lock without a visible reason for it", async () => {
    test.fail(
      renderer === "legacy",
      "M13: renderDetail() hides the box when the package is not found, but render() still sets " +
        "body.detail-open off !!state.pkg alone, and CSS locks scroll under 1180px (report.css:364)",
    );
    await report.gotoWithHash(FIXTURES.mini, "pkg=does-not-exist-in-this-report");
    const stuck = (await report.isScrollLocked()) && !(await report.detail()).open;
    expect(stuck).toBe(false);
  });

  test("the boot auto-open never fires on a narrow screen regardless", async () => {
    await report.goto(FIXTURES.mini);
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("hashchange: a link pasted into an open page", () => {
  test("legacy has no hashchange listener at all; the fix applies it live", async () => {
    test.fail(
      renderer === "legacy",
      "hashchange: report.js never registers a hashchange listener (grep confirmed in js-4.md §3)",
    );
    await report.goto(FIXTURES.mini);
    expect(await report.rows()).toEqual(["vendor/transitive", "vendor/snapshot"]);
    await report.setLocationHash("q=snapshot");
    expect(await report.rows()).toEqual(["vendor/snapshot"]);
  });
});

test.describe("SEARCH-FALLBACK: emptying the state must not erase location.search", () => {
  test("a query string survives a writeHash() that resets to the bare path", async ({ page }) => {
    test.fail(
      renderer === "legacy",
      "SEARCH-FALLBACK: writeHash() falls back to location.pathname when the computed state is " +
        "empty, dropping any ?query the URL carried (report.js:927)",
    );
    await page.goto(pageUrl(renderer, FIXTURES.mini) + "?debug=1#q=x");
    expect(report.url()).toContain("?debug=1");
    await report.search(""); // empties state.q -> with the boot auto-pick excluded, state is now empty
    expect(report.url()).toContain("?debug=1");
  });
});
