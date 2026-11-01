/**
 * WCAG 2.5.8: a sort button of the All packages head is a 24 px target at every list width: the
 * stacked head of a narrow list, the two-row head between, and the one-line head of a wide list.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { packagesSurface } from "./support/report2/packages";

const MIN_TARGET = 24;

const LAYOUTS = [
  {
    label: "375 px, no package open",
    width: 375,
    hash: "#view=packages",
    ready: '[data-surface="packages"]',
  },
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
  {
    label: "1920 px, no package open",
    width: 1920,
    hash: "#view=packages",
    ready: '[data-surface="packages"]',
  },
] as const;

const SORT_NAME = /^(Package|Version|Libyears|Age|Verdict|Score|Flags|Reached|Signals|Data as of)$/;

async function sortButtonHeights(page: Page): Promise<number[]> {
  const heads = packagesSurface(page).getByRole("columnheader");
  const buttons = heads.getByRole("button", { name: SORT_NAME });
  await expect(buttons.first()).toBeVisible();
  await expect(buttons).toHaveCount(await heads.count());
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
