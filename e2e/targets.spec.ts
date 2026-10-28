/**
 * R6-48, R6-33: at every phone width and at a tablet and a desktop width, no two controls share a
 * box, the Findings strip reads in Tab order, and the search placeholder fits its field.
 * WCAG 2.2 SC 2.5.8 and 2.4.3.
 */
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";

const CASE = "composite";
const WIDTHS = [320, 360, 375, 390, 414, 430, 500, 768, 1440];
const VIEWS = ["overview", "findings", "advisories", "packages", "radius", "run"] as const;
const CONTROLS = "a[href], button, input, select, summary, [tabindex='0']";
// The tab strip's scroll arrows lie over the strip by design: a tab under one scrolls out from under it.
const OVERLAYS = ".tabs-scroll";

/** Each pair of visible controls in the header and the open tab whose boxes overlap. */
async function overlaps(page: Page, view: string): Promise<string[]> {
  return page.evaluate(
    ([selector, overlay, surface]) => {
      const roots = [
        document.querySelector(".topbar"),
        document.querySelector(`[data-surface="${surface}"]`),
      ];
      // One box per line fragment: a link that wraps has an L-shaped hit area, not its bounding box.
      const controls = roots
        .flatMap((root) => (root === null ? [] : [...root.querySelectorAll<HTMLElement>(selector)]))
        .filter((el) => !el.matches(overlay) && getComputedStyle(el).visibility !== "hidden")
        .map((el) => ({
          el,
          boxes: [...el.getClientRects()].filter((box) => box.width > 0 && box.height > 0),
        }))
        .filter(({ boxes }) => boxes.some((box) => box.top < innerHeight * 2));
      const meet = (a: DOMRect, b: DOMRect): boolean =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const name = (el: HTMLElement): string => `${el.tagName} "${el.textContent.trim().slice(0, 30)}"`;
      const found: string[] = [];
      controls.forEach((a, i) => {
        for (const b of controls.slice(i + 1)) {
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          if (a.boxes.some((boxA) => b.boxes.some((boxB) => meet(boxA, boxB))))
            found.push(`${name(a.el)} and ${name(b.el)}`);
        }
      });
      return found;
    },
    [CONTROLS, OVERLAYS, view] as const,
  );
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const view of VIEWS) {
      test(`no two controls overlap on ${view}`, async ({ page }) => {
        await page.goto(`${report2Url(CASE)}#view=${view}`);
        await expect(page.locator(`[data-surface="${view}"]`)).toBeVisible();

        expect(await overlaps(page, view)).toEqual([]);
      });
    }

    test("the Findings strip's Tab order is its reading order", async ({ page }) => {
      await page.goto(`${report2Url(CASE)}#view=findings`);
      const strip = page.locator(".f2-strip");
      await expect(strip).toBeVisible();

      const outOfOrder = await strip.evaluate((root, selector) => {
        const boxes = [...root.querySelectorAll<HTMLElement>(selector)].map((el) => ({
          name: el.textContent.trim(),
          box: el.getBoundingClientRect(),
        }));
        return boxes.slice(1).flatMap((b, i) => {
          const a = boxes[i];
          if (a === undefined) return [];
          const nextLine = b.box.top >= a.box.bottom - 2;
          const sameLineAfter =
            Math.abs(b.box.top + b.box.height / 2 - (a.box.top + a.box.height / 2)) < a.box.height / 2 &&
            b.box.left >= a.box.right - 1;
          return nextLine || sameLineAfter ? [] : [`"${b.name}" after "${a.name}"`];
        });
      }, CONTROLS);

      expect(outOfOrder).toEqual([]);
    });
  });
}

test("the search placeholder fits its field at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${report2Url(CASE)}#view=findings`);
  const input = page.locator(".search-input");
  await expect(input).toBeVisible();

  const fit = await input.evaluate((el: HTMLInputElement) => {
    const style = getComputedStyle(el);
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) throw new Error("no 2d canvas");
    context.font = style.font;
    const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { text: Math.ceil(context.measureText(el.placeholder).width), room };
  });

  expect(fit.text).toBeLessThanOrEqual(fit.room);
});
