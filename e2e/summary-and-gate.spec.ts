/**
 * PD-SUMMARY-6 (DESIGN.md §5, §8): the summary band's lead — the flagged figure, its chips and the
 * waffle — at every width, with only the supporting tier folded on a phone; PD-SUMMARY-2/3: the
 * header's quiet gate fact and its popover, and the Run tab's em dash for a document that predates
 * `run.fail_on`.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, type FixtureName } from "./support/pages";
import {
  flagBars,
  gateLine,
  gradeChips,
  overviewSurface,
  severityChips,
  waffleSquares,
} from "./support/report2/overview";

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
      "This run was told --fail-on=none: it fails on no finding, and this page lists what it saw. Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    );
  });

  // PD-GATE-1: lockrot decided this run failed on --strict-network; the header says so in its words.
  test("fail-on none with --strict-network is never 'no gate': a failed lookup fails the run", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabagOfflineStrict013);
    expect(await report.gateFactLabel()).toBeNull();
    await expect(page.locator(".gate-fact")).toHaveText("this run fails · --strict-network");
  });

  test("a baseline run nothing failed passes, and says it applies no fail-on, at every width", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabagGenerateBaseline013);
    await expect(page.locator(".gate-fact")).toHaveText("baseline run passes · --fail-on not applied");
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".gate-fact .gate-word"), `${String(width)}px`).toHaveText("passes");
      await expect(page.locator(".lead-gate"), `${String(width)}px`).toHaveText(
        "This run passes: it applies no fail-on, though 39 packages meet it. why",
      );
      await expect(page.locator(".lead-gate"), `${String(width)}px`).toBeVisible();
    }
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

test.describe("PD-SUMMARY-3: the Run tab's fail-on without the field", () => {
  // mini-no-fail-on.json (fixtures/bundles/): mini.json with `run.fail_on` deleted outright, not
  // set to "none" — the one built page that exercises the null branch end to end. (This test used
  // to be skipped with no fixture and no assertion; tests/unit/ui/views.test.tsx#RunView already
  // covered the branch directly against a synthetic model, but nothing here proved the page wired
  // it up — a regression review caught the gap.)
  // PD-RUN-4: the em dash became the reason — the field is not in the document.
  test("a document without run.fail_on says it is not in the document, not the word 'none'", async () => {
    await report.goto("mini-no-fail-on" as FixtureName);
    await report.tab("run");
    // Scoped to the "fail-on" row itself: the same panel's "baseline" row reads "none" for a
    // document with no baseline at all (RunView.tsx#baselineText), which a panel-wide text search
    // would also match.
    await expect(report.runField("fail-on")).toHaveText("not in this document");
  });

  // PD-SUMMARY-2 (Header.tsx): the same document renders no gate fact at all — a run.fail_on the
  // page never saw is not "no gate" (that is the word for --fail-on=none, a distinct, actually-said
  // value). tests/unit/ui/App.test.tsx covers the same rule directly against a synthetic model.
  test("the same document's header shows no gate fact, since the run never said one", async () => {
    await report.goto("mini-no-fail-on" as FixtureName);
    expect(await report.gateFactLabel()).toBeNull();
  });

  test("a 0.13 run words its threshold from run.fail_on_kind", async () => {
    await report.gotoWithHash(FIXTURES.wallabagBaselineOlder013, "view=run");
    await expect(report.runField("fail-on")).toHaveText("high · fails on priority high or higher");
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

test.describe("report-2: the overview band of design 3A", () => {
  test("composite: the flagged figure, the grade chips, the waffle and gate.text as written", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await expect(overviewSurface(page).locator(".lead-num")).toHaveText("7");
    await expect(gradeChips(page)).toHaveText(["critical 3", "high 2", "medium 0", "low 2"]);
    await expect(waffleSquares(page)).toHaveCount(7);
    await expect(gateLine(page)).toHaveText(
      "gate: fails · --fail-on=high · 5 findings fail it · target php 8.4 (--target-php)",
    );
  });

  test("composite: one flag bar per carried flag, split by grade, then the depth and accepted lines", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await expect(flagBars(page)).toHaveText([
      "abandoned 1 graded critical 1",
      "pinned 1 graded high 1",
      "left-behind 1 graded critical 1",
      "old-promise 3 graded critical 2 · high 1",
      "stale 2 graded high 2",
      "vulnerable 4 graded critical 2 · low 2",
    ]);
    const band = overviewSurface(page);
    await expect(band).toContainText("4 carry more than one flag · score model 1");
    await expect(band).toContainText(
      "1 of 7 flagged packages is named by no line of composer.json; the deepest, symfony/polyfill-intl-idn, sits 1 hop from the nearest line.",
    );
    await expect(band).toContainText("Accepted by the allowlist: none in flagged packages");
    await expect(severityChips(page)).toHaveText(["critical 1", "high 4", "medium 4", "unrated 2", "low 9"]);
  });

  for (const [name, chip, fragment] of [
    ["a grade chip", () => gradeChips, "verdict=critical"],
    ["a severity chip", () => severityChips, "sev=critical"],
  ] as const) {
    test(`composite: ${name} sets its filter in the address`, async ({ page }) => {
      await report.gotoReport2("composite");
      const button = chip()(page).filter({ hasText: /^critical/ });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => report.hash()).toContain(fragment);
    });
  }

  test("composite: a flag bar sets flag in the address", async ({ page }) => {
    await report.gotoReport2("composite");
    const stale = flagBars(page).filter({ hasText: /^stale/ });
    await stale.click();
    await expect(stale).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => report.hash()).toContain("flag=stale");
  });

  test("pagerfanta: nothing flagged says so, with no flag bar", async ({ page }) => {
    await report.gotoReport2("pagerfanta");
    await expect(overviewSurface(page)).toContainText("Nothing flagged in 1 package");
    await expect(flagBars(page)).toHaveCount(0);
  });

  for (const width of [1024, 1440]) {
    test(`a flag bar's split by grade keeps to two lines at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      // wallabag-2.6 carries 54 left-behind packages, so its longest bar wants the whole column.
      await report.gotoReport2("baselined-wallabag-2.6");
      const splits = flagBars(page).locator(".overview2-split");
      await expect(splits.first()).toBeVisible();
      const lines = await splits.evaluateAll((items) =>
        items.map((item) => {
          const lineHeight = parseFloat(getComputedStyle(item).lineHeight);
          return Math.round(item.getBoundingClientRect().height / lineHeight);
        }),
      );
      expect(lines.length).toBeGreaterThan(1);
      expect(Math.max(...lines)).toBeLessThanOrEqual(2);
    });
  }

  test("the band never overflows the page, 320px to 1920px", async ({ page }) => {
    for (const name of ["composite", "B-gate-list"]) {
      await report.gotoReport2(name);
      for (const width of [320, 390, 768, 1024, 1180, 1181, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${name} at ${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("composite: axe finds nothing on the band, light and dark", async ({ page }) => {
    await report.gotoReport2("composite");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect
        .poll(async () =>
          (await new AxeBuilder({ page }).include('[data-surface="overview"]').analyze()).violations.map(
            (v) => v.id,
          ),
        )
        .toEqual([]);
    }
  });

  test("the header keeps its short gate fact", async ({ page }) => {
    await report.gotoReport2("composite");
    await expect(page.locator("header .gate-fact")).toHaveText("this run fails · --fail-on=high");
  });
});

test.describe("report-2: on a phone the lead stays open, the tier folds", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("composite at 390px: chips and gate line are visible, the flag bars wait in the fold", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await expect(gradeChips(page).first()).toBeVisible();
    await expect(gateLine(page)).toBeVisible();
    await expect(flagBars(page).first()).toBeHidden();
    const summary = overviewSurface(page).locator("details.ledger-fold > summary");
    await expect(summary).toContainText("6 flags · 20 advisories · 17.9 libyears");
    await summary.click();
    await expect(flagBars(page).first()).toBeVisible();
  });
});
