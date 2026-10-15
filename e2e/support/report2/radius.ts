import type { Locator, Page } from "@playwright/test";

/** The Blast radius tab of a report-2 page. */
export function radiusSurface(page: Page): Locator {
  return page.locator('[data-surface="radius"]');
}
