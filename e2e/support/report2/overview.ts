import type { Locator, Page } from "@playwright/test";

/** The overview band of a report-2 page. */
export function overviewSurface(page: Page): Locator {
  return page.locator('[data-surface="overview"]');
}

/** The grade chips of the lead. */
export function gradeChips(page: Page): Locator {
  return overviewSurface(page).getByRole("group", { name: "Grade" }).getByRole("button");
}

/** The severity chips of the Security block that is in view: the Advisories tab's lead, or the
 *  band's tier once it is open. */
export function severityChips(page: Page): Locator {
  return page.getByRole("group", { name: "Advisories by severity" }).getByRole("button");
}

/** The fold that holds the band's tier on screen. */
export function tierFold(page: Page): Locator {
  return overviewSurface(page).locator("details.ledger-fold");
}

/** Opens the band's tier: on screen it loads closed at every width. */
export async function openTier(page: Page): Promise<void> {
  const fold = tierFold(page);
  if (await fold.evaluate((el) => (el as HTMLDetailsElement).open)) return;
  await fold.locator(":scope > summary").click();
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
