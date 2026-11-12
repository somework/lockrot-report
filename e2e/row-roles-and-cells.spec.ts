/**
 * PD-A11Y-ROLES-1 (DESIGN.md §5): a row that takes focus has a widget role. The three ledgers are
 * treegrids, whose rows take focus, and their cells take focus from the row as the ARIA Authoring
 * Practices treegrid pattern says. Blast radius is a tree: a row opens its package and unfolds the
 * packages listed under it.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";

const CASE = "composite";

const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return {
      pkg: active?.closest("[data-pkg]")?.getAttribute("data-pkg") ?? null,
      cell: [...(active?.closest("[data-pkg]")?.querySelectorAll('[role="gridcell"]') ?? [])].findIndex(
        (cell) => cell.contains(active),
      ),
    };
  });

for (const [view, name] of [
  ["findings", "Findings"],
  ["packages", "All packages"],
  ["advisories", "Advisories"],
] as const) {
  test.describe(`the ${name} ledger`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${report2Url(CASE)}#view=${view}`);
    });

    test("is a treegrid whose package rows hold grid cells", async ({ page }) => {
      const grid = page.getByRole("treegrid", { name, exact: true });

      await expect(grid).toBeVisible();
      const row = grid.locator('[role="row"][data-pkg][tabindex="0"]');
      await expect(row.locator('[role="gridcell"]').first()).toBeAttached();
      await expect(row.locator('[role="cell"]')).toHaveCount(0);
    });

    test("ArrowRight walks from the focused row into its cells, and ArrowLeft walks back", async ({
      page,
    }) => {
      const row = page.locator(`[data-surface="${view}"] [role="row"][data-pkg][tabindex="0"]`);
      const pkg = await row.getAttribute("data-pkg");
      await row.focus();

      await page.keyboard.press("ArrowRight");
      expect(await focused(page)).toEqual({ pkg, cell: 0 });
      await page.keyboard.press("ArrowRight");
      expect(await focused(page)).toEqual({ pkg, cell: 1 });
      await page.keyboard.press("ArrowLeft");
      expect(await focused(page)).toEqual({ pkg, cell: 0 });
      await page.keyboard.press("ArrowLeft");

      await expect(row).toBeFocused();
    });

    test("Enter on a cell opens the row's package", async ({ page }) => {
      const row = page.locator(`[data-surface="${view}"] [role="row"][data-pkg][tabindex="0"]`);
      const pkg = (await row.getAttribute("data-pkg")) ?? "";
      await row.focus();
      await page.keyboard.press("ArrowRight");

      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(
        new RegExp(`pkg=${encodeURIComponent(pkg).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
    });
  });
}

test.describe("the Blast radius tree", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${report2Url(CASE)}#view=radius`);
  });

  test("is a tree of tree items, each a package that opens", async ({ page }) => {
    const tree = page.locator('[data-surface="radius"]').getByRole("tree").first();

    await expect(tree).toBeVisible();
    await expect(tree.locator('> [role="treeitem"][data-pkg]').first()).toBeVisible();
  });

  test("ArrowRight unfolds a folded row and ArrowLeft folds it, from the row itself", async ({ page }) => {
    const row = page
      .locator('[data-surface="radius"] [role="treeitem"][aria-expanded="false"]')
      .filter({ visible: true })
      .first();
    const pkg = (await row.getAttribute("data-pkg")) ?? "";
    await row.focus();

    const same = page.locator(`[data-surface="radius"] [role="treeitem"][data-pkg="${pkg}"]`).first();
    await page.keyboard.press("ArrowRight");
    await expect(same).toHaveAttribute("aria-expanded", "true");
    await expect(same).toBeFocused();
    await page.keyboard.press("ArrowLeft");

    await expect(same).toHaveAttribute("aria-expanded", "false");
    await expect(same).toBeFocused();
  });

  test("ArrowLeft on a package listed under a row goes to that row", async ({ page }) => {
    const row = page
      .locator('[data-surface="radius"] [role="treeitem"][aria-expanded]')
      .filter({ visible: true })
      .first();
    await row.focus();
    if ((await row.getAttribute("aria-expanded")) === "false") await page.keyboard.press("ArrowRight");
    const kid = row.locator('[role="group"] > [role="treeitem"]').first();
    await kid.focus();

    await page.keyboard.press("ArrowLeft");

    await expect(row).toBeFocused();
  });
});

for (const view of ["findings", "packages", "advisories", "radius"]) {
  test(`axe finds no violation on #view=${view}`, async ({ page }) => {
    await page.goto(`${report2Url(CASE)}#view=${view}`);
    await expect(page.locator(`[data-surface="${view}"]`).first()).toBeVisible();

    const result = await new AxeBuilder({ page }).include(`[data-surface="${view}"]`).analyze();

    expect(
      result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
