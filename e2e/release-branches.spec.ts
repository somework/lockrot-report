/**
 * The report-2 Release branches block (SPEC §7.9.8): the golden line is the text heading and the
 * accessible summary, and the 0.13 timeline under it is drawn from published years only.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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

/** Opens every fold and waits until the page is still: a phone-width sheet slides in, and an axe
 *  colour-contrast pass taken mid-slide reads half-faded text. */
async function openFolds(page: Page, sheet: Locator): Promise<void> {
  const buttons = sheet.locator(".detail-timeline-fold-btn");
  const count = await buttons.count();
  for (let index = 0; index < count; index++) {
    const button = buttons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

test.describe("1440×900: the axis and the rows hold their geometry", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("'today' sits under the rule, clear of the latest header", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    const today = await table(sheet).locator(".detail-timeline-today").boundingBox();
    const latest = await table(sheet)
      .getByRole("columnheader", { name: /latest/i })
      .boundingBox();
    if (today === null || latest === null) throw new Error("today or latest has no box");

    expect(today.y).toBeGreaterThan(latest.y + latest.height);
  });

  test("opening the fold never rescales the axis: your dot stays put", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    const dot = table(sheet).locator(".detail-timeline-row.is-mine .detail-timeline-dot");
    const before = await dot.boundingBox();

    await table(sheet)
      .getByRole("button", { name: /5 between/ })
      .click();

    expect((await dot.boundingBox())?.x).toBeCloseTo(before?.x ?? -1, 1);
  });

  test("the guides' captions sit above their own lines, clear of the latest header", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    const latest = await table(sheet)
      .getByRole("columnheader", { name: /latest/i })
      .boundingBox();
    for (const level of ["warn", "high"]) {
      const caption = await table(sheet).locator(`.detail-timeline-guide-cap.is-${level}`).boundingBox();
      const guide = await table(sheet)
        .locator(`.detail-timeline-row.is-mine .detail-timeline-guide.is-${level}`)
        .boundingBox();
      if (caption === null || guide === null || latest === null) throw new Error(`no ${level} box`);

      const lineX = level === "high" ? caption.x + caption.width : caption.x;
      expect(Math.abs(lineX - (level === "high" ? guide.x + guide.width : guide.x))).toBeLessThanOrEqual(1);
      expect(caption.x + caption.width).toBeLessThan(latest.x);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`forced colours, ${colorScheme}: your ring, the newest disc and the lines differ from the page`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      const sheet = await openDetail2(page, "B", B);
      await openFolds(page, sheet);

      const colours = await table(sheet).evaluate((grid) => {
        const style = (selector: string): CSSStyleDeclaration => {
          const element = grid.querySelector(selector);
          if (element === null) throw new Error(`no ${selector}`);
          return getComputedStyle(element);
        };
        return {
          canvas: getComputedStyle(document.body).backgroundColor,
          mineRing: style(".is-mine .detail-timeline-dot").borderTopColor,
          mineLine: style(".is-mine .detail-timeline-tail").backgroundColor,
          newestDisc: style(".is-newest .detail-timeline-dot").backgroundColor,
          otherLine: style(
            ".detail-timeline-row.is-folded:not(.is-mine):not(.is-newest) .detail-timeline-tail",
          ).backgroundColor,
          warnGuide: style(".detail-timeline-guide.is-warn").borderLeftStyle,
          highGuide: style(".detail-timeline-guide.is-high").borderLeftStyle,
        };
      });

      // Both guides are GrayText here, so their patterns alone tell warn from high.
      expect(colours.warnGuide).not.toBe(colours.highGuide);
      expect(colours.mineRing).not.toBe(colours.canvas);
      expect(colours.mineLine).not.toBe(colours.canvas);
      expect(colours.newestDisc).not.toBe(colours.canvas);
      expect(colours.otherLine).not.toBe(colours.canvas);
    });
  }
});

