import type { Locator, Page } from "@playwright/test";

/** The Blast radius tab of a report-2 page. */
export function radiusSurface(page: Page): Locator {
  return page.locator('[data-surface="radius"]');
}

/** A direct requirement's row, by its package. */
export function radiusRow(page: Page, pkg: string): Locator {
  return radiusSurface(page).locator(`li.r2-row[data-pkg="${pkg}"]`);
}

/** The ranked requirement rows' packages, top to bottom, folds left as they are. */
export async function radiusRowPackages(page: Page): Promise<string[]> {
  return radiusSurface(page)
    .locator("li.r2-row:visible")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-pkg") ?? ""));
}

/** The packages an open requirement row lists under it, in tree order. */
export async function radiusKids(page: Page, pkg: string): Promise<string[]> {
  return radiusRow(page, pkg)
    .locator("li.r2-kid")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-pkg") ?? ""));
}
