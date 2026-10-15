/**
 * The report-2 "Why <verdict>" block (SPEC §7.9.8, design 2A), which takes over from the report-1
 * priority ladder that `priority-basis.spec.ts` covers: the header, the bar with its legend and band
 * ruler, the opening and the after-the-move line at once, and the rest of the golden lines on click.
 */
import { expect, test, type Locator } from "@playwright/test";
import { goldenLines, openDetail2, visibleWhyLines } from "./support/report2/detail";

const B = "symfony/monolog-bridge";

const why = (sheet: Locator): Locator => sheet.locator(".d2-why");

test("B shows its golden header, the opening and the after-the-move line at once", async ({ page }) => {
  const sheet = await openDetail2(page, "B", B);
  const lines = goldenLines("why", "B");

  await expect(why(sheet).getByRole("heading", { name: "Why critical" })).toBeVisible();
  await expect(why(sheet).locator(".d2-why-header")).toHaveText(lines[0] ?? "");
  expect(await visibleWhyLines(sheet)).toEqual([
    "maintenance (left-behind, 1 corroborating) alone grades it high, the advisory alone grades it high: together critical",
    "after the move: 0, ok (if Composer resolves it)",
  ]);
});

test("Show the arithmetic opens every golden line in SPEC order, and closes again", async ({ page }) => {
  const sheet = await openDetail2(page, "B", B);
  const button = why(sheet).getByRole("button", { name: "Show the arithmetic" });

  await button.click();

  await expect(button).toHaveAttribute("aria-expanded", "true");
  expect(await visibleWhyLines(sheet)).toEqual(goldenLines("why", "B").slice(1));
  await button.click();
  expect(await visibleWhyLines(sheet)).toHaveLength(2);
});

test("the bar is hidden from assistive technology and its legend prints each contribution", async ({
  page,
}) => {
  const sheet = await openDetail2(page, "B", B);
  const figure = why(sheet).locator(".d2-why-figure");

  await expect(figure).toHaveAttribute("aria-hidden", "true");
  await expect(figure.locator(".d2-why-legend-item")).toHaveText([
    "left-behind 16",
    "old-promise 4",
    "vulnerable 16",
  ]);
  await expect(figure.locator(".d2-ruler-tick:not(.is-start, .is-end)")).toHaveText([
    "8 medium",
    "16 high",
    "32 critical",
  ]);
});

test("segment widths follow contribution over bar_max, with a 4 px floor", async ({ page }) => {
  const sheet = await openDetail2(page, "B", B);
  const bar = why(sheet).locator(".d2-why-bar");
  const track = (await bar.boundingBox())?.width ?? 0;
  const widths = await bar
    .locator(".d2-seg")
    .evaluateAll((segs) => segs.map((s) => s.getBoundingClientRect().width));

  expect(widths).toHaveLength(3);
  expect(widths[0]).toBeCloseTo(track * 0.25, 0);
  expect(widths[2]).toBeCloseTo(track * 0.25, 0);
  expect(widths[1]).toBeGreaterThanOrEqual(4);
});

test("a low finding keeps its golden header with the points to the next band", async ({ page }) => {
  const sheet = await openDetail2(page, "F", "symfony/polyfill-intl-idn");

  await expect(why(sheet).locator(".d2-why-header")).toHaveText(goldenLines("why", "F")[0] ?? "");
});

test("How the score works takes the reader to the Run tab", async ({ page }) => {
  const sheet = await openDetail2(page, "B", B);

  await why(sheet)
    .getByRole("button", { name: /How the score works/ })
    .click();

  await expect(page.getByRole("tab", { name: /Run data/ })).toHaveAttribute("aria-selected", "true");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`forced colours draw each segment's role as its border style, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, forcedColors: "active" });
    const sheet = await openDetail2(page, "B", B);

    const styles = await why(sheet)
      .locator(".d2-why-bar .d2-seg")
      .evaluateAll((segs) => segs.map((s) => getComputedStyle(s).borderTopStyle));

    expect(styles).toEqual(["solid", "dashed", "dotted"]);
  });
}
