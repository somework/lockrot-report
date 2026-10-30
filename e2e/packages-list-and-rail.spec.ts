/**
 * The All packages list stacks its rows on a phone instead of clipping a table; the rail counts under
 * the other filters and hides what would list nothing; the active-filters line removes one filter at
 * a time. Class selectors where the question is this implementation's own geometry, as
 * `packages-table-width.spec.ts` explains.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import {
  packagesCell,
  packagesCellLabel,
  packagesColumn,
  packagesRow,
  packagesSurface,
  sortPackagesBy,
} from "./support/report2/packages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

async function noPageOverflow(page: Page): Promise<void> {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
}

for (const width of [320, 390, 480] as const) {
  test.describe(`${width}px: stacked rows`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every row stays inside the list, nothing clipped or scrolled sideways", async ({ page }) => {
      await report.gotoReport2WithHash("baselined-wallabag-main", "view=packages");
      await noPageOverflow(page);

      const wrap = packagesSurface(page).locator(".tablewrap");
      const [scroll, client] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);

      const rows = packagesSurface(page).locator("tbody tr[data-pkg]");
      expect(await rows.first().evaluate((el) => getComputedStyle(el).display)).toBe("grid");
      const rights = await rows.evaluateAll((els) =>
        els
          .slice(0, 20)
          .map((el) => ({ pkg: el.getAttribute("data-pkg"), right: el.getBoundingClientRect().right })),
      );
      const wrapBox = await wrap.boundingBox();
      for (const { pkg, right } of rights) {
        expect(right, pkg ?? "").toBeLessThanOrEqual((wrapBox?.x ?? 0) + (wrapBox?.width ?? 0) + 0.5);
      }
    });

    test("in forced colours the grade is a word in the row, not only a rule in one ink", async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await report.gotoReport2WithHash("composite", "view=packages");

      expect(await packagesCell(page, "twig/twig", "verdict")).toBe("critical");
      await noPageOverflow(page);
    });
  });
}

test("one tap on Libyears answers which package is furthest behind", async ({ page }) => {
  await report.gotoReport2WithHash("baselined-wallabag-main", "view=packages");

  await sortPackagesBy(page, "Libyears");

  const measured = (await packagesColumn(page, "ly"))
    .map((text) => Number(/\d+\.\d+/.exec(text)?.[0] ?? Number.NaN))
    .filter((value) => !Number.isNaN(value));
  expect(measured.length).toBeGreaterThan(1);
  expect(measured[0]).toBe(Math.max(...measured));
});

// Wherever the list is narrower than the table, rows stack two lines each instead of the table
// scrolling sideways. The cells' screen-reader words are placed absolutely; with a static wrap they
// were placed against the page, so the whole page scrolled sideways.
for (const width of [600, 768, 900, 1024, 1181] as const) {
  test(`${width}px: two-line rows, nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["composite", "baselined-wallabag-main"]) {
      await report.gotoReport2WithHash(name, "view=packages");
      await noPageOverflow(page);

      const wrap = packagesSurface(page).locator(".tablewrap");
      const [scroll, client] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);
      // Nothing scrolls, so nothing is announced as a scroller.
      expect(await wrap.getAttribute("role")).toBeNull();
      const first = packagesSurface(page).locator("tbody tr[data-pkg]").first();
      expect(await first.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    }
  });
}

test.describe("1280px: the list keeps its stacked rows and nothing scrolls sideways", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the wrap fits and the rows are still the two-line grid", async ({ page }) => {
    for (const name of ["composite", "baselined-wallabag-main"]) {
      await report.gotoReport2WithHash(name, "view=packages");
      const wrap = packagesSurface(page).locator(".tablewrap");
      const [scroll, client] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);
      await noPageOverflow(page);
      const first = packagesSurface(page).locator("tbody tr[data-pkg]").first();
      expect(await first.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    }
  });
});

test.describe("a table wider than its wrap is a region a keyboard can scroll", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the wrap takes focus, is named, and the arrow keys scroll it", async ({ page, browserName }) => {
    await report.gotoReport2WithHash("composite", "view=packages");
    const wrap = packagesSurface(page).locator(".tablewrap");
    expect(await wrap.getAttribute("tabindex")).toBeNull();

    // Stand in for a lock whose names are longer than any fixture's: the table outgrows the wrap
    // (CSSOM, which the page's CSP allows).
    await packagesSurface(page)
      .locator("table")
      .evaluate((el) => {
        (el as HTMLElement).style.minWidth = "2400px";
      });
    const region = page.getByRole("region", { name: "All packages table, scrolls sideways" });
    await expect(region).toHaveAttribute("tabindex", "0");
    await region.focus();
    await expect(region).toBeFocused();
    // What the page owes is a named, focusable region; the scrolling is the browser's own. WebKit
    // does it unreliably, so only Chromium and Firefox check the scroll itself.
    if (browserName === "webkit") return;
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("End");
    await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });
});

test.describe("PD-RAIL-2/4: counts under the other filters, and the active-filters line", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** The accepted toggle filters no package: its count is the rows whose pills it hides. */
  const countedRows = async () =>
    (await report.railRows()).filter((row) => row.label !== "Hide accepted flags");

  test("selecting Direct recounts every other row and hides Transitive; its chip takes it off again", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    expect(await report.railOptionPressed("scope", "transitive")).toBe(false);

    await report.railOption("scope", "direct");
    // Direct and Transitive together list nothing, so Transitive is no longer offered.
    expect(await report.railOptionPressed("scope", "transitive")).toBeNull();
    for (const row of await countedRows()) {
      if (row.label === "Direct") continue; // on already: toggling it would turn it off
      await report.toggleRailRow(row.label, row.group);
      expect(await report.listedPackageCount(), row.label).toBe(row.count);
      await report.toggleRailRow(row.label, row.group);
    }

    const chips = page.getByRole("group", { name: "Filtered by" }).getByRole("button");
    await expect(chips).toHaveCount(1);
    await chips.first().click();
    await expect(page.getByRole("group", { name: "Filtered by" })).toHaveCount(0);
    expect(await report.railOptionPressed("scope", "transitive")).toBe(false);
    // The chip that had focus is gone; focus goes to the search box, not to the page.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("type"))).toBe("search");
  });

  test("PD-RAIL-6: the Severity and Fix groups list the packages their rows count", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    const severity = page.getByRole("group", { name: "Severity", exact: true });
    const fix = page.getByRole("group", { name: "Fix", exact: true });
    await expect(severity.getByRole("button")).toHaveText([
      /^\s*critical \d+$/,
      /^\s*high \d+$/,
      /^\s*medium \d+$/,
      /^\s*unrated \d+$/,
      /^\s*low \d+$/,
    ]);

    // SPEC §7.9.4's "By fix (packages)": composer update 2.
    await fix.getByRole("button", { name: /^composer update 2$/ }).click();

    expect(await report.listedPackageCount()).toBe(2);
    await expect(page).toHaveURL(/[#&]fix=update(&|$)/);
  });

  test("the Grade group sets verdict on a tab without the band, and an rc.1 fragment opens it pressed", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=advisories");
    const grade = page.getByRole("group", { name: "Filters" }).getByRole("group", { name: "Grade" });
    await grade.getByRole("button", { name: /^critical \d+$/ }).click();
    await expect(page).toHaveURL(/[#&]verdict=critical(&|$)/);
    // composite: `flags.vulnerable.by_verdict` holds 3 critical packages.
    expect(await report.listedPackageCount()).toBe(3);

    await report.gotoReport2WithHash("composite", "view=radius&prio=high");
    await expect(grade.getByRole("button", { name: /^high \d+$/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("with a second flag picked, every row counts what the list shows with it on", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.tab("packages");
    await report.railOption("scope", "direct");
    await report.toggleRailRow("stale");
    const listed = await report.listedPackageCount();
    for (const row of await countedRows()) {
      if (row.pressed) {
        expect(row.count, `${row.label} is on`).toBe(listed);
        continue;
      }
      await report.toggleRailRow(row.label, row.group);
      expect(await report.listedPackageCount(), row.label).toBe(row.count);
      await report.toggleRailRow(row.label, row.group);
    }
    // The chips say which filters are on; the count line does not repeat "2 filters on" on screen.
    await expect(page.locator(".count-line .active-filters")).toHaveCount(0);
  });

  test("a search's matched-in line wraps under the name instead of pushing the table past its wrap", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("baselined-wallabag-main", "view=packages");
    await report.search("symfony");
    const [scroll, client] = await packagesSurface(page)
      .locator(".tablewrap")
      .evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  });

  test("a search is a chip of its own, and removing it leaves the rail's filters on", async ({ page }) => {
    await report.gotoReport2WithHash("baselined-wallabag-main", "view=findings");
    await report.railOption("scope", "direct");
    await report.search("symfony");
    const chips = page.getByRole("group", { name: "Filtered by" }).getByRole("button");
    await expect(chips).toHaveCount(2);

    await page.getByRole("button", { name: "Remove filter: Search “symfony”" }).click();
    expect(await report.searchValue()).toBe("");
    expect(await report.railOptionPressed("scope", "direct")).toBe(true);
    await expect(chips).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Remove filter: Scope Direct" })).toBeFocused();
  });

  test("PD-RAIL-3: no rail label breaks over two lines at 1440 or 1024", async ({ page }) => {
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await report.gotoReport2WithHash("baselined-wallabag-main", "view=findings");
      const tall = await page
        .getByRole("group", { name: "Filters" })
        .getByRole("button")
        .evaluateAll((els) =>
          els.filter((el) => el.getBoundingClientRect().height > 30).map((el) => el.textContent.trim()),
        );
      expect(tall, `${width}px`).toEqual([]);
    }
  });
});

test.describe("report-2: the All packages table", () => {
  async function wrapFits(page: Page): Promise<void> {
    const [scroll, client] = await packagesSurface(page)
      .locator(".tablewrap")
      .evaluate((wrap) => [wrap.scrollWidth, wrap.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  }

  for (const name of ["composite", "baselined-wallabag-main"]) {
    test(`1440px, ${name}: the ten columns fit the wrap, nothing scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await report.gotoReport2WithHash(name, "view=packages");

      await wrapFits(page);
      await noPageOverflow(page);
    });
  }

  for (const width of [320, 390, 768] as const) {
    test(`${width}px: the rows stack inside the list, and a tap still opens a package`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await report.gotoReport2WithHash("composite", "view=packages");

      await expect(packagesRow(page, "twig/twig")).toHaveCSS("display", "grid");
      await wrapFits(page);
      await noPageOverflow(page);
      await packagesRow(page, "symfony/yaml").click();
      await expect(page).toHaveURL(/pkg=symfony%2Fyaml/);
    });
  }

  test("an unmeasured value is a dash that says its cause; a transitive one reads its hops", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=packages");

    expect(await packagesCell(page, "symfony/polyfill-intl-idn", "ly")).toBe("—");
    expect(await packagesCellLabel(page, "symfony/polyfill-intl-idn", "ly")).toBe("no date");
    expect(await packagesCell(page, "symfony/polyfill-intl-idn", "age")).toBe("—");
    expect(await packagesCell(page, "symfony/polyfill-intl-idn", "reach")).toBe("1 hop");
    expect(await packagesCell(page, "twig/twig", "verdict")).toBe("critical");
    expect(await packagesCell(page, "twig/twig", "score")).toBe("32");
  });

  test("a lower bound prints ≥ and says at least", async ({ page }) => {
    await report.gotoReport2WithHash("baselined-wallabag-main", "view=packages");

    const text = await packagesCell(page, "scheb/2fa-backup-code", "ly");
    expect(text).toMatch(/^≥ \d+\.\d\d$/);
    expect(await packagesCellLabel(page, "scheb/2fa-backup-code", "ly")).toBe(`at least ${text.slice(2)}`);
  });
});
