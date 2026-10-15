import type { Locator, Page } from "@playwright/test";

/** The All packages tab of a report-2 page. */
export function packagesSurface(page: Page): Locator {
  return page.locator('[data-surface="packages"]');
}

export type PackagesColumn =
  "name" | "ver" | "ly" | "age" | "verdict" | "score" | "flags" | "reach" | "sig" | "data";

/** One package's row of the table. */
export function packagesRow(page: Page, pkg: string): Locator {
  return packagesSurface(page).locator(`tr[data-pkg="${pkg}"]`);
}

/** One cell's visible text; a mark's hidden words are left out. */
export async function packagesCell(page: Page, pkg: string, column: PackagesColumn): Promise<string> {
  return packagesRow(page, pkg)
    .locator(`td.p2-${column}`)
    .evaluate((td) =>
      [...td.childNodes]
        .flatMap((node) =>
          node instanceof HTMLElement && node.querySelector(".vh") !== null
            ? [node.querySelector('[aria-hidden="true"]')?.textContent ?? ""]
            : [node.textContent ?? ""],
        )
        .join(""),
    );
}

/** The accessible label and tooltip of a cell's mark ("≥", "—"), or null when it has none. */
export async function packagesCellLabel(
  page: Page,
  pkg: string,
  column: PackagesColumn,
): Promise<string | null> {
  const mark = packagesRow(page, pkg).locator(`td.p2-${column} [title]`);
  if ((await mark.count()) === 0) return null;
  const [title, hidden] = await Promise.all([mark.getAttribute("title"), mark.locator(".vh").textContent()]);
  return title === hidden ? title : `title ${title} differs from the hidden words ${hidden}`;
}

/** One column's cells, top to bottom. */
export async function packagesColumn(page: Page, column: PackagesColumn): Promise<string[]> {
  return packagesSurface(page).locator(`tbody td.p2-${column}`).allTextContents();
}

/** Every row's package, top to bottom. */
export async function packagesOrder(page: Page): Promise<string[]> {
  return packagesSurface(page)
    .locator("tbody tr[data-pkg]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-pkg") ?? ""));
}

/** Clicks a column head's sort button, by its visible name. */
export async function sortPackagesBy(page: Page, label: string): Promise<void> {
  await packagesSurface(page).getByRole("button", { name: label, exact: true }).click();
}
