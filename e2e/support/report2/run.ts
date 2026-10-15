import type { Locator, Page } from "@playwright/test";

/** The Run data tab of a report-2 page. */
export function runSurface(page: Page): Locator {
  return page.locator('[data-surface="run"]');
}

/** The section headings of the Run data tab, in page order. */
export function runHeadings(page: Page): Locator {
  return runSurface(page).locator(".sect > h3");
}

/** The "How the score works" rule rows, behind their fold. */
export function ruleRows(page: Page): Locator {
  return runSurface(page).locator("details.run2-rules li");
}

/** The Run tab's `gate:` line. */
export function runGateLine(page: Page): Locator {
  return runSurface(page).locator(".overview2-gate-text");
}
