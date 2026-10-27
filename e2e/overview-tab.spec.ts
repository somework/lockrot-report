/**
 * The Overview tab (PD-OVERVIEW-1 to PD-OVERVIEW-8, DESIGN.md §4 rule R1 and §8 Keyboard): the view
 * an empty fragment opens, its layout at 1440 and 390, its links and its keys.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { gradeLine, overviewSurface, weighsMost } from "./support/report2/overview";
import { findingsRows } from "./support/report2/findings";

const WALLABAG = "baselined-wallabag-2.6";

function selectedTab(page: Page) {
  return page.getByRole("tab", { selected: true });
}

test.describe("rule R1: the view a fragment opens", () => {
  test("an empty fragment opens Overview and writes no fragment", async ({ page }) => {
    await page.goto(report2Url("composite"));

    await expect(selectedTab(page)).toHaveText(/^Overview/);
    await expect(overviewSurface(page)).toBeVisible();
    await expect(page.locator("[data-pkg]")).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  for (const [fragment, rows] of [
    ["#verdict=critical", 4],
    ["#flag=stale", 3],
    ["#q=symfony", 6],
    ["#pkg=symfony%2Fdebug", 9],
  ] as const) {
    test(`${fragment}, a list key with no view, opens Findings as on rc.1`, async ({ page }) => {
      await page.goto(report2Url("composite") + fragment);

      await expect(selectedTab(page)).toHaveText(/^Findings/);
      await expect(findingsRows(page)).toHaveCount(rows);
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
  test("at 1440 the lead holds the Security summary above the fold, then Weighs most, Flags beside Libyears, and exposure", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url(WALLABAG));

    const box = async (part: string) => {
      const found = await overviewSurface(page).locator(`.${part}`).boundingBox();
      if (found === null) throw new Error(`no ${part}`);
      return found;
    };
    const [lead, security, weighs, flags, libyears, expo] = await Promise.all(
      ["ov-lead", "ov-lead-security", "ov-weighs", "ov-flags", "ov-libyears", "ov-expo"].map(box),
    );
    // The Security summary is part of the lead, in view without a scroll.
    expect(lead?.y).toBeLessThan(900);
    expect(security?.y).toBeGreaterThanOrEqual(lead?.y ?? Infinity);
    expect((security?.y ?? Infinity) + (security?.height ?? Infinity)).toBeLessThanOrEqual(
      (lead?.y ?? 0) + (lead?.height ?? 0),
    );
    expect(security?.y).toBeLessThan(900);
    // Weighs most spans the width under the lead, then Flags sit beside Libyears, then exposure.
    expect(weighs?.y).toBeGreaterThanOrEqual((lead?.y ?? 0) + (lead?.height ?? 0));
    expect(weighs?.width).toBeGreaterThan((flags?.width ?? 0) * 1.5);
    expect(flags?.y).toBeGreaterThanOrEqual((weighs?.y ?? 0) + (weighs?.height ?? 0));
    expect(libyears?.y).toBe(flags?.y);
    expect(flags?.x).toBeLessThan(libyears?.x ?? 0);
    expect(expo?.y).toBeGreaterThanOrEqual((flags?.y ?? 0) + (flags?.height ?? 0));
  });

  test("at 390 the parts stack in reading order, with nothing folded and no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report2Url(WALLABAG));

    const tops = await overviewSurface(page)
      .locator(":scope > :not(.vh)")
      .evaluateAll((parts) =>
        parts.map((part): [string, number] => [
          part.getAttribute("class") ?? "",
          part.getBoundingClientRect().top,
        ]),
      );
    expect(tops.map(([name]) => name)).toEqual([
      "ov-lead",
      "ov-weighs",
      "ov-flags",
      "ov-libyears",
      "ov-expo",
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
      .getByRole("link", { name: "critical 4" })
      .click();

    await expect(selectedTab(page)).toHaveText(/^Findings/);
    await expect(findingsRows(page)).toHaveCount(4);
    expect(await page.evaluate(() => location.hash)).toBe("#view=findings&verdict=critical");
    await expect(page.getByRole("tabpanel")).toBeFocused();
  });

  test("a flag bar, a Weighs most row and an exposure bar each carry the fragment they open", async ({
    page,
  }) => {
    await page.goto(report2Url("composite"));
    const band = overviewSurface(page);

    await expect(band.getByRole("link", { name: /^stale 3/ })).toHaveAttribute(
      "href",
      "#view=findings&flag=stale",
    );
    await expect(weighsMost(page).getByRole("link", { name: "symfony/debug" })).toHaveAttribute(
      "href",
      "#view=findings&pkg=symfony%2Fdebug",
    );
    // The bars are a drawing: no target in them.
    await expect(weighsMost(page).locator(".wm-bar a, .wm-bar [tabindex]")).toHaveCount(0);
    await expect(band.getByRole("link", { name: "guzzlehttp/guzzle 1 flagged package" })).toHaveAttribute(
      "href",
      "#view=radius&pkg=guzzlehttp%2Fguzzle",
    );
  });

  test("Weighs most draws the 10 highest scores and links the rest to Findings", async ({ page }) => {
    await page.goto(report2Url(WALLABAG));

    await expect(weighsMost(page).locator("ol > li")).toHaveCount(10);
    await expect(weighsMost(page).locator(".wm-bar[aria-hidden=true]")).toHaveCount(10);
    const rest = weighsMost(page).getByRole("link", { name: /more flagged packages hold \d+ points/ });
    await expect(rest).toHaveAttribute("href", "#view=findings");
  });

  test("the Findings strip leads back to Overview", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=findings");

    await page.locator(".f2-strip").getByRole("link", { name: "Overview" }).click();

    await expect(selectedTab(page)).toHaveText(/^Overview/);
    expect(await page.evaluate(() => location.hash)).toBe("");
  });
});

test.describe("one shell choice for the page (R4-30)", () => {
  test("a pick in one Ready to run box changes every box on the page", async ({ page }) => {
    await page.goto(report2Url("mc-composite-dagger"));
    const boxes = overviewSurface(page).locator(".ov-cmd");
    await expect(boxes).toHaveCount(3);

    await boxes.nth(1).getByRole("button", { name: "Shell: POSIX" }).click();
    await boxes
      .nth(1)
      .getByRole("menuitemradio", { name: /^cmd\.exe/ })
      .click();

    for (const box of await boxes.all()) {
      await expect(box.getByRole("button", { name: "Shell: cmd.exe" })).toBeVisible();
      await expect(box.locator(".d2-copy-cmd")).not.toContainText("'");
    }
  });
});

test.describe("keys on Overview", () => {
  test("/, j and k do nothing: no key moves the reader to another tab", async ({ page }) => {
    await page.goto(report2Url("composite"));
    await expect(overviewSurface(page)).toBeVisible();

    for (const key of ["j", "k", "/"]) {
      await page.keyboard.press(key);
      await expect(page.locator(".shell-detail")).toHaveCount(0);
      await expect(selectedTab(page)).toHaveText(/^Overview/);
    }
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  test("the grade of the grade line takes focus with a visible ring and opens Findings under it on Enter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(report2Url(WALLABAG));
    const chip = gradeLine(page).getByRole("link", { name: "critical" });

    await chip.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(chip).toBeFocused();
    expect(await chip.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    const box = await chip.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);

    await page.keyboard.press("Enter");
    await expect(selectedTab(page)).toHaveText(/^Findings/);
    expect(await page.evaluate(() => location.hash)).toBe("#view=findings&verdict=critical");
  });
});

test.describe("the project grade", () => {
  test("the grade line is the first line of the lead, read before the waffle", async ({ page }) => {
    await page.goto(report2Url(WALLABAG));

    await expect(gradeLine(page)).toHaveText(
      "Project grade: critical · 15 critical findings · 84 of 210 packages high or worse · 46 known to the baseline",
    );
    const before = await gradeLine(page).evaluate(
      (line) =>
        line.compareDocumentPosition(document.querySelector(".waffle") as Node) ===
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(before).toBe(true);
  });

  test("at 375 each date in Furthest behind stays on one line", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(report2Url(WALLABAG));

    const lines = await overviewSurface(page)
      .locator(".ov-ly-release")
      .evaluateAll((cells) =>
        cells.flatMap((cell) => {
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          const found: [string, number][] = [];
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const match = /\d{4}-\d{2}-\d{2}/.exec(node.textContent ?? "");
            if (match === null) continue;
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
            found.push([match[0], tops.size]);
          }
          return found;
        }),
      );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter(([, count]) => count !== 1)).toEqual([]);
  });

  test("nothing scrolls sideways at 320", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(report2Url(WALLABAG));
    await expect(weighsMost(page)).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

for (const width of [1440, 390]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Overview passes axe with WCAG 2.2 AA at ${String(width)}px in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(report2Url(WALLABAG));
      await expect(overviewSurface(page)).toBeVisible();

      const ids = async (builder: AxeBuilder) =>
        (await builder.analyze()).violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`),
        );

      // axe's default rules, then WCAG 2.2 AA, whose target-size rule the default set leaves out.
      expect(await ids(new AxeBuilder({ page }))).toEqual([]);
      expect(await ids(new AxeBuilder({ page }).withTags(["wcag22aa"]))).toEqual([]);
    });
  }
}
