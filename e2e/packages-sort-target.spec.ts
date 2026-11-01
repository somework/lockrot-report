/**
 * WCAG 2.5.8: a sort button of the All packages head is a 24 px target at every list width. The
 * head wraps its labels into stacked pairs between a narrow list and a wide one, which is where a
 * bare-text button sat too close to its neighbour.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";

const MIN_TARGET = 24;

const LAYOUTS = [
  {
    label: "1024 px, no package open",
    width: 1024,
    hash: "#view=packages",
    ready: '[data-surface="packages"]',
  },
  {
    label: "1440 px, a package open",
    width: 1440,
    hash: "#view=packages&pkg=twig%2Ftwig",
    ready: '[data-surface="detail"]',
  },
] as const;

async function sortButtonHeights(page: Page): Promise<number[]> {
  const buttons = page.locator("table.p2-table thead .sort-btn");
  await expect(buttons.first()).toBeVisible();
  return buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
}

for (const { label, width, hash, ready } of LAYOUTS) {
  test.describe(label, () => {
    test.use({ viewport: { width, height: 900 } });

    test("every sort button is at least 24 px tall, and axe finds no small target", async ({ page }) => {
      await page.goto(report2Url("composite") + hash);
      await page.locator(ready).waitFor();

      const heights = await sortButtonHeights(page);
      const results = await new AxeBuilder({ page })
        .include("table.p2-table thead")
        .withRules(["target-size"])
        .analyze();

      expect(heights.length).toBeGreaterThan(0);
      expect(heights.filter((height) => height < MIN_TARGET)).toEqual([]);
      expect(results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
    });
  });
}
