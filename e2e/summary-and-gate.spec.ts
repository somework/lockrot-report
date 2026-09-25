/**
 * PD-SUMMARY-6 (DESIGN.md §5, §8): the summary band's lead — the flagged figure, its chips and the
 * waffle — at every width, with only the supporting tier folded on a phone; PD-SUMMARY-2/3: the
 * header's quiet gate fact and its popover, and the Run tab's em dash for a document that predates
 * `run.fail_on`.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-SUMMARY-6: the summary band's lead", () => {
  test("wallabag_wallabag: 69 of 271 packages flagged, one waffle square per package", async ({ page }) => {
    // wallabag_wallabag.json: priorities {critical:3, high:38, medium:8, low:20}, packagesChecked 271.
    await report.goto(FIXTURES.wallabag);
    const ledger = page.getByRole("group", { name: "Ledger" });
    await expect(ledger.locator(".lead-num")).toHaveText("69");
    expect(await report.hasSummaryLine("of 271 packages")).toBe(true);
    expect(await report.hasSummaryLine("flagged · 25% of the lock")).toBe(true);
    for (const name of ["critical 3", "high 38", "medium 8", "low 20"]) {
      await expect(ledger.getByRole("button", { name, exact: true })).toBeVisible();
    }
    expect(await report.summaryWaffle()).toEqual({ flagged: 69, total: 271 });
  });

  test("wallabag_wallabag: the verdict bars rank the flagged verdicts, the rest sit in a quiet line", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabag);
    const ledger = page.getByRole("group", { name: "Ledger" });
    await expect(ledger.locator(".legend-btn-bar")).toHaveText([
      "left-behind 23",
      "abandoned 21",
      "stale 12",
      "silent 8",
      "pinned 4",
      "old-promise 1",
    ]);
    await expect(ledger.locator(".ledger-quiet .legend-btn")).toHaveText(["finished 18", "ok 184"]);
  });

  test("the band never overflows the page, 320px to 1920px", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
    for (const width of [320, 390, 768, 1024, 1180, 1181, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("mini: a lock of four packages still draws its four squares, at the same size", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.hasSummaryLine("of 4 packages")).toBe(true);
    expect(await report.summaryWaffle()).toEqual({ flagged: 2, total: 4 });
  });

  test("an empty lock says so, rather than 'nothing flagged in 0 packages'", async ({ page }) => {
    await report.goto(FIXTURES.empty);
    expect(await report.hasSummaryLine("No packages in this lock")).toBe(true);
    expect(await report.summaryWaffle()).toBeNull();
    await expect(page.getByRole("group", { name: "Ledger" })).toContainText("No packages, so no verdicts.");
  });

  test("at 1024×768 the band leaves room for the list: the tier sits in columns, not a stack", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await report.goto(FIXTURES.wallabag);
    const band = await page.getByRole("group", { name: "Ledger" }).boundingBox();
    expect(band).not.toBeNull();
    // Was 811px tall here, which put the first package below a 768px screen.
    expect(band?.height ?? Infinity).toBeLessThan(560);
  });
});

test.describe("PD-SUMMARY-6: on a phone the lead stays open, the tier folds", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("koel_koel at 390px: figure, chips and waffle are visible; the verdict bars wait in the fold", async ({
    page,
  }) => {
    await report.goto(FIXTURES.koel);
    const ledger = page.getByRole("group", { name: "Ledger" });
    expect(await report.hasSummaryLine("of 202 packages")).toBe(true);
    await expect(ledger.getByRole("button", { name: "critical 1", exact: true })).toBeVisible();
    expect(await report.summaryWaffle()).toEqual({ flagged: 7, total: 202 });
    // The tier starts folded: a verdict bar is not visible until the reader opens it.
    await expect(ledger.getByRole("button", { name: /^left-behind/ })).toBeHidden();
    const summary = page.getByText("More about this lock").locator("xpath=ancestor::summary[1]");
    await expect(summary).toContainText("3 reasons · no advisories · 89.6 libyears");
    await summary.click();
    await expect(ledger.getByRole("button", { name: /^left-behind/ })).toBeVisible();
  });

  test("mini-split.json's clean state reads as good at a glance", async () => {
    await report.goto(FIXTURES.miniSplit);
    expect(await report.hasSummaryLine("Nothing flagged in 1 package")).toBe(true);
  });
});

test.describe("PD-SUMMARY-2: the header's gate fact", () => {
  test("wallabag's fail-on is 'none': reads 'no gate'", async () => {
    // The fixture that actually reads run.fail_on === 'none' is wallabag_wallabag.json.
    await report.goto(FIXTURES.wallabag);
    expect(await report.gateFactLabel()).toMatch(/^no gate/i);
  });

  test("a gated run: mini.json's fail-on is 'silent'", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.gateFactLabel()).toBe("gate: silent ⓘ");
  });

  test("opens its popover on click, with the exact stated text", async () => {
    await report.goto(FIXTURES.wallabag);
    expect(await report.isGateFactOpen()).toBe(false);
    await report.openGateFact();
    expect(await report.isGateFactOpen()).toBe(true);
    expect(await report.gateFactPopoverText()).toBe(
      "No gate on this run: it exits 0 whatever it finds, and this page lists what it saw. Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    );
  });

  test("Escape closes the popover, and — over an open detail — only the popover, not the detail underneath it", async () => {
    // mini.json's fail-on is 'silent', so the gate fact renders; vendor/transitive is opened first
    // (nothing opens by itself, PD-ROWS-9). One Escape must close only the popover; a second one
    // then reaches the detail, same chain as when there is no popover at all (keyboard.ts#decideEscape).
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    expect((await report.detail()).open).toBe(true);
    await report.openGateFact();
    expect(await report.isGateFactOpen()).toBe(true);

    await report.pressEscape();
    expect(await report.isGateFactOpen()).toBe(false);
    expect((await report.detail()).open).toBe(true);

    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("PD-SUMMARY-3: the Run tab's fail-on em dash", () => {
  // mini-no-fail-on.json (fixtures/bundles/): mini.json with `run.fail_on` deleted outright, not
  // set to "none" — the one built page that exercises the null branch end to end. (This test used
  // to be skipped with no fixture and no assertion; tests/unit/ui/views.test.tsx#RunView already
  // covered the branch directly against a synthetic model, but nothing here proved the page wired
  // it up — a regression review caught the gap.)
  test("a document without run.fail_on prints an em dash, not the word 'none'", async ({ page }) => {
    await report.goto("mini-no-fail-on" as FixtureName);
    await report.tab("run");
    const panel = page.getByRole("tabpanel");
    // Scoped to the "fail-on" row itself: the same panel's "baseline" row reads "none" for a
    // document with no baseline at all (RunView.tsx#baselineText), which a panel-wide text search
    // would also match.
    const failOn = panel.locator("dt", { hasText: /^fail-on$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(failOn).toHaveText("—");
  });

  // PD-SUMMARY-2 (Header.tsx): the same document renders no gate fact at all — a run.fail_on the
  // page never saw is not "no gate" (that is the word for --fail-on=none, a distinct, actually-said
  // value). tests/unit/ui/App.test.tsx covers the same rule directly against a synthetic model.
  test("the same document's header shows no gate fact, since the run never said one", async () => {
    await report.goto("mini-no-fail-on" as FixtureName);
    expect(await report.gateFactLabel()).toBeNull();
  });

  test("a document with an explicit fail-on prints the word, not an em dash (mini.json: 'silent')", async ({
    page,
  }) => {
    await report.goto(FIXTURES.mini);
    await report.tab("run");
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText("fail-on");
    await expect(panel).toContainText("silent");
  });
});
