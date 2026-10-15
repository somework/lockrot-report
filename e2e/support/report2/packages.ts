import type { Locator, Page } from "@playwright/test";

/** The All packages tab of a report-2 page. */
export function packagesSurface(page: Page): Locator {
  return page.locator('[data-surface="packages"]');
}
