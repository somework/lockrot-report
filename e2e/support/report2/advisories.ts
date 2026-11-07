import type { Locator, Page } from "@playwright/test";

/** The Advisories tab of a report-2 page. */
export function advisoriesSurface(page: Page): Locator {
  return page.locator('[data-surface="advisories"]');
}

/** Every advisory row, top to bottom: one per S9 row, so a package can repeat. A package's group
 *  head is a `role=row` too, but carries no `data-pkg`. */
export function advisoryRows(page: Page): Locator {
  return advisoriesSurface(page).locator('[role="row"][data-pkg]');
}

/** The package of each advisory row, top to bottom. */
export async function advisoryRowPackages(page: Page): Promise<string[]> {
  return advisoryRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-pkg") ?? ""));
}

/** The package groups' headings, top to bottom: a package and its version. */
export function advisoryGroupHeads(page: Page): Locator {
  return advisoriesSurface(page).locator(".al-group-head h2");
}
