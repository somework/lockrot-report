import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { radiusKids, radiusRow, radiusRowPackages, radiusSurface } from "./support/report2/radius";
import { report2Pages } from "../scripts/report2-embed.ts";

test.describe("report-2: the Blast radius tab reads exposure and S7", () => {
  const WALLABAG = "baselined-wallabag-2.6";
  const wallabag = report2Pages().find((p) => p.name === `report2-${WALLABAG}`)?.embed.report;
  const go = async (page: Page, caseName: string, hash = "", width = 1440): Promise<void> => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(report2Url(caseName) + "#view=radius" + hash);
    await expect(radiusSurface(page).locator(".r2-answer")).toBeVisible();
  };

  test("answers first, with the requirement that holds half of the flagged packages pulled in", async ({
    page,
  }) => {
    await go(page, "composite");
    // composite: symfony/polyfill-intl-idn (low) reaches through guzzlehttp/guzzle and
    // friendsofsymfony/oauth2-php (low) through friendsofsymfony/oauth-server-bundle: the two
    // exposure rows, one flagged package each, so the first holds half of the 2.
    await expect(radiusSurface(page).locator(".r2-answer")).toHaveText(
      "2 flagged packages pulled in. 1 of them sits under friendsofsymfony/oauth-server-bundle.",
    );
    for (const pkg of ["friendsofsymfony/oauth-server-bundle", "guzzlehttp/guzzle"]) {
      await expect(radiusRow(page, pkg).locator(".r2-count")).toHaveText("1 flagged");
      await expect(radiusRow(page, pkg).locator(".r2-mix")).toHaveText("1 low");
    }
  });

  test("M25: the toggle states as many packages as the row then lists", async ({ page }) => {
    await go(page, WALLABAG);
    const toggle = radiusRow(page, "kphoen/rulerz").getByRole("button", { name: /Show the \d+ packages/ });
    const stated = Number(
      /Show the (\d+) packages/.exec((await toggle.getAttribute("aria-label")) ?? "")?.[1],
    );
    await toggle.click();
    expect(stated).toBeGreaterThan(0);
    expect((await radiusKids(page, "kphoen/rulerz")).length).toBe(stated);
  });

  test("lists the requirements in the order of report.exposure, each with its exposure count", async ({
    page,
  }) => {
    await go(page, WALLABAG);
    await radiusSurface(page)
      .getByRole("button", { name: /more pull in one flagged package each/ })
      .evaluate((button) => {
        if (button.getAttribute("aria-expanded") === "false") (button as HTMLButtonElement).click();
      });
    const exposure = wallabag?.exposure ?? [];
    expect(exposure.length).toBeGreaterThan(1);
    await expect.poll(() => radiusRowPackages(page)).toEqual(exposure.map((entry) => entry.package));
    const counts = await radiusSurface(page).locator("li.r2-row > .r2-line .r2-n").allTextContents();
    expect(counts.map(Number)).toEqual(exposure.map((entry) => entry.flagged));
    await expect(radiusSurface(page)).not.toContainText("listing nothing flagged");
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

  test("a #pkg= link to a listed package opens the first row that lists it, and only that one", async ({
    page,
  }) => {
    // hoa/ruler is in the S7 of kphoen/rulerz-bundle, first on exposure[], and of kphoen/rulerz.
    await go(page, WALLABAG, "&pkg=hoa%2Fruler");
    await expect(
      radiusRow(page, "kphoen/rulerz-bundle").getByRole("button", { name: /Show the/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(radiusRow(page, "kphoen/rulerz").getByRole("button", { name: /Show the/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(radiusRow(page, "kphoen/rulerz-bundle").locator('li[data-pkg="hoa/ruler"]')).toHaveAttribute(
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

  test("the one-each rows fold, and open on demand", async ({ page }) => {
    await go(page, WALLABAG, "", 390);
    const singles = radiusSurface(page).getByRole("button", {
      name: /more pull in one flagged package each/,
    });
    await expect(singles).toHaveAttribute("aria-expanded", "false");
    const before = (await radiusRowPackages(page)).length;
    await singles.click();
    await expect(singles).toHaveAttribute("aria-expanded", "true");
    expect((await radiusRowPackages(page)).length).toBeGreaterThan(before);
  });

  test("an unflagged dev requirement still says dev", async ({ page }) => {
    // wallabag-main: phpunit/phpunit is require-dev, verdict ok, and lists flagged packages.
    await go(page, "baselined-wallabag-main");
    await expect(radiusRow(page, "phpunit/phpunit").locator(".r2-line .fc-dev")).toHaveText("dev");
  });

  test("a listed package says its grade in words, so forced colours keep it", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await go(page, WALLABAG, "&pkg=hoa%2Fruler");
    const kid = radiusRow(page, "kphoen/rulerz-bundle").locator('li[data-pkg="hoa/ruler"]');
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
      const results = await new AxeBuilder({ page }).include('[data-surface="radius"]').analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});
