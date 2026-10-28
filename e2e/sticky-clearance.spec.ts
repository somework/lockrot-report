/**
 * R6-49, R6-50: in each scroller, what focus, a jump or `j`/`k` brings into view lands below every
 * sticky layer of that scroller (DESIGN.md §8, PD-ROWS-10). WCAG 2.2 SC 2.4.11.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { report2Url, sheetUrl } from "./support/pages";
import { detailSurface } from "./support/report2/detail";

const SHEET = "drupal-site-drupal-core";
const CORE = "drupal/core";
const LIST = "baselined-wallabag-main";

interface Miss {
  /** `under`: a layer inside the focused element's scroller covers it. `clipped`: the scroller's
   *  own edge hides it. */
  readonly kind: "under" | "clipped";
  readonly what: string;
}

/** Why the focused element's first line does not show at its two ends, or null when it shows.
 *  Firefox may leave a wrapped link's top few pixels under a head, which still shows the focus. */
async function missOfFocus(page: Page): Promise<Miss | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return null;
    const box = el.getClientRects()[0];
    if (box === undefined || box.width < 4 || box.height < 4) return null;
    let scroller = el.parentElement;
    while (scroller !== null && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    const view = scroller?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const name = `${el.tagName} "${el.textContent.trim().slice(0, 40)}"`;
    const y = box.top + box.height / 2;
    if (y < view.top || y > view.bottom) return { kind: "clipped", what: name };
    for (const x of [box.left + 2, box.right - 2]) {
      const hit = document.elementFromPoint(x, y);
      // An ancestor answers at a rounded corner of the element: it shows through, it does not cover.
      if (hit !== null && !el.contains(hit) && !hit.contains(el))
        return { kind: "under", what: `${name} under ${hit.className || hit.tagName}` };
    }
    return null;
  });
}

/** Walks focus through `root` with `key`, from the element `start` focuses, and lists each miss. */
async function walk(
  page: Page,
  root: Locator,
  start: "first" | "last",
  key: "Tab" | "Shift+Tab",
): Promise<Miss[]> {
  await root.evaluate((node, at) => {
    const all = [
      ...node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex='0'], summary"),
    ];
    const visible = all.filter((el) => el.getClientRects().length > 0);
    (at === "first" ? visible[0] : visible.at(-1))?.focus();
  }, start);
  const misses: Miss[] = [];
  // The start is the test's own focus() call, whose scroll differs between engines: only keys count.
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press(key);
    const inside = await root.evaluate((node) => node.contains(document.activeElement));
    if (!inside) break;
    const miss = await missOfFocus(page);
    if (miss !== null) misses.push(miss);
  }
  return misses;
}

const under = (misses: readonly Miss[]): Miss[] => misses.filter((miss) => miss.kind === "under");

async function bottomOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("not on screen");
  return box.y + box.height;
}

for (const width of [375, 600, 768, 1440]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
    });

    test("Tab and Shift+Tab through an open package never put the focus under its head", async ({ page }) => {
      await page.goto(`${sheetUrl(SHEET)}#pkg=${encodeURIComponent(CORE)}`);
      const sheet = detailSurface(page);
      await sheet.waitFor();

      expect(under(await walk(page, sheet, "last", "Shift+Tab"))).toEqual([]);
      expect(under(await walk(page, sheet, "first", "Tab"))).toEqual([]);
    });

    test("Tab and Shift+Tab through the glossary never put the focus under its head", async ({ page }) => {
      await page.goto(`${report2Url("composite")}#view=findings`);
      await page.keyboard.press("?");
      const dialog = page.locator("dialog.glossary");
      await expect(dialog).toBeVisible();

      expect(await walk(page, dialog, "last", "Shift+Tab")).toEqual([]);
      expect(await walk(page, dialog, "first", "Tab")).toEqual([]);
    });

    test("a jump inside the open package lands below its head", async ({ page }) => {
      await page.goto(`${sheetUrl(SHEET)}#pkg=${encodeURIComponent(CORE)}`);
      const sheet = detailSurface(page);
      await sheet.waitFor();
      const before = await page.evaluate(() => window.scrollY);
      const jump = sheet.getByRole("link", { name: "38 unrated, show the group" });
      const target = page.locator(`[id="${(await jump.getAttribute("href"))?.slice(1) ?? ""}"]`);

      await jump.click();
      await expect(target).toBeFocused();

      const head = await bottomOf(sheet.locator(".detail-head"));
      await expect.poll(async () => (await target.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(head - 1);
      if (width >= 1000) expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  });
}

test.describe("the list heads", () => {
  test.use({ reducedMotion: "reduce" });

  test("j and k keep each row below the Findings column head, with a package open at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(`${report2Url(LIST)}#view=findings`);
    const first = page.locator("[data-pkg]").first();
    await first.click();
    await detailSurface(page).waitFor();
    const head = page.locator(".f2-head").first();
    const tops: { pkg: string | null; top: number; head: number }[] = [];
    for (const key of [...Array<string>(14).fill("j"), ...Array<string>(6).fill("k")]) {
      await page.keyboard.press(key);
      const row = page.locator("[data-pkg]:focus");
      tops.push({
        pkg: await row.getAttribute("data-pkg"),
        top: (await row.boundingBox())?.y ?? -1,
        head: await bottomOf(head),
      });
    }

    expect(tops.filter(({ top, head: bottom }) => top < bottom - 1)).toEqual([]);
  });

  test("Tab keeps each advisory link below the stuck Advisories head at 600px", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 700 });
    await page.goto(`${report2Url(LIST)}#view=advisories`);
    const ledger = page.locator(".aledger");
    const head = ledger.locator(".al-head");
    await expect(head).toBeVisible();
    await head.evaluate((el) => {
      el.parentElement?.scrollIntoView({ block: "start" });
      window.scrollBy(0, 200);
    });

    expect(under(await walk(page, ledger, "first", "Tab"))).toEqual([]);
  });

  test("a focus press on an Overview chart mark puts the list's top just under the header at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(report2Url(LIST));
    await page.evaluate(() => {
      window.scrollTo(0, 400);
    });
    await page.locator('[data-surface="overview"] a[href*="view="]').first().click();

    const panel = page.getByRole("tabpanel");
    const header = await bottomOf(page.locator(".topbar"));
    const listHead = await page.evaluate(
      () => parseFloat(document.documentElement.style.getPropertyValue("--list-head-h")) || 0,
    );
    await expect.poll(async () => (await panel.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(header - 1);
    expect((await panel.boundingBox())?.y ?? Infinity).toBeLessThanOrEqual(header + listHead + 8 + 1);
  });
});
