import type { Locator, Page } from "@playwright/test";

/** The Run data tab of a report-2 page. */
export function runSurface(page: Page): Locator {
  return page.locator('[data-surface="run"]');
}
