/**
 * The report-2 summary band on the Overview tab (PD-OVERVIEW-1, PD-OVERVIEW-2): the flagged figure,
 * its chips and the waffle, the blocks under them unfolded at every width, the Findings strip, and
 * the header's gate fact and its popover.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { pageGolden } from "./support/report2/page-goldens";
import type { Page } from "@playwright/test";
import {
  figureLine,
  flagBars,
  gateLine,
  gradeChips,
  gradeLine,
  overviewSurface,
  stripChips,
  waffleSquares,
} from "./support/report2/overview";

/** The Security block's severity chips on Overview, each a link to Advisories. */
const overviewSeverities = (page: Page) =>
  overviewSurface(page).getByRole("group", { name: "Advisories by severity" }).getByRole("link");

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("report-2: the summary band on Overview", () => {
  test("composite: the grade line, the figure line, the grade chips, the waffle and gate.text", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    const golden = pageGolden("composite");
    await expect(gradeLine(page)).toHaveText(golden.grade_line);
    await expect(gradeLine(page)).toHaveText(
      "Project grade: critical · 4 critical findings · 6 of 9 packages high or worse",
    );
    await expect(figureLine(page)).toHaveText(golden.figure_line);
    // A grade nothing holds draws no chip.
    await expect(gradeChips(page)).toHaveText(golden.grade_chips);
    await expect(gradeChips(page)).toHaveText(["critical 4", "high 2", "low 3"]);
    await expect(waffleSquares(page)).toHaveCount(9);
    await expect(gateLine(page)).toHaveText(
      "gate: fails · --fail-on=high · 6 findings fail it · target php 8.4 (--target-php)",
    );
  });

  test("composite: one flag bar per carried flag, split by grade, with its points, then the notes", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await expect(flagBars(page)).toHaveText([
      "abandoned 1 graded critical 1 32 pts",
      "pinned 1 graded high 1 16 pts",
      "left-behind 2 graded critical 2 32 pts",
      "old-promise 3 graded critical 2 · high 1 24 pts",
      "stale 3 graded high 2 · low 1 8 pts",
      "vulnerable 5 graded critical 3 · low 2 68 pts",
    ]);
    const band = overviewSurface(page);
    const golden = pageGolden("composite");
    for (const note of golden.flags_notes) await expect(band).toContainText(note);
    await expect(band).toContainText(golden.depth.sentence ?? "");
    await expect(overviewSeverities(page)).toHaveText([
      "critical 1",
      "high 5",
      "medium 12",
      "unrated 2",
      "low 9",
    ]);
  });

  for (const [name, chip, fragment] of [
    ["a grade chip", () => gradeChips, "#view=findings&verdict=critical"],
    ["a severity chip", () => overviewSeverities, "#view=advisories&sev=critical"],
  ] as const) {
    test(`composite: ${name} opens its list with its filter in the address`, async ({ page }) => {
      await report.gotoReport2("composite");
      await chip()(page)
        .filter({ hasText: /^critical/ })
        .click();
      await expect.poll(() => report.hash()).toBe(fragment);
      await expect(overviewSurface(page)).toHaveCount(0);
    });
  }

  test("composite: a flag bar opens Findings with flag in the address", async ({ page }) => {
    await report.gotoReport2("composite");
    await flagBars(page)
      .filter({ hasText: /^stale/ })
      .click();
    await expect.poll(() => report.hash()).toBe("#view=findings&flag=stale");
    expect(await report.rows()).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "friendsofsymfony/oauth2-php",
    ]);
  });

  test("composite: a grade chip of the Findings strip sets verdict in place", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    const chip = stripChips(page).filter({ hasText: /^critical/ });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => report.hash()).toBe("#view=findings&verdict=critical");
  });

  test("stale-accepted-dagger: nothing flagged says so, with no flag bar", async ({ page }) => {
    await report.gotoReport2("stale-accepted-dagger");
    await expect(gradeLine(page)).toHaveText(/^Project grade: nothing flagged/);
    await expect(figureLine(page)).toHaveText(/^0 of 1 package flagged · /);
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

  test("Overview and the Findings strip never overflow the page, 320px to 1920px", async ({ page }) => {
    for (const [name, hash] of [
      ["composite", ""],
      ["B-gate-list", ""],
      ["baselined-wallabag-2.6", ""],
      ["composite", "view=findings"],
    ] as const) {
      await report.gotoReport2WithHash(name, hash);
      for (const width of [320, 390, 768, 1024, 1180, 1181, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        // WebKit answers a forced layout right after a resize from stale container-query sizes; the
        // page is judged once it settles.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
            message: `${name} #${hash} at ${width}px`,
          })
          .toBeLessThanOrEqual(0);
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

  test("at 1024×768 the flags and Libyears sit side by side under Weighs most, not in a stack", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await report.gotoReport2("baselined-wallabag-2.6");
    const blocks = await overviewSurface(page)
      .locator(":scope > .ov-flags, :scope > .ov-libyears")
      .evaluateAll((items) =>
        items.map((item) => {
          const { left, top } = item.getBoundingClientRect();
          return { left: Math.round(left), top: Math.round(top) };
        }),
      );

    expect(blocks).toHaveLength(2);
    expect(new Set(blocks.map((block) => block.top)).size).toBe(1);
    expect(new Set(blocks.map((block) => block.left)).size).toBe(2);
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
    await report.gotoReport2WithHash("B-gate-none", "view=findings");
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

test.describe("report-2: the band lives on Overview, unfolded", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("composite at 1440px: chips, gate line, flag bars and severity chips are visible at once", async ({
    page,
  }) => {
    await report.gotoReport2("composite");
    await expect(gradeChips(page).first()).toBeVisible();
    await expect(gateLine(page)).toBeVisible();
    await expect(overviewSurface(page).locator("details")).toHaveCount(0);
    await expect(flagBars(page).first()).toBeVisible();
    await expect(overviewSeverities(page).first()).toBeVisible();
  });

  for (const view of ["findings", "advisories", "packages", "radius"] as const) {
    test(`wallabag-2.6 at 1440×900: the first ${view} row starts on the first screen`, async ({ page }) => {
      await report.gotoReport2WithHash("baselined-wallabag-2.6", `view=${view}`);
      const row = page.locator(".shell-main [data-pkg]").first();
      await expect(row).toBeVisible();
      const top = await row.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(top).toBeLessThan(900);
    });
  }

  for (const view of ["findings", "advisories", "packages", "radius", "run"] as const) {
    test(`${view} carries no band, and Overview brings it back`, async ({ page }) => {
      await report.gotoReport2WithHash("composite", `view=${view}`);
      await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();
      await expect(overviewSurface(page)).toHaveCount(0);
      await page.getByRole("tab", { name: "Overview" }).click();
      await expect(gradeChips(page).first()).toBeVisible();
    });
  }
});

test.describe("report-2: on a phone Overview is one column, nothing folded", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("composite at 390px: chips, gate line and flag bars are visible", async ({ page }) => {
    await report.gotoReport2("composite");
    await expect(gradeChips(page).first()).toBeVisible();
    await expect(gateLine(page)).toBeVisible();
    await flagBars(page).first().scrollIntoViewIfNeeded();
    await expect(flagBars(page).first()).toBeVisible();
  });

  test("the Findings strip keeps the grade chips one tap away above the folded rail", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await expect(stripChips(page)).toHaveText(["critical 4", "high 2", "low 3"]);
    const strip = await page.locator(".f2-strip").boundingBox();
    const rail = await page.locator(".rail-fold").boundingBox();
    expect((strip?.y ?? 0) + (strip?.height ?? 0)).toBeLessThanOrEqual(rail?.y ?? 0);
  });
});
