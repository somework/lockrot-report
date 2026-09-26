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

/**
 * Opens every fold and waits until the page is still: each button reports itself expanded, and no
 * animation is left running. A phone-width detail slides in as a sheet (app.css `sheet-in`), and
 * an axe colour-contrast pass taken mid-slide read half-faded text — one run in eighty failed so.
 */
async function openFolds(page: Page): Promise<void> {
  const buttons = page.locator(".detail-timeline-fold-btn");
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

const MEILI = [FIXTURES.koel, "meilisearch/meilisearch-php"] as const;
const RESUME = [FIXTURES.koel, "daverandom/resume"] as const;
const PREDIS = [FIXTURES.koel, "predis/predis"] as const;
const RECTOR = [FIXTURES.mautic, "rector/rector"] as const;
const BRICK = [FIXTURES.mautic, "brick/math"] as const;
const OTPHP = [FIXTURES.wallabag, "spomky-labs/otphp"] as const;
const PDFPARSER = [FIXTURES.wallabag, "smalot/pdfparser"] as const;

test.describe("PD-TIMELINE-7: the answer comes first", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("meilisearch-php: where you are, then what is newer", async ({ page }) => {
    await openTimeline(page, ...MEILI);
    await expect(page.locator(".detail-timeline-answer")).toHaveText(
      "Your branch, 0.24.x, had its last release 4.1 years ago.",
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

  test("no year label sits on a threshold guide, and each hangs from its own tick", async ({ page }) => {
    for (const [fixture, pkg] of [MEILI, RESUME, PDFPARSER, RECTOR, BRICK]) {
      await openTimeline(page, fixture, pkg);
      const clashes = await page.locator(".detail-timeline").evaluate((section) => {
        const guides = Array.from(
          section.querySelectorAll(".detail-timeline-head ~ .detail-timeline-row .detail-timeline-guide"),
        )
          .slice(0, 2)
          .map((guide) => guide.getBoundingClientRect().left);
        const found: string[] = [];
        for (const year of section.querySelectorAll<HTMLElement>(".detail-timeline-year")) {
          const box = year.getBoundingClientRect();
          for (const x of guides) if (x > box.left - 2 && x < box.right + 2) found.push(year.textContent);
          if (getComputedStyle(year, "::before").content === "none")
            found.push(`${year.textContent} has no tick`);
        }
        return found;
      });
      expect(clashes, pkg).toEqual([]);
    }
  });

  test("the guides' captions sit above their own lines, clear of the LATEST header", async ({ page }) => {
    await openTimeline(page, ...MEILI);
    const latest = await page.getByRole("columnheader", { name: "latest" }).boundingBox();
    for (const level of ["warn", "high"]) {
      const caption = await page.locator(`.detail-timeline-guide-cap.is-${level}`).boundingBox();
      const guide = await page
        .locator(`.detail-timeline-row.is-mine .detail-timeline-guide.is-${level}`)
        .boundingBox();
      if (caption === null || guide === null || latest === null) throw new Error(`no ${level} box`);
      const lineX = level === "high" ? caption.x + caption.width : caption.x;
      expect(Math.abs(lineX - (level === "high" ? guide.x + guide.width : guide.x))).toBeLessThanOrEqual(1);
      expect(caption.x + caption.width).toBeLessThan(latest.x);
    }
  });

  test("a release from last week sits on the today rule itself", async ({ page }) => {
    // predis/predis 3.x: v3.6.1, six days before the report.
    await openTimeline(page, ...PREDIS);
    const strip = await page.locator(".detail-timeline-row.is-newest .detail-timeline-strip").boundingBox();
    const dot = await page.locator(".detail-timeline-row.is-newest .detail-timeline-dot").boundingBox();
    if (strip === null || dot === null) throw new Error("the newest row has no strip or dot");
    expect(Math.abs(dot.x + dot.width / 2 - (strip.x + strip.width))).toBeLessThanOrEqual(2);
  });
});

test.describe("PD-TIMELINE-11: every dot at its true date, however recent", () => {
  for (const width of [390, 1440]) {
    test(`brick/math, folds open, ${String(width)}px: a newer release is never drawn left of an older one`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openTimeline(page, ...BRICK);
      await openFolds(page);
      const problems = await page.locator(".detail-timeline").evaluate((section) => {
        const found: string[] = [];
        const lanes = Array.from(section.querySelectorAll<HTMLElement>(".detail-timeline-strip[title]")).map(
          (strip) => {
            const dot = strip.querySelector(".detail-timeline-dot");
            if (dot === null) throw new Error("a lane without a dot");
            const box = strip.getBoundingClientRect();
            const mark = dot.getBoundingClientRect();
            const share = Number.parseFloat(strip.style.getPropertyValue("--x")) / 100;
            return {
              date: strip.title.split(" · ")[1] ?? "",
              centre: mark.left + mark.width / 2,
              // Where the date falls on the axis, in pixels, with no minimum stub or clamp.
              truth: box.left + share * (box.width - parseFloat(getComputedStyle(strip).borderRightWidth)),
            };
          },
        );
        for (const lane of lanes) {
          if (Math.abs(lane.centre - lane.truth) > 1) found.push(`${lane.date} drawn off its date`);
        }
        const byDate = [...lanes].sort((a, b) => a.date.localeCompare(b.date));
        byDate.slice(1).forEach((lane, index) => {
          const before = byDate[index];
          if (before !== undefined && lane.centre < before.centre - 0.5)
            found.push(`${lane.date} left of the older ${before.date}`);
        });
        return found;
      });
      expect(problems).toEqual([]);
    });
  }

  test("rector: the axis keeps a year between its first and today (1440px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTimeline(page, ...RECTOR);
    await expect(page.locator(".detail-timeline-year:visible")).toHaveText(["2017", "2020"]);
  });
});

test.describe("PD-TIMELINE-2: nothing clipped, wrapped mid-word or ellipsised on a phone", () => {
  for (const width of [320, 390]) {
    test.describe(`${String(width)}px`, () => {
      test.use({ viewport: { width, height: 844 } });

      for (const [fixture, pkg] of [MEILI, RECTOR, BRICK, OTPHP]) {
        test(pkg, async ({ page }) => {
          await openTimeline(page, fixture, pkg);
          await openFolds(page);

          const problems = await page.locator(".detail-timeline").evaluate((section) => {
            const found: string[] = [];
            if (section.scrollWidth > section.clientWidth + 1) found.push("section scrolls sideways");
            const cells = section.querySelectorAll<HTMLElement>(
              "[role='cell'], [role='rowheader'], [role='columnheader'], p, b",
            );
            for (const cell of cells) {
              if (getComputedStyle(cell).textOverflow === "ellipsis")
                found.push(`ellipsis: ${cell.className}`);
              // A strip's dot may overhang its today rule on purpose — a release from last week sits
              // on the rule (PD-TIMELINE-11) — so a strip is checked against its neighbour instead.
              // The same for the guides' captions, which may hang into the gaps either side of theirs.
              if (cell.matches(".detail-timeline-strip, .detail-timeline-strip-head")) continue;
              if (cell.scrollWidth > cell.clientWidth + 1 && cell.clientWidth > 0) {
                found.push(`overflow: ${cell.className} "${cell.textContent}"`);
              }
            }
            const latest = section
              .querySelector(".detail-timeline-head > :nth-child(3)")
              ?.getBoundingClientRect();
            const branch = section
              .querySelector(".detail-timeline-head > :nth-child(1)")
              ?.getBoundingClientRect();
            for (const caption of section.querySelectorAll(".detail-timeline-guide-cap")) {
              const box = caption.getBoundingClientRect();
              // One fixed pattern at every width: "5y", "3y" — never "5y ago" at one width only.
              if (!/^\d+y$/.test(caption.textContent)) found.push(`caption "${caption.textContent}"`);
              if (latest !== undefined && box.right > latest.left - 4)
                found.push(`${caption.textContent} meets LATEST`);
              if (branch !== undefined && box.left < branch.right + 2)
                found.push(`${caption.textContent} meets BRANCH`);
            }
            for (const dot of section.querySelectorAll(".detail-timeline-dot")) {
              const next = dot.closest("[role='cell']")?.nextElementSibling;
              if (next != null && dot.getBoundingClientRect().right > next.getBoundingClientRect().left)
                found.push(`a dot runs into "${next.textContent}"`);
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
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        for (const [fixture, pkg] of [MEILI, RECTOR, RESUME]) {
          await openTimeline(page, fixture, pkg);
          await openFolds(page);
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
