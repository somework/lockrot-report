/**
 * The report-2 overview band (design 3A): the flagged figure, its chips and the waffle at every
 * width, with only the supporting tier folded on a phone, and the header's gate fact and its popover.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
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

  test("stale-accepted-dagger: nothing flagged says so, with no flag bar", async ({ page }) => {
    await report.gotoReport2("stale-accepted-dagger");
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

  test("at 1024×768 the tier sits in columns, side by side under the lead, not in a stack", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await report.gotoReport2("baselined-wallabag-2.6");
    const blocks = await overviewSurface(page)
      .locator(".ledger-tier > .ledger-block")
      .evaluateAll((items) =>
        items.map((item) => {
          const { left, top } = item.getBoundingClientRect();
          return { left: Math.round(left), top: Math.round(top) };
        }),
      );

    expect(blocks).toHaveLength(3);
    expect(new Set(blocks.map((block) => block.top)).size).toBe(1);
    expect(new Set(blocks.map((block) => block.left)).size).toBe(3);
  });

  test("a run told --fail-on=none reads 'no gate' in the header", async () => {
    await report.gotoReport2("B-gate-none");
    expect(await report.gateFactLabel()).toMatch(/^no gate/i);
  });

  test("the gate fact opens its popover on click, with the exact stated text", async () => {
    await report.gotoReport2("B-gate-none");
    expect(await report.isGateFactOpen()).toBe(false);
    await report.openGateFact();
    expect(await report.isGateFactOpen()).toBe(true);
    expect(await report.gateFactPopoverText()).toBe(
      "This run was told --fail-on=none: it fails on no finding, and this page lists what it saw. Pass --fail-on=<grade> in CI to make the run fail on findings graded at or above that grade.",
    );
  });

  test("Escape closes the popover, and over an open detail only the popover, not the detail under it", async () => {
    // One Escape must close only the popover. A second one then reaches the detail, the same chain as
    // when there is no popover at all (keyboard.ts#decideEscape).
    await report.gotoReport2("B-gate-none");
    const first = (await report.rows())[0];
    if (first === undefined) throw new Error("B-gate-none lists no row");
    await report.openPackage(first);
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
