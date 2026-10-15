/**
 * PD-A11Y-SWEEP-1..3 (DESIGN.md §5): what a cross-cutting sweep of every tab — 768 and 1024, light
 * at 1440, forced colours, keyboard only, the names a screen reader reads — found and fixed.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, report2Url } from "./support/pages";

async function load(page: Page, fixture: string, hash = ""): Promise<void> {
  await page.goto(pageUrl(fixture as never) + (hash ? "#" + hash : ""));
  await expect(page.getByRole("tab").first()).toBeVisible();
}

/** Each tab's underline colour, in tab order, and which of them is selected. */
async function underlines(page: Page): Promise<{ selected: boolean; color: string }[]> {
  return page.getByRole("tab").evaluateAll((tabs) =>
    tabs.map((tab) => ({
      selected: tab.getAttribute("aria-selected") === "true",
      color: getComputedStyle(tab).borderBottomColor,
    })),
  );
}

test.describe("PD-A11Y-SWEEP-1: the selected tab stays marked in forced colours", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`only the selected tab carries an underline distinct from the page, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      await load(page, FIXTURES.wallabag, "view=radius");
      // The forced palette's own page colour, read off a probe rather than `body`: WebKit's
      // emulation keeps the page's authored background on `body` while it repaints borders in the
      // system colours, so `body` is not what an idle underline has to match there.
      const canvas = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.color = "Canvas";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      const lines = await underlines(page);
      const selected = lines.filter((line) => line.selected);
      const idle = lines.filter((line) => !line.selected);

      expect(selected).toHaveLength(1);
      // Before the fix every tab's transparent underline was repainted in the text colour, so all
      // five wore the same rule and none read as the current one.
      expect(idle.every((line) => line.color === canvas)).toBe(true);
      expect(selected[0]?.color).not.toBe(canvas);
    });
  }
});

test.describe("PD-A11Y-SWEEP-2: tab names keep the label and its count apart", () => {
  test("each tab's name is 'label count', never the two run together", async ({ page }) => {
    await load(page, FIXTURES.wallabag);
    await expect(page.getByRole("tab", { name: "Findings 69", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "All packages 271", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Run data", exact: true })).toBeVisible();
  });
});

test.describe("PD-A11Y-SWEEP-3: widgets that share a word are named apart", () => {
  test("the summary band's priority and advisory-severity chips sit in their own named groups", async ({
    page,
  }) => {
    await load(page, FIXTURES.wallabag);
    const ledger = page.getByRole("group", { name: "Ledger" });
    await expect(
      ledger.getByRole("group", { name: "Priority" }).getByRole("button", { name: /^high 38$/ }),
    ).toBeVisible();
    await expect(
      ledger.getByRole("group", { name: "Advisory severity" }).getByRole("button", { name: /^high 1$/ }),
    ).toBeVisible();
  });

  test("the All packages table has a name, and a sort button's name carries no arrow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await load(page, FIXTURES.mautic, "view=packages");
    const table = page.getByRole("table", { name: "All packages" });
    await expect(table).toBeVisible();
    const sorted = table.locator('[role="columnheader"][aria-sort="ascending"]');
    await expect(sorted).toHaveCount(1);
    await expect(sorted.getByRole("button")).toHaveAccessibleName("Verdict");
    // The arrow is still drawn for the eye.
    await expect(sorted.getByRole("button")).toContainText("↑");
  });
});

test.describe("report-2: the sweep over every tab", () => {
  const CASE = "composite";

  for (const colorScheme of ["light", "dark"] as const) {
    test(`only the selected tab carries an underline distinct from the page in forced colours, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      await page.goto(report2Url(CASE) + "#view=radius");
      await expect(page.getByRole("tab").first()).toBeVisible();
      const lines = await underlines(page);
      const selected = lines.filter((line) => line.selected);
      expect(selected).toHaveLength(1);
      expect(
        new Set(lines.filter((line) => !line.selected).map((line) => line.color)).has(
          selected[0]?.color ?? "",
        ),
      ).toBe(false);
    });
  }

  test("each tab's name is 'label count'", async ({ page }) => {
    await page.goto(report2Url(CASE));
    // composite: 7 graded findings, 20 counted advisories, 7 packages, 1 exposure row.
    for (const name of ["Findings 7", "Advisories 20", "All packages 7", "Blast radius 1", "Run data"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }
  });

  test("the grade chips and the advisory-severity chips sit in their own named groups", async ({ page }) => {
    await page.goto(report2Url(CASE));
    const band = page.locator('[data-surface="overview"]');
    await expect(
      band.getByRole("group", { name: "Grade" }).getByRole("button", { name: /^high 2$/ }),
    ).toBeVisible();
    await expect(
      band.getByRole("group", { name: "Advisories by severity" }).getByRole("button", { name: /^high 4$/ }),
    ).toBeVisible();
  });

  for (const view of ["findings", "advisories", "packages", "radius", "run"] as const) {
    test(`axe finds no violation on ${view}`, async ({ page }) => {
      await page.goto(`${report2Url(CASE)}#view=${view}`);
      await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();
      const results = await new AxeBuilder({ page }).include(`[data-surface="${view}"]`).analyze();
      expect(
        results.violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`)),
      ).toEqual([]);
    });
  }
});
