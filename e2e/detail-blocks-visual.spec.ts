/**
 * SPEC §7.9.10 for the detail sheet's blocks: 320 px with every fold open, 1440 px, both themes,
 * forced colours and print. The suite asserts geometry and computed styles, not pixels.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sheetUrl } from "./support/pages";
import { detailSurface, openDetail2, openEveryFold } from "./support/report2/detail";

const SHEETS = [
  { label: "B", open: (page: Page) => openDetail2(page, "B", "symfony/monolog-bridge") },
  { label: "B-also‡", open: (page: Page) => openDetail2(page, "B-also-dagger", "symfony/monolog-bridge") },
  {
    label: "a 23-branch timeline",
    open: (page: Page) => openDetail2(page, "baselined-wallabag-2.6", "enshrined/svg-sanitize"),
  },
  {
    label: "drupal/core",
    open: async (page: Page) => {
      await page.goto(`${sheetUrl("drupal-site-drupal-core")}#pkg=${encodeURIComponent("drupal/core")}`);
      const sheet = detailSurface(page);
      await sheet.waitFor();
      return sheet;
    },
  },
] as const;

/** The elements of the sheet that reach past its right edge. */
const overflowing = (sheet: Locator): Promise<string[]> =>
  sheet.evaluate((root) => {
    const edge = root.getBoundingClientRect().right + 1;
    return [...root.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().right > edge)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
  });

test.describe("320 px, every fold open", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  for (const { label, open } of SHEETS) {
    test(`${label}: nothing scrolls sideways`, async ({ page }) => {
      const sheet = await open(page);
      await openEveryFold(sheet);

      expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      expect(await overflowing(sheet)).toEqual([]);
    });
  }
});

test.describe("1440 px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a reading's flag sits beside its text, and a qualifier's label beside its value", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");
    const beside = (row: Locator) =>
      row.evaluate((el) => {
        const [label, value] = [...el.children].map((child) => child.getBoundingClientRect());
        return (
          label !== undefined &&
          value !== undefined &&
          label.right <= value.left &&
          Math.abs(label.top - value.top) < 6
        );
      });

    expect(await beside(sheet.locator(".d3-reading").first())).toBe(true);
    expect(await beside(sheet.locator(".d3-q").first())).toBe(true);
  });

  for (const { label, open } of SHEETS) {
    test(`${label}: every fold open stays inside the sheet`, async ({ page }) => {
      const sheet = await open(page);
      await openEveryFold(sheet);

      expect(await overflowing(sheet)).toEqual([]);
    });
  }
});

test.describe("both themes", () => {
  test("the grade word and the move card's edge take each theme's own tokens", async ({ page }) => {
    const styles = async (colorScheme: "light" | "dark") => {
      await page.emulateMedia({ colorScheme });
      const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");
      return {
        grade: await sheet.locator(".d3-grade").evaluate((el) => getComputedStyle(el).color),
        move: await sheet
          .locator(".d3-move")
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      };
    };
    const light = await styles("light");
    const dark = await styles("dark");

    expect(dark.grade).not.toBe(light.grade);
    expect(dark.move).not.toBe(light.move);
  });
});

test.describe("forced colours", () => {
  test.skip(({ browserName }) => browserName === "webkit", "WebKit does not emulate forced colours");

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the card borders, the grade and gate words and the PHP marks are CanvasText, ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      const sheet = await openDetail2(page, "B", "symfony/monolog-bridge");
      const canvasText = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "CanvasText";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      const color = (selector: string, property: "color" | "borderTopColor") =>
        sheet
          .locator(selector)
          .first()
          .evaluate((el, p) => getComputedStyle(el)[p], property);

      expect(await color(".d3-move", "borderTopColor")).toBe(canvasText);
      expect(await color(".d3-grade", "color")).toBe(canvasText);
      expect(await color(".d3-gate", "color")).toBe(canvasText);
      expect(await color(".d3-check-mark", "color")).toBe(canvasText);
      expect(await color(".d3-rung-mark", "borderTopColor")).toBe(canvasText);
    });
  }
});

test.describe("print", () => {
  test("every fold prints open, and the jumps and the copy controls do not print", async ({ page }) => {
    const sheet = await SHEETS[3].open(page);
    await page.emulateMedia({ media: "print" });
    const display = (selector: string) =>
      sheet
        .locator(selector)
        .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).display))]);

    expect(await display(".d3-adv-list[hidden]")).toEqual(["block"]);
    expect(await display(".d3-adv-range.is-lines[hidden]")).toEqual(["block"]);
    expect(await display(".d3-namelist > li[hidden]")).toEqual(["list-item"]);
    expect(await display(".d3-jump")).toEqual(["none"]);
  });

  test("the Copy and shell buttons do not print, and the command lines do", async ({ page }) => {
    const sheet = await SHEETS[0].open(page);
    await page.emulateMedia({ media: "print" });
    const display = (selector: string) =>
      sheet
        .locator(selector)
        .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).display))]);

    expect(await display(".d2-btn")).toEqual(["none"]);
    expect(await display(".d2-copy-line")).not.toEqual(["none"]);
  });

  test("every branch row prints, and the fold rows do not", async ({ page }) => {
    const sheet = await SHEETS[2].open(page);
    await page.emulateMedia({ media: "print" });
    const style = (selector: string) =>
      sheet
        .locator(selector)
        .evaluateAll((els) => [
          ...new Set(els.map((el) => `${getComputedStyle(el).display} ${getComputedStyle(el).clipPath}`)),
        ]);

    expect(await style(".detail-timeline-row.is-collapsed")).toEqual(["grid none"]);
    expect(await style(".detail-timeline-fold")).toEqual(["none none"]);
  });

  test("a closed details opens before print and returns to its state after it", async ({ page }) => {
    const sheet = await SHEETS[3].open(page);
    const fold = sheet.locator(".d3-fold");

    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(fold).toHaveAttribute("open", "");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(fold).not.toHaveAttribute("open", "");
  });
});
