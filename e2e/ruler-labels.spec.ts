/**
 * The band names of the two score rulers stay whole and apart at every width (R5-30, R5-31): the
 * ruler under "Why {grade}" in the package sheet, and the band strip of "How the score works".
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { openDetail2 } from "./support/report2/detail";
import { runSurface } from "./support/report2/run";

const WIDTHS = [320, 375, 414, 768, 1024, 1440];

interface Drawn {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  /** How much of the text a box with hidden overflow cuts off. */
  readonly cut: number;
}

async function drawn(labels: Locator): Promise<Drawn[]> {
  return labels.evaluateAll((elements) =>
    elements.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      let shown = right - left;
      for (let up: Element | null = element; up !== null; up = up.parentElement) {
        if (getComputedStyle(up).overflowX === "visible") continue;
        const clip = up.getBoundingClientRect();
        shown = Math.min(shown, Math.max(0, Math.min(right, clip.right) - Math.max(left, clip.left)));
      }
      return {
        text: element.textContent,
        left,
        right,
        top,
        bottom,
        cut: Math.round(right - left - shown),
      };
    }),
  );
}

async function expectWholeAndApart(labels: Locator, where: string): Promise<void> {
  const boxes = await drawn(labels);
  expect(boxes.length, where).toBeGreaterThan(2);
  expect(
    boxes.filter(({ cut }) => cut > 0).map(({ text }) => text),
    `${where}: cut names`,
  ).toEqual([]);
  const overlaps = boxes.flatMap((a, i) =>
    boxes
      .slice(i + 1)
      .filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
      .map((b) => `${a.text}/${b.text}`),
  );
  expect(overlaps, `${where}: overlapping names`).toEqual([]);
}

async function at(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
}

for (const width of WIDTHS) {
  test(`the sheet's ruler names each band apart at ${String(width)} px`, async ({ page }) => {
    await at(page, width);
    const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");

    await expectWholeAndApart(sheet.locator(".d2-ruler-tick em"), `${String(width)} px`);
  });

  test(`the Run data band strip names each band in full at ${String(width)} px`, async ({ page }) => {
    await at(page, width);
    await page.goto(`${report2Url("composite")}#view=run`);
    await expect(runSurface(page)).toBeVisible();

    await expectWholeAndApart(page.locator(".run2-ruler-bands > i"), `${String(width)} px`);
  });
}
