import type { Locator, Page } from "@playwright/test";

/** The detail sheet of a report-2 page. */
export function detailSurface(page: Page): Locator {
  return page.locator('[data-surface="detail"]');
}
