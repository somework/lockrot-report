import type { Locator, Page } from "@playwright/test";

/** The overview band of a report-2 page. */
export function overviewSurface(page: Page): Locator {
  return page.locator('[data-surface="overview"]');
}

/** The grade chips of the lead. */
export function gradeChips(page: Page): Locator {
  return overviewSurface(page).getByRole("group", { name: "Grade" }).getByRole("button");
}

/** The severity chips of the Security block. */
export function severityChips(page: Page): Locator {
  return overviewSurface(page).getByRole("group", { name: "Advisories by severity" }).getByRole("button");
}

/** One button per flag the flag ledger draws, in its order. */
export function flagBars(page: Page): Locator {
  return overviewSurface(page).locator(".overview2-flag-bars > button");
}

/** The lead's `gate:` line. */
export function gateLine(page: Page): Locator {
  return overviewSurface(page).locator(".overview2-gate-text");
}

/** The squares of the lead's waffle, one per package checked. */
export function waffleSquares(page: Page): Locator {
  return overviewSurface(page).locator(".waffle-cell");
}
