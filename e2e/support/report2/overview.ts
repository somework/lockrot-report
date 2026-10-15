import type { Locator, Page } from "@playwright/test";

/** The Overview tab's content: the summary band and its charts. */
export function overviewSurface(page: Page): Locator {
  return page.locator('[data-surface="overview"]');
}

/** The lead's grade line, the first line of Overview. */
export function gradeLine(page: Page): Locator {
  return overviewSurface(page).locator(".ov-grade");
}

/** The lead's figure line, under the grade line. */
export function figureLine(page: Page): Locator {
  return overviewSurface(page).locator(".ov-figure");
}

/** "Weighs most": its load line, then one list item per drawn score. */
export function weighsMost(page: Page): Locator {
  return overviewSurface(page).locator(".ov-weighs");
}

/** The grade chips of the lead, each a link to Findings under its grade. */
export function gradeChips(page: Page): Locator {
  return overviewSurface(page).getByRole("group", { name: "Grade" }).getByRole("link");
}

/** The grade chips of the Findings strip, each a toggle of `verdict`. */
export function stripChips(page: Page): Locator {
  return page.locator(".f2-strip").getByRole("group", { name: "Grade" }).getByRole("button");
}

/** The severity chips of the Advisories tab's lead, each a toggle of `sev`. */
export function severityChips(page: Page): Locator {
  return page
    .locator('[data-surface="advisories"]')
    .getByRole("group", { name: "Advisories by severity" })
    .getByRole("button");
}

/** One link per flag the flag ledger draws, in its order. */
export function flagBars(page: Page): Locator {
  return overviewSurface(page).locator(".overview2-flag-bars > a");
}

/** The lead's `gate:` line. */
export function gateLine(page: Page): Locator {
  return overviewSurface(page).locator(".overview2-gate-text");
}

/** The squares of the lead's waffle, one per package checked. */
export function waffleSquares(page: Page): Locator {
  return overviewSurface(page).locator(".waffle-cell");
}
