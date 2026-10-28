/**
 * PD-A11Y-SWEEP-1..3 (DESIGN.md §5): what a cross-cutting sweep of every tab (forced colours, keyboard
 * only, the names a screen reader reads, axe at a phone, a tablet and a desktop width) found and fixed.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";

/** Each tab's underline colour, in tab order, and which of them is selected. */
async function underlines(page: Page): Promise<{ selected: boolean; color: string }[]> {
  return page.getByRole("tab").evaluateAll((tabs) =>
    tabs.map((tab) => ({
      selected: tab.getAttribute("aria-selected") === "true",
      color: getComputedStyle(tab).borderBottomColor,
    })),
  );
}

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
    // composite: 9 graded findings, 29 counted advisories, 9 packages, 2 exposure rows.
    for (const name of [
      "Overview",
      "Findings 9",
      "Advisories 29",
      "All packages 9",
      "Blast radius 2",
      "Run data",
    ]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }
  });

  test("the grade chips and the advisory-severity chips sit in their own named groups", async ({ page }) => {
    await page.goto(report2Url(CASE));
    const band = page.locator('[data-surface="overview"]');
    await expect(
      band.getByRole("group", { name: "Grade" }).getByRole("link", { name: /^high 2$/ }),
    ).toBeVisible();
    await expect(
      band.getByRole("group", { name: "Advisories by severity" }).getByRole("link", { name: /^high 5$/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Findings/ }).click();
    await expect(
      page
        .locator(".f2-strip")
        .getByRole("group", { name: "Grade" })
        .getByRole("button", { name: /^high 2$/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Advisories/ }).click();
    await expect(
      page
        .locator('[data-surface="advisories"]')
        .getByRole("group", { name: "Advisories by severity" })
        .getByRole("button", { name: /^high 5$/ }),
    ).toBeVisible();
  });

  test("the rail's Grade group and the band's grade chips sit in groups of their own landmarks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url(CASE) + "#view=findings");
    const rail = page.getByRole("group", { name: "Filters" });
    await expect(rail.getByRole("group", { name: "Grade" }).getByRole("button")).toHaveText([
      /^\s*critical 4$/,
      /^\s*high 2$/,
      /^\s*low 3$/,
    ]);
    await expect(page.getByRole("region", { name: "Overview" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(
      page.getByRole("region", { name: "Overview" }).getByRole("group", { name: "Grade" }),
    ).toHaveCount(1);
  });

  test("the All packages table has a name, and a sort button's name carries no arrow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(report2Url(CASE) + "#view=packages");
    const table = page.getByRole("table", { name: "All packages" });
    await expect(table).toBeVisible();
    const sorted = table.locator('[aria-sort="ascending"]');
    await expect(sorted).toHaveCount(1);
    await expect(sorted.getByRole("button")).toHaveAccessibleName("Verdict");
    // The arrow is still drawn for the eye.
    await expect(sorted.getByRole("button")).toContainText("↑");
  });

  /** Every axe rule broken on the page, as "rule: target". */
  async function axeViolations(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`));
  }

  for (const width of [375, 768, 1440]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test.describe(`at ${width}px, ${colorScheme}`, () => {
        test.use({ viewport: { width, height: 900 }, colorScheme });

        for (const view of ["overview", "findings", "advisories", "packages", "radius", "run"] as const) {
          test(`axe finds no violation on ${view}`, async ({ page }) => {
            await page.goto(`${report2Url(CASE)}#view=${view}`);
            await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();
            expect(await axeViolations(page)).toEqual([]);
          });
        }

        test("axe finds no violation with a package open", async ({ page }) => {
          await page.goto(`${report2Url(CASE)}#view=findings&pkg=twig%2Ftwig`);
          await expect(page.locator('[data-surface="detail"]')).toBeVisible();
          expect(await axeViolations(page)).toEqual([]);
        });

        test("axe finds no violation with the glossary open", async ({ page }) => {
          await page.goto(`${report2Url(CASE)}#view=findings`);
          await page.keyboard.press("?");
          await expect(page.locator("dialog.glossary")).toBeVisible();
          expect(await axeViolations(page)).toEqual([]);
        });
      });
    }
  }
});
