/**
 * PD-A11Y-SWEEP-1..3 (DESIGN.md §5): what a cross-cutting sweep of every tab — 768 and 1024, light
 * at 1440, forced colours, keyboard only, the names a screen reader reads — found and fixed.
 */
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl } from "./support/pages";

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
      const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const lines = await underlines(page);
      const selected = lines.filter((line) => line.selected);
      const idle = lines.filter((line) => !line.selected);

      expect(selected).toHaveLength(1);
      // Before the fix every tab's transparent underline was repainted in the text colour, so all
      // five wore the same rule and none read as the current one.
      expect(idle.every((line) => line.color === pageBg)).toBe(true);
      expect(selected[0]?.color).not.toBe(pageBg);
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
