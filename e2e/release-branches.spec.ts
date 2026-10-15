/**
 * The report-2 Release branches block (SPEC §7.9.8): the golden line is the text heading and the
 * accessible summary, and the 0.13 timeline under it is drawn from published years only.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { golden, openDetail2 } from "./support/report2/detail";

const B = "symfony/monolog-bridge";

const table = (sheet: Locator): Locator => sheet.getByRole("table");

/** Each drawn lane's dot, left edge of the strip to the dot, as a share of the strip's width. */
async function dotPlaces(sheet: Locator): Promise<Record<string, number>> {
  return table(sheet)
    .locator(".detail-timeline-row[data-branch]")
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.flatMap((row) => {
          const strip = row.querySelector(".detail-timeline-strip")?.getBoundingClientRect();
          const dot = row.querySelector(".detail-timeline-dot")?.getBoundingClientRect();
          if (!strip || !dot) return [];
          return [
            [row.getAttribute("data-branch") ?? "", (dot.left + dot.width / 2 - strip.left) / strip.width],
          ];
        }),
      ),
    );
}

test.describe("1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the golden line describes the table, and the rows fold as in 0.13", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    const described = await table(sheet).getAttribute("aria-describedby");

    await expect(page.locator(`[id="${described ?? ""}"]`)).toHaveText(golden("branches", "B"));
    await expect(table(sheet).getByRole("rowheader")).toHaveText([
      "8.x, the newest",
      "5 between branches, between the newest and yours",
      "2.x, yours",
    ]);
  });

  test("a bar's length is its published years, so the dots order by age on one axis", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    await table(sheet)
      .getByRole("button", { name: /5 between/ })
      .click();

    const places = await dotPlaces(sheet);

    // B's axis spans 7 years: 2.x at 6.9 years sits near the left, 8.x at 0.1 near the run.
    expect(places["2.x"]).toBeCloseTo(1 - 6.9 / 7, 1);
    expect(places["8.x"]).toBeCloseTo(1 - 0.1 / 7, 1);
    expect(places["4.x"]).toBeCloseTo(1 - 4.3 / 7, 1);
    expect(places["3.x"] ?? 0).toBeLessThan(places["4.x"] ?? 0);
  });

  test("the age-limit guides sit at the run's release thresholds", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);

    await expect(table(sheet).locator(".detail-timeline-guide-cap")).toHaveText(["3y", "5y"]);
  });

  test("an undated branch keeps its row with no bar", async ({ page }) => {
    const sheet = await openDetail2(page, "C", "symfony/debug");
    const rows = table(sheet).locator('.detail-timeline-row[data-branch="2.x"]');

    await expect(rows).toHaveCount(1);
    await expect(rows.locator(".detail-timeline-dot")).toHaveCount(0);
    await expect(rows.locator(".detail-timeline-sr")).toContainText("undated");
  });

  test("one branch draws the line and no timeline", async ({ page }) => {
    const sheet = await openDetail2(page, "F", "symfony/polyfill-intl-idn");

    await expect(sheet.getByText(golden("branches", "F"))).toBeVisible();
    await expect(table(sheet)).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the open timeline has no axe violation, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const sheet = await openDetail2(page, "B", B);
      await table(sheet)
        .getByRole("button", { name: /5 between/ })
        .click();

      const results = await new AxeBuilder({ page }).include(".d2-timeline").analyze();

      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe("390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the sheet never scrolls sideways", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    await table(sheet)
      .getByRole("button", { name: /5 between/ })
      .click();

    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);

    expect(overflow).toBeLessThanOrEqual(0);
  });
});
