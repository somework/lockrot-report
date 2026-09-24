/**
 * PD-SUMMARY-1/2/3 (DESIGN.md §5, §8): the priority-counts line above the ledger (and its phone-
 * fold twin), the header's quiet gate fact and its popover, and the Run tab's em dash for a
 * document that predates `run.fail_on`.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("PD-SUMMARY-1: the priority-counts line above the ledger", () => {
  test("wallabag_wallabag: every non-zero priority, in order, then the package total", async () => {
    // wallabag_wallabag.json: priorities {critical:3, high:38, medium:8, low:20}, packagesChecked 271.
    await report.goto(FIXTURES.wallabag);
    expect(await report.hasSummaryLine("3 critical · 38 high · 8 medium · 20 low of 271 packages")).toBe(
      true,
    );
  });

  test("koel_koel: a smaller fixture, same rule", async () => {
    // koel_koel.json: priorities {critical:1, high:3, medium:1, low:2}, packagesChecked 202.
    await report.goto(FIXTURES.koel);
    expect(await report.hasSummaryLine("1 critical · 3 high · 1 medium · 2 low of 202 packages")).toBe(true);
  });

  test("mini: zero buckets (critical, low) are dropped rather than shown at 0", async () => {
    // mini.json: priorities {critical:0, high:1, medium:1, low:0, none:2}, packagesChecked 4.
    await report.goto(FIXTURES.mini);
    expect(await report.hasSummaryLine("1 high · 1 medium of 4 packages")).toBe(true);
    expect(await report.hasSummaryLine("0 critical")).toBe(false);
  });
});

test.describe("PD-SUMMARY-1: the phone fold shows the same line, closed", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("koel_koel at 390px: the counts are visible without opening the ledger fold", async ({ page }) => {
    await report.goto(FIXTURES.koel);
    // The fold starts closed: its own content (a legend button, say) is not visible yet, proving
    // this checks the closed <summary>, not the unfolded ledger underneath it.
    await expect(page.getByRole("button", { name: /^critical/ })).toBeHidden();
    expect(await report.hasSummaryLine("1 critical · 3 high · 1 medium · 2 low of 202 packages")).toBe(true);
  });

  test("mini at 390px, in the clean state too (mini-split.json)", async () => {
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
    // mini.json auto-opens vendor/transitive's detail on a wide screen (boot pick); its fail-on is
    // 'silent', so the gate fact renders too. One Escape must close only the popover; a second one
    // then reaches the detail, same chain as when there is no popover at all (keyboard.ts#decideEscape).
    await report.goto(FIXTURES.mini);
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
