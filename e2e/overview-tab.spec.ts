/**
 * The Overview tab (PD-OVERVIEW-1 to PD-OVERVIEW-7, DESIGN.md §4 rule R1 and §8 Keyboard): the view
 * an empty fragment opens, its layout at 1440 and 390, its links and its keys.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { overviewSurface } from "./support/report2/overview";

const WALLABAG = "baselined-wallabag-2.6";

function selectedTab(page: Page) {
  return page.getByRole("tab", { selected: true });
}

test.describe("rule R1: the view a fragment opens", () => {
  test("an empty fragment opens Overview and writes no fragment", async ({ page }) => {
    await page.goto(report2Url("composite"));

    await expect(selectedTab(page)).toHaveText(/^Overview/);
    await expect(overviewSurface(page)).toBeVisible();
    await expect(page.locator("li[data-pkg]")).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  for (const [fragment, rows] of [
    ["#verdict=critical", 3],
    ["#flag=stale", 2],
    ["#q=symfony", 5],
    ["#pkg=symfony%2Fdebug", 7],
  ] as const) {
    test(`${fragment}, a list key with no view, opens Findings as on rc.1`, async ({ page }) => {
      await page.goto(report2Url("composite") + fragment);

      await expect(selectedTab(page)).toHaveText(/^Findings/);
      await expect(page.locator('[data-surface="findings"] li[data-pkg]')).toHaveCount(rows);
      expect(await page.evaluate(() => location.hash)).toBe("#view=findings&" + fragment.slice(1));
    });
  }

  test("an explicit view opens that view, and an unknown one falls back by its other keys", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=overview");
    await expect(selectedTab(page)).toHaveText(/^Overview/);

    await page.goto(report2Url("composite") + "#view=bogus");
    await expect(selectedTab(page)).toHaveText(/^Overview/);

    await page.goto(report2Url("composite") + "#view=bogus&q=yaml");
    await expect(selectedTab(page)).toHaveText(/^Findings/);
  });
});

test.describe("the Overview layout", () => {
  test("at 1440 the lead, flags, Security and Libyears sit above the fold, in layout A", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url(WALLABAG));

    const box = async (part: string) => {
      const found = await overviewSurface(page).locator(`.ov-${part}`).boundingBox();
      if (found === null) throw new Error(`no ${part}`);
      return found;
    };
    const [lead, flags, security, libyears, score, expo] = await Promise.all(
      ["lead", "flags", "security", "libyears", "score", "expo"].map(box),
    );
    for (const part of [lead, flags, security, libyears]) expect(part?.y).toBeLessThan(900);
    // One row of three columns, then the score strip beside the exposure bars.
    expect(security?.y).toBe(flags?.y);
    expect(libyears?.y).toBe(flags?.y);
    expect(flags?.x).toBeLessThan(security?.x ?? 0);
    expect(security?.x).toBeLessThan(libyears?.x ?? 0);
    expect(score?.y).toBe(expo?.y);
    expect(score?.y).toBeGreaterThan(flags?.y ?? 0);
  });

  test("at 390 the parts stack in reading order, with nothing folded and no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report2Url(WALLABAG));

    const tops = await overviewSurface(page)
      .locator(":scope > *")
      .evaluateAll((parts) =>
        parts.map((part): [string, number] => [
          part.getAttribute("class") ?? "",
          part.getBoundingClientRect().top,
        ]),
      );
    expect(tops.map(([name]) => name)).toEqual([
      "ov-lead",
      "ov-flags",
      "ov-security",
      "ov-score",
      "ov-expo",
      "ov-libyears",
    ]);
    const ys = tops.map(([, top]) => top);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    await expect(overviewSurface(page).locator("details")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("the tab row keeps Overview at its start and in full view at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report2Url(WALLABAG));

    const tab = await selectedTab(page).boundingBox();
    expect(tab?.x).toBeGreaterThanOrEqual(0);
    expect((tab?.x ?? 0) + (tab?.width ?? 0)).toBeLessThanOrEqual(390);
  });
});

test.describe("from a chart to a list", () => {
  test("a grade chip opens Findings under that grade, in place, with focus on the panel", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));

    await overviewSurface(page)
      .getByRole("group", { name: "Grade" })
      .getByRole("link", { name: "critical 3" })
      .click();

    await expect(selectedTab(page)).toHaveText(/^Findings/);
    await expect(page.locator('[data-surface="findings"] li[data-pkg]')).toHaveCount(3);
    expect(await page.evaluate(() => location.hash)).toBe("#view=findings&verdict=critical");
    await expect(page.getByRole("tabpanel")).toBeFocused();
  });

  test("a flag bar, a score stack and an exposure bar each carry the fragment they open", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));
    const band = overviewSurface(page);

    await expect(band.getByRole("link", { name: /^stale 2/ })).toHaveAttribute(
      "href",
      "#view=findings&flag=stale",
    );
    await expect(band.getByRole("link", { name: "score 18: 2 high" })).toHaveAttribute(
      "href",
      "#view=findings&q=score%3A18",
    );
    await expect(band.getByRole("link", { name: "guzzlehttp/guzzle 1 flagged package" })).toHaveAttribute(
      "href",
      "#view=radius",
    );
  });

  test("the Findings strip leads back to Overview", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=findings");

    await page.locator(".f2-strip").getByRole("link", { name: "Overview" }).click();

    await expect(selectedTab(page)).toHaveText(/^Overview/);
    expect(await page.evaluate(() => location.hash)).toBe("");
  });
});

test.describe("keys on Overview", () => {
  test("/ opens Findings with its search box focused, and j opens nothing", async ({ page }) => {
    await page.goto(report2Url("composite"));
    await expect(overviewSurface(page)).toBeVisible();

    await page.keyboard.press("j");
    await expect(page.locator(".shell-detail")).toHaveCount(0);
    await expect(selectedTab(page)).toHaveText(/^Overview/);

    await page.keyboard.press("/");
    await expect(selectedTab(page)).toHaveText(/^Findings/);
    await expect(page.getByRole("searchbox")).toBeFocused();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Overview passes axe in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url(WALLABAG));
    await expect(overviewSurface(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
