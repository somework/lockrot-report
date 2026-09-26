/**
 * PD-PACKAGES-1/2/3, PD-RAIL-2/3/4, PD-PROSE-1 (DESIGN.md §5): the All packages list stacks its rows
 * on a phone instead of clipping a table, keys its libyears marks once and draws signals as dots on a
 * wide screen; the rail counts under the other filters and hides what would list nothing; the
 * active-filters line removes one filter at a time; a package named in a sentence opens it.
 * Class selectors where the question is this implementation's own geometry, as
 * `packages-table-width.spec.ts` explains.
 */
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

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
  test.describe(`${width}px: PD-PACKAGES-3, stacked rows`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every row is two lines (three with a long name) inside the list, nothing clipped or scrolled sideways", async ({
      page,
    }) => {
      await report.goto(FIXTURES.wallabag);
      await report.tab("packages");
      await noPageOverflow(page);

      const wrap = page.locator(".tablewrap");
      const [scroll, client] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);

      const rows = page.locator(".pk-table tbody tr");
      const first = rows.first();
      expect(await first.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
      // Name and version, then the verdict, the libyears mark and the way in — no signals, no date.
      await expect(first.locator(".pk-name")).toBeVisible();
      await expect(first.locator(".pk-ver")).toBeVisible();
      await expect(first.locator(".pk-verdict")).toBeVisible();
      await expect(first.locator(".pk-reach")).toBeVisible();
      await expect(first.locator(".pk-sig")).toBeHidden();

      // Each of the first rows stays within the list's width and is no taller than three lines.
      const boxes = await rows.evaluateAll((els) =>
        els.slice(0, 20).map((el) => {
          const r = el.getBoundingClientRect();
          return { right: r.right, height: r.height };
        }),
      );
      const wrapRight = (await wrap.boundingBox())?.x ?? 0;
      const wrapWidth = (await wrap.boundingBox())?.width ?? 0;
      for (const box of boxes) {
        expect(box.right).toBeLessThanOrEqual(wrapRight + wrapWidth + 0.5);
        expect(box.height).toBeLessThanOrEqual(84);
      }
    });

    test("a tap on a stacked row still opens its package", async () => {
      await report.goto(FIXTURES.wallabag);
      await report.tab("packages");
      await report.openPackage("hoa/compiler");
      expect((await report.detail()).name).toBe("hoa/compiler");
    });
  });
}

test.describe("1440px: PD-PACKAGES-1/2 on the table", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keys the libyears dash once and draws signals as ten dots under a 1…10 caption", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
    await report.tab("packages");

    await expect(page.locator(".pk-answer")).toContainText("could not be measured");
    await expect(page.locator(".pk-key")).toContainText("not behind its newest stable");
    // The old repeated phrase is no longer drawn on any row: what a cell shows, its words for a
    // screen reader aside, is a number or a one-character mark.
    const drawn = await page.locator(".pk-table tbody .pk-ly").evaluateAll((cells) =>
      cells.map((c) => {
        const copy = c.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".vh").forEach((vh) => {
          vh.remove();
        });
        return copy.textContent.trim();
      }),
    );
    expect(drawn.filter((text) => text.length > 5)).toEqual([]);
    expect(drawn).toContain("—");

    await expect(page.locator("th .ly-axis")).toBeVisible();
    await expect(page.locator("th .sig-axis i")).toHaveCount(10);
    const dots = await page.locator(".pk-table tbody tr").first().locator(".sig-dot").count();
    expect(dots).toBe(10);
    await noPageOverflow(page);
  });
});

test.describe("PD-RAIL-2/4: counts under the other filters, and the active-filters line", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("selecting Direct recounts every other row and hides Transitive; its chip takes it off again", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabag);
    expect(await report.railOptionPressed("scope", "transitive")).toBe(false);

    await report.railOption("scope", "direct");
    // Direct and Transitive together list nothing, so Transitive is no longer offered.
    expect(await report.railOptionPressed("scope", "transitive")).toBeNull();
    for (const row of await report.railRows()) {
      if (row.label === "Direct") continue; // on already: toggling it would turn it off
      await report.toggleRailRow(row.label);
      expect(await report.listedPackageCount(), row.label).toBe(row.count);
      await report.toggleRailRow(row.label);
    }

    const chips = page.getByRole("group", { name: "Filtered by" }).getByRole("button");
    await expect(chips).toHaveCount(1);
    await chips.first().click();
    await expect(page.getByRole("group", { name: "Filtered by" })).toHaveCount(0);
    expect(await report.railOptionPressed("scope", "transitive")).toBe(false);
    // The chip that had focus is gone; focus goes to the search box, not to the page.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("type"))).toBe("search");
  });

  test("a search is a chip of its own, and removing it leaves the rail's filters on", async ({ page }) => {
    await report.goto(FIXTURES.wallabag);
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
      await report.goto(FIXTURES.wallabag);
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

test.describe("PD-PROSE-1: a package named in a sentence opens it", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the detail's answer names the requirement it comes through, one click from its own detail", async ({
    page,
  }) => {
    await report.goto(FIXTURES.wallabag);
    await report.openPackage("hoa/compiler");
    await page
      .locator(".detail-answer")
      .getByRole("button", { name: "wallabag/rulerz", exact: true })
      .click();
    expect((await report.detail()).name).toBe("wallabag/rulerz");
    expect(decodeURIComponent(await report.hash())).toContain("pkg=wallabag/rulerz");
  });
});
