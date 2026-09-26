import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("detail panel — basic content", () => {
  test("names the package, its verdict, and the signals that fired", async () => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    const detail = await report.detail();
    expect(detail.open).toBe(true);
    expect(detail.name).toBe("vendor/transitive");
    // The verdict pill's text is CSS-uppercased (report.css:319-324); innerText reflects that.
    expect(detail.text).toMatch(/abandoned/i);
    expect(detail.text).toContain("S1");
    expect(detail.text).toContain("S5");
  });

  test("closing returns to no detail open", async () => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    await report.closeDetail();
    expect((await report.detail()).open).toBe(false);
  });

  test("a validated replacement is named in the detail", async () => {
    // fixtures/bundles/mautic_mautic.json: rector/type-perfect (abandoned, direct, high) carries a
    // Packagist-validated finding.replacement, unlike Packagist's own free-text field.
    await report.goto(FIXTURES.mautic);
    await report.tab("packages"); // 265 findings; search narrows the row search has to scroll to
    await report.search("rector/type-perfect");
    await report.openPackage("rector/type-perfect");
    expect((await report.detail()).text).toContain("tomasvotruba/type-coverage");
  });
});

test.describe("M25: a radius card must not claim more packages than it draws", () => {
  test("the stated count matches the number of rows actually listed", async () => {
    // M25 (DESIGN.md §5), fixed on purpose: legacy's radius card counted
    // flagged = pulled.length + 1 but rendered only `pulled`, so a parent that was itself flagged
    // never got a row of its own. wallabag/rulerz-bundle (pinned, direct) pulls in
    // wallabag/rulerz-bridge and others while also being flagged itself.
    await report.goto(FIXTURES.wallabag);
    await report.tab("radius");
    const card = await report.radiusCard("wallabag/rulerz-bundle");
    expect(card).not.toBeNull();
    expect(card?.statedCount).toBe(card?.listedCount);
  });
});

/**
 * The clipboard itself is the browser's: permissions for it exist only in Chromium, and a headless
 * WebKit refuses the write outright. What the page owns is the feedback, so the API is replaced
 * before the page loads — once resolving, once rejecting — and both branches are checked the same
 * way on every engine.
 */
function stubClipboard(mode: string): void {
  const writes: string[] = [];
  (window as unknown as { __copied: string[] }).__copied = writes;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return mode === "resolve" ? Promise.resolve() : Promise.reject(new Error("denied"));
      },
    },
  });
}

test.describe("copy button feedback", () => {
  // fixtures/bundles/wallabag_wallabag.json: craue/config-bundle (left-behind, direct) carries an
  // S8 suggested_constraint ("^3.0"), which is what makes the "Copy" action appear at all.
  test("copies the composer require command and reverts the label after a moment", async ({ page }) => {
    await page.addInitScript(stubClipboard, "resolve");
    await report.goto(FIXTURES.wallabag);
    await report.openPackage("craue/config-bundle");
    expect(await report.copyButtonLabel()).toBe("Copy");

    await report.clickCopyButton();
    await expect.poll(async () => report.copyButtonLabel()).toBe("Copied");
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      "composer require craue/config-bundle '^3.0'",
    ]);

    await expect.poll(async () => report.copyButtonLabel(), { timeout: 3000 }).toBe("Copy");
  });

  test("says to copy by hand when the browser refuses, and still reverts", async ({ page }) => {
    await page.addInitScript(stubClipboard, "reject");
    await report.goto(FIXTURES.wallabag);
    await report.openPackage("craue/config-bundle");

    await report.clickCopyButton();
    await expect.poll(async () => report.copyButtonLabel()).toBe("Select it and copy");
    await expect.poll(async () => report.copyButtonLabel(), { timeout: 4000 }).toBe("Copy");
  });
});
