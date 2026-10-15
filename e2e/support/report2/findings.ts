import type { Locator, Page } from "@playwright/test";

/** The Findings tab of a report-2 page. */
export function findingsSurface(page: Page): Locator {
  return page.locator('[data-surface="findings"]');
}

/** One Findings row, by its accessible name: the package. */
export function findingsRow(page: Page, pkg: string): Locator {
  return findingsSurface(page).getByRole("listitem", { name: pkg, exact: true });
}

export type RowCell = "num" | "pkg" | "flags" | "age" | "reach" | "next";

/** One cell's visible text. */
export async function findingsRowCell(page: Page, pkg: string, cell: RowCell): Promise<string> {
  return (await findingsRow(page, pkg).locator(`.f2-${cell}`).textContent()) ?? "";
}

/** One Findings row's text, cell by cell: the score, the package, the flags, the age, the reach and
 *  the next step. */
export async function findingsRowCells(page: Page, pkg: string): Promise<string[]> {
  const cells: RowCell[] = ["num", "pkg", "flags", "age", "reach", "next"];
  return Promise.all(cells.map((cell) => findingsRowCell(page, pkg, cell)));
}

/** The row's flag pills, in row order, for a web-first `toHaveText([...])`. */
export function rowPills(page: Page, pkg: string): Locator {
  return findingsRow(page, pkg).locator(".fp");
}

/** The age cell: its accessible name and its tooltip; null when the row draws no age. */
export async function rowAge(page: Page, pkg: string): Promise<{ label: string; title: string } | null> {
  const age = findingsRow(page, pkg).locator(".f2-age[role=img]");
  if ((await age.count()) === 0) return null;
  return {
    label: (await age.getAttribute("aria-label")) ?? "",
    title: (await age.getAttribute("title")) ?? "",
  };
}

/** The score bar's segments' rendered widths in px. */
export async function scoreSegmentWidths(page: Page, pkg: string): Promise<number[]> {
  return findingsRow(page, pkg)
    .locator(".sbar-seg")
    .evaluateAll((segments) => segments.map((segment) => segment.getBoundingClientRect().width));
}

/** The column head's score and age captions, as the eye reads them. */
export async function findingsHeadCaptions(page: Page): Promise<{ score: string; age: string }> {
  const head = findingsSurface(page).locator(".f2-head");
  const words = async (selector: string) =>
    (await head.locator(selector).allTextContents()).join(" ").replace(/\s+/g, " ").trim();
  return {
    score: await words(".f2-head-label, .f2-head-tick"),
    age: await words(".fhead-axis-label, .fhead-tick"),
  };
}
