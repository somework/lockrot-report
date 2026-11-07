import type { Locator, Page } from "@playwright/test";

/** The Findings tab of a report-2 page. */
export function findingsSurface(page: Page): Locator {
  return page.locator('[data-surface="findings"]');
}

/** Every Findings row, top to bottom. A group head is a `role=row` too, but carries no `data-pkg`. */
export function findingsRows(page: Page): Locator {
  return findingsSurface(page).locator('[role="row"][data-pkg]');
}

/** One Findings row, by its accessible name: the package. */
export function findingsRow(page: Page, pkg: string): Locator {
  return findingsSurface(page).getByRole("row", { name: pkg, exact: true });
}

export type RowCell = "num" | "pkg" | "flags" | "age" | "reach" | "next";

/** One cell's text, without the aria-hidden label a stacked row prints over each value. */
export async function findingsRowCell(page: Page, pkg: string, cell: RowCell): Promise<string> {
  return findingsRow(page, pkg)
    .locator(`.f2-${cell}`)
    .evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      for (const label of copy.querySelectorAll(".f2-lbl")) label.remove();
      return copy.textContent;
    });
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
  const age = findingsRow(page, pkg).locator(".f2-age[aria-label]");
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

export interface NextStepParts {
  /** The move's own words, without the held-by clause. */
  move: string;
  ready: string | null;
  held: string | null;
  after: string | null;
  major: string | null;
  command: string | null;
}

/** The next-step cell part by part; a part the row does not draw is null. */
export async function findingsNextStep(page: Page, pkg: string): Promise<NextStepParts> {
  const cell = findingsRow(page, pkg).locator(".f2-next");
  const text = async (selector: string, copied = false): Promise<string | null> => {
    const part = cell.locator(selector);
    if ((await part.count()) === 0) return null;
    // The DOM text keeps the space at a soft wrap, which WebKit's innerText drops.
    const raw = copied
      ? await part.first().evaluate((node) => node.textContent)
      : await part.first().innerText();
    return raw.replace(/\s+/g, " ").trim();
  };
  const held = await text(".f2-held", true);
  const move = await cell.locator(".f2-move").evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    for (const part of copy.querySelectorAll(".f2-held")) part.remove();
    return copy.textContent.replace(/\s+/g, " ").trim();
  });
  return {
    move,
    ready: await text(".f2-ready"),
    held: held === null ? null : held.replace(/^·\s*/, ""),
    after: await text(".f2-after"),
    major: await text(".f2-major"),
    command: await text(".f2-cmd", true),
  };
}