test.describe("phone widths: nothing clipped, wrapped mid-word or ellipsised", () => {
  for (const width of [320, 390]) {
    test(`${String(width)}px, folds open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const sheet = await openDetail2(page, "B", B);
      await openFolds(page, sheet);

      const problems = await table(sheet).evaluate((grid) => {
        const found: string[] = [];
        if (grid.scrollWidth > grid.clientWidth + 1) found.push("table scrolls sideways");
        const cells = grid.querySelectorAll<HTMLElement>(
          "[role='cell'], [role='rowheader'], [role='columnheader']",
        );
        for (const cell of cells) {
          if (getComputedStyle(cell).textOverflow === "ellipsis") found.push(`ellipsis: ${cell.className}`);
          // A strip's dot may overhang its today rule on purpose, so a strip is checked against its
          // neighbour instead.
          if (cell.matches(".detail-timeline-strip, .detail-timeline-strip-head")) continue;
          if (cell.scrollWidth > cell.clientWidth + 1 && cell.clientWidth > 0) {
            found.push(`overflow: ${cell.className} "${cell.textContent}"`);
          }
        }
        for (const caption of grid.querySelectorAll(".detail-timeline-guide-cap")) {
          // One fixed pattern at every width: "5y", "3y", never "5y ago" at one width only.
          if (!/^\d+y$/.test(caption.textContent)) found.push(`caption "${caption.textContent}"`);
        }
        for (const dot of grid.querySelectorAll(".detail-timeline-dot")) {
          const next = dot.closest("[role='cell']")?.nextElementSibling;
          if (next != null && dot.getBoundingClientRect().right > next.getBoundingClientRect().left)
            found.push(`a dot runs into "${next.textContent}"`);
        }
        return found;
      });

      expect(problems).toEqual([]);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`320px, folds open: no axe violation in the timeline, ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const sheet = await openDetail2(page, "B", B);
      await openFolds(page, sheet);

      const results = await new AxeBuilder({ page }).include(".d2-timeline").analyze();

      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe("the section spans the sheet, and nothing in it overflows (variant 6B)", () => {
  const WALLABAG = "baselined-wallabag-2.6";
  const section = (sheet: Locator): Locator => sheet.getByRole("region", { name: "Release branches" });

  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const pkg of ["spomky-labs/otphp", "guzzlehttp/guzzle"]) {
      test(`${pkg}, ${String(width)}px, folds open`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        const sheet = await openDetail2(page, WALLABAG, pkg);
        await openFolds(page, sheet);

        const problems = await section(sheet).evaluate((block) => {
          const found: string[] = [];
          const sheetBox = block.closest(".detail-body")?.getBoundingClientRect();
          const box = block.getBoundingClientRect();
          if (sheetBox === undefined) return ["no sheet body"];
          if (box.left < sheetBox.left - 1 || box.right > sheetBox.right + 1)
            found.push("section past the sheet");
          const scrollers = [
            block,
            ...block.querySelectorAll<HTMLElement>(
              "[role='table'], [role='row'], [role='cell'], [role='rowheader'], [role='columnheader'], p",
            ),
          ];
          for (const element of scrollers) {
            if (element.matches(".detail-timeline-strip, .detail-timeline-strip-head")) continue;
            if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
              found.push(
                `overflow ${String(element.scrollWidth - element.clientWidth)}px: ${element.getAttribute("class") ?? ""}`,
              );
            }
          }
          return found;
        });

        expect(problems).toEqual([]);
        expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  }

  test("at 1440 the timeline takes the sheet's full width, under the eyebrow and the line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const sheet = await openDetail2(page, WALLABAG, "spomky-labs/otphp");
    const block = section(sheet);

    await expect(block.getByRole("heading", { name: "Release branches" })).toBeVisible();
    const line = block.locator("p").first();
    await expect(line).toHaveText(/^Your branch, /);
    expect(await block.getByRole("table").getAttribute("aria-describedby")).toBe(
      await line.getAttribute("id"),
    );
    const widths = await block.evaluate((el) => ({
      body: (el.closest(".detail-body") as HTMLElement).clientWidth,
      table: el.querySelector("[role='table']")?.getBoundingClientRect().width ?? 0,
    }));
    // The body's own padding, 16 px a side, is all that the table does not take.
    expect(widths.table).toBeGreaterThanOrEqual(widths.body - 32 - 1);
  });
});
