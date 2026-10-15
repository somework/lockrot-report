import type { Locator, Page } from "@playwright/test";

/** The overview band of a report-2 page. */
export function overviewSurface(page: Page): Locator {
  return page.locator('[data-surface="overview"]');
}
