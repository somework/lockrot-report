import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { radiusKids, radiusRow, radiusRowPackages, radiusSurface } from "./support/report2/radius";
import { report2Pages } from "../scripts/report2-embed.ts";

test.describe("report-2: the Blast radius tab reads chain, direct_dependents and S7", () => {
  const WALLABAG = "baselined-wallabag-2.6";
  const wallabag = report2Pages().find((p) => p.name === `report2-${WALLABAG}`)?.embed.report;
  const go = async (page: Page, caseName: string, hash = "", width = 1440): Promise<void> => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(report2Url(caseName) + "#view=radius" + hash);
    await expect(radiusSurface(page).locator(".r2-answer")).toBeVisible();
  };

  test("answers first, with the one requirement the composite's transitive package sits under", async ({
    page,
  }) => {
    await go(page, "composite");
    // composite: symfony/polyfill-intl-idn (low) reaches through guzzlehttp/guzzle, the one exposure row.
    await expect(radiusSurface(page).locator(".r2-answer")).toHaveText(
      "1 flagged package pulled in, under guzzlehttp/guzzle.",
    );
    await expect(radiusRow(page, "guzzlehttp/guzzle").locator(".r2-say")).toHaveText(
      "Pulls in 1 flagged package: 1 low.",
    );
  });

  test("the toggle states as many packages as the row then lists", async ({ page }) => {
    await go(page, WALLABAG);
    const toggle = radiusRow(page, "kphoen/rulerz").getByRole("button", { name: /Show the \d+ packages/ });
    const stated = Number(
      /Show the (\d+) packages/.exec((await toggle.getAttribute("aria-label")) ?? "")?.[1],
    );
    await toggle.click();
    expect(stated).toBeGreaterThan(0);
    expect((await radiusKids(page, "kphoen/rulerz")).length).toBe(stated);
  });

  test("ranks the requirements by the packages listed under them, most first", async ({ page }) => {
    await go(page, WALLABAG);
    const counts = await radiusSurface(page)
      .locator("ul.r2-list")
      .first()
      .locator(":scope > li .r2-say")
      .allTextContents();
    const numbers = counts.map((text) => Number(/Pulls in (\d+)/.exec(text)?.[1] ?? "0"));
    expect(numbers.length).toBeGreaterThan(1);
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  });

  test("a toggle opens the row's packages as a tree; every package is one the requirement's S7 lists", async ({
    page,
  }) => {
    await go(page, WALLABAG);
    const toggle = radiusRow(page, "kphoen/rulerz").getByRole("button", { name: /Show the \d+ packages/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const kids = await radiusKids(page, "kphoen/rulerz");
    const listed = (
      wallabag?.findings
        .find((f) => f.package === "kphoen/rulerz")
        ?.signals.find((signal) => signal.id === "S7")?.data as
        { packages: { package: string }[] } | undefined
    )?.packages.map((entry) => entry.package);
    expect(kids.length).toBeGreaterThan(0);
    expect(listed).toEqual(expect.arrayContaining(kids));
    // The toggle opens the tree; it does not open the requirement's detail.
    await expect.poll(() => page.evaluate(() => location.hash)).not.toContain("pkg=");
  });

  test("a #pkg= link to a listed package opens the row that lists it", async ({ page }) => {
    await go(page, WALLABAG, "&pkg=hoa%2Fruler");
    await expect(radiusRow(page, "kphoen/rulerz").getByRole("button", { name: /Show the/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(radiusRow(page, "kphoen/rulerz").locator('li[data-pkg="hoa/ruler"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("j walks into an open row's packages and never into a folded one", async ({ page }) => {
    await go(page, WALLABAG);
    await radiusRow(page, "kphoen/rulerz")
      .getByRole("button", { name: /Show the/ })
      .click();
    const [firstKid] = await radiusKids(page, "kphoen/rulerz");
    await radiusRow(page, "kphoen/rulerz").focus();
    await page.keyboard.press("j");
    await expect(radiusRow(page, "kphoen/rulerz").locator(`li[data-pkg="${firstKid ?? ""}"]`)).toBeFocused();
  });

  test("the one-each rows and the tails fold, and open on demand", async ({ page }) => {
    await go(page, WALLABAG, "", 390);
    const singles = radiusSurface(page).getByRole("button", {
      name: /more pull in one flagged package each/,
    });
    await expect(singles).toHaveAttribute("aria-expanded", "false");
    const before = (await radiusRowPackages(page)).length;
    await singles.click();
    await expect(singles).toHaveAttribute("aria-expanded", "true");
    expect((await radiusRowPackages(page)).length).toBeGreaterThan(before);
    const self = radiusSurface(page).getByRole("button", { name: /flagged themselves/ });
    await self.click();
    await expect(self).toHaveAttribute("aria-expanded", "true");
  });

  test("an unflagged dev requirement still says dev", async ({ page }) => {
    // wallabag-main: phpunit/phpunit is require-dev, verdict ok, and lists flagged packages.
    await go(page, "baselined-wallabag-main");
    await expect(radiusRow(page, "phpunit/phpunit").locator(".r2-line .fc-dev")).toHaveText("dev");
  });

  test("a listed package says its grade in words, so forced colours keep it", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await go(page, WALLABAG, "&pkg=hoa%2Fruler");
    const kid = radiusRow(page, "kphoen/rulerz").locator('li[data-pkg="hoa/ruler"]');
    const verdict = wallabag?.findings.find((f) => f.package === "hoa/ruler")?.verdict ?? "";
    expect(verdict).not.toBe("");
    await expect(kid.locator(".r2-grade")).toHaveText(verdict);
  });

  for (const width of [390, 1440]) {
    test(`no horizontal overflow at ${String(width)}px with a row open`, async ({ page }) => {
      await go(page, WALLABAG, "&pkg=hoa%2Fruler", width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`no serious axe violation with a row and the folds open, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await go(page, WALLABAG, "&pkg=hoa%2Fruler");
      await radiusSurface(page)
        .getByRole("button", { name: /flagged themselves/ })
        .click();
      const results = await new AxeBuilder({ page }).include('[data-surface="radius"]').analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});
