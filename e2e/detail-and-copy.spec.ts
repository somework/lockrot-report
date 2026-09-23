import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES } from "./support/pages";

const renderer = currentRenderer();
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

  test("a validated replacement is named in the detail (parity, both renderers)", async () => {
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
    test.fail(
      renderer === "legacy",
      "M25: when the direct requirement is itself flagged and also pulls others, " +
        "flagged = pulled.length + 1 but only `pulled` is rendered — the parent itself is never a " +
        "row (report.js:605,613-617). wallabag/rulerz-bundle (pinned, direct) pulls in " +
        "wallabag/rulerz-bridge and others while also being flagged itself.",
    );
    await report.goto(FIXTURES.wallabag);
    await report.tab("radius");
    const card = await report.radiusCard("wallabag/rulerz-bundle");
    expect(card).not.toBeNull();
    expect(card?.statedCount).toBe(card?.listedCount);
  });
});

test.describe("copy button feedback", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("copies the composer require command and reverts the label after a moment", async () => {
    // fixtures/bundles/wallabag_wallabag.json: craue/config-bundle (left-behind, direct) carries an
    // S8 suggested_constraint ("^3.0"), which is what makes the "Copy" action appear at all.
    await report.goto(FIXTURES.wallabag);
    await report.openPackage("craue/config-bundle");
    expect(await report.copyButtonLabel()).toBe("Copy");

    await report.clickCopyButton();
    expect(await report.copyButtonLabel()).toBe("Copied");

    await expect.poll(async () => report.copyButtonLabel(), { timeout: 3000 }).toBe("Copy");
  });
});
