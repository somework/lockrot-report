import type { Locator, Page } from "@playwright/test";

/** The Findings tab of a report-2 page. */
export function findingsSurface(page: Page): Locator {
  return page.locator('[data-surface="findings"]');
}

/** One Findings row's text, cell by cell: the score, the package, the version and the reach word. */
export async function findingsRowCells(page: Page, pkg: string): Promise<string[]> {
  const row = findingsSurface(page).getByRole("listitem", { name: pkg, exact: true });
  return row.locator(":scope > *").allTextContents();
}
