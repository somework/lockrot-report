/**
 * The release-branch block (`ui/detail/Timeline.tsx`, `domain/timeline.ts`) — PD-TIMELINE-1 through
 * -8 (DESIGN.md §5). Raw class selectors are fine here, the same way `detail-scroll.spec.ts` uses
 * them: this file is written against this renderer's implementation, not the cross-renderer
 * accessibility contract `support/new.ts` keeps.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, type FixtureName } from "./support/pages";

/** Opens `pkg`'s detail straight from the address, the same link a reader can paste. */
async function openTimeline(page: Page, fixture: FixtureName, pkg: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`${pageUrl(fixture)}#view=packages&pkg=${encodeURIComponent(pkg)}`);
  await expect(page.locator(".detail-timeline")).toBeVisible();
}

const MEILI = [FIXTURES.koel, "meilisearch/meilisearch-php"] as const;
const RESUME = [FIXTURES.koel, "daverandom/resume"] as const;
const PREDIS = [FIXTURES.koel, "predis/predis"] as const;
const RECTOR = [FIXTURES.mautic, "rector/rector"] as const;
const BRICK = [FIXTURES.mautic, "brick/math"] as const;
const OTPHP = [FIXTURES.wallabag, "spomky-labs/otphp"] as const;

test.describe("PD-TIMELINE-7: the answer comes first", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("meilisearch-php: where you are, then what is newer", async ({ page }) => {
    await openTimeline(page, ...MEILI);
    await expect(page.locator(".detail-timeline-answer")).toHaveText(
      "You’re on 0.24.x. Its last release was 4.1 years ago.",
    );
    await expect(page.locator(".detail-timeline-sub")).toContainText(
      "There are 4 newer branches. The newest is 1.x",
    );
  });

  test("rector: a dev-main snapshot is its own row, and the sentence says so", async ({ page }) => {
    await openTimeline(page, ...RECTOR);
    await expect(page.locator(".detail-timeline-answer")).toContainText(
      "You’re on dev-main, a branch snapshot",
    );
    await expect(page.locator(".detail-timeline [role='rowheader']").first()).toHaveText("dev-main, yours");
    await expect(page.locator(".detail-timeline-row.is-snapshot")).toContainText("snapshot");
  });

  test("daverandom/resume: its own version once, only the key entries that apply (PD-TIMELINE-3/4)", async ({
    page,
  }) => {
    await openTimeline(page, ...RESUME);
    const grid = page.locator(".detail-timeline-grid");
    await expect(grid).toContainText("0.0.3");
    await expect(grid).not.toContainText("v0.0.3");
    await expect(grid).not.toContainText("v0.0.2");
    await expect(page.locator(".detail-timeline-key")).not.toContainText("newest");
  });
});

test.describe("PD-TIMELINE-1/2: the axis and the rows hold their geometry (1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("'today' sits under the rule, clear of the LATEST header", async ({ page }) => {
    await openTimeline(page, ...MEILI);
    const today = await page.locator(".detail-timeline-today").boundingBox();
    const latest = await page.getByRole("columnheader", { name: "latest" }).boundingBox();
    if (today === null || latest === null) throw new Error("today or LATEST has no box");
    const overlaps =
      today.x < latest.x + latest.width &&
      latest.x < today.x + today.width &&
      today.y < latest.y + latest.height &&
      latest.y < today.y + today.height;
    expect(overlaps).toBe(false);
    // Under the rows, not in the header beside LATEST.
    expect(today.y).toBeGreaterThan(latest.y + latest.height);
  });

  test("opening the fold never rescales the axis: your dot stays put", async ({ page }) => {
    await openTimeline(page, ...MEILI);
    const dot = page.locator(".detail-timeline-row.is-mine .detail-timeline-dot");
    const before = await dot.boundingBox();
    const fold = page.getByRole("button", { name: "16 older branches" });
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".detail-timeline [role='rowheader']")).toHaveCount(6 + 16);
    const after = await dot.boundingBox();
    expect(after?.x).toBeCloseTo(before?.x ?? -1, 1);
  });

  test("a release from last week still shows a stub of line before the rule", async ({ page }) => {
    // predis/predis 3.x: v3.6.1, six days before the report.
    await openTimeline(page, ...PREDIS);
    const tail = await page.locator(".detail-timeline-row.is-newest .detail-timeline-tail").boundingBox();
    expect(tail?.width ?? 0).toBeGreaterThanOrEqual(6);
  });
});

test.describe("PD-TIMELINE-2: nothing clipped, wrapped mid-word or ellipsised on a phone", () => {
  for (const width of [320, 390]) {
    test.describe(`${String(width)}px`, () => {
      test.use({ viewport: { width, height: 844 } });

      for (const [fixture, pkg] of [MEILI, RECTOR, BRICK, OTPHP]) {
        test(pkg, async ({ page }) => {
          await openTimeline(page, fixture, pkg);
          for (const button of await page.locator(".detail-timeline-fold-btn").all()) await button.click();

          const problems = await page.locator(".detail-timeline").evaluate((section) => {
            const found: string[] = [];
            if (section.scrollWidth > section.clientWidth + 1) found.push("section scrolls sideways");
            const cells = section.querySelectorAll<HTMLElement>(
              "[role='cell'], [role='rowheader'], [role='columnheader'], p, b",
            );
            for (const cell of cells) {
              if (getComputedStyle(cell).textOverflow === "ellipsis")
                found.push(`ellipsis: ${cell.className}`);
              if (cell.scrollWidth > cell.clientWidth + 1 && cell.clientWidth > 0) {
                found.push(`overflow: ${cell.className} "${cell.textContent}"`);
              }
            }
            return found;
          });
          expect(problems).toEqual([]);
        });
      }
    });
  }
});

test.describe("PD-TIMELINE-6: the table stays a table for assistive tech", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const width of [320, 1440]) {
      test(`axe, ${colorScheme}, ${String(width)}px, folds open`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        for (const [fixture, pkg] of [MEILI, RECTOR, RESUME]) {
          await openTimeline(page, fixture, pkg);
          for (const button of await page.locator(".detail-timeline-fold-btn").all()) await button.click();
          const results = await new AxeBuilder({ page }).include(".detail-timeline").analyze();
          expect(results.violations.map((v) => `${pkg}: ${v.id}`)).toEqual([]);
        }
      });
    }
  }
});

test.describe("PD-TIMELINE-4: forced colours keep every marker, by shape", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`${colorScheme}: your ring, the newest disc and the lines differ from the page`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, forcedColors: "active" });
      await openTimeline(page, ...MEILI);
      const colours = await page.locator(".detail-timeline").evaluate((section) => {
        const style = (selector: string): CSSStyleDeclaration => {
          const element = section.querySelector(selector);
          if (element === null) throw new Error(`no ${selector}`);
          return getComputedStyle(element);
        };
        return {
          canvas: getComputedStyle(document.body).backgroundColor,
          mineRing: style(".is-mine .detail-timeline-dot").borderTopColor,
          mineLine: style(".is-mine .detail-timeline-tail").backgroundColor,
          newestDisc: style(".is-newest .detail-timeline-dot").backgroundColor,
          otherLine: style(
            ".detail-timeline-row:not(.is-mine):not(.is-newest):not(.detail-timeline-head) .detail-timeline-tail",
          ).backgroundColor,
        };
      });
      expect(colours.mineRing).not.toBe(colours.canvas);
      expect(colours.mineLine).not.toBe(colours.canvas);
      expect(colours.newestDisc).not.toBe(colours.canvas);
      expect(colours.otherLine).not.toBe(colours.canvas);
    });
  }
});
