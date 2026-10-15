import type { Locator, Page } from "@playwright/test";

/** The Advisories tab of a report-2 page. */
export function advisoriesSurface(page: Page): Locator {
  return page.locator('[data-surface="advisories"]');
}
