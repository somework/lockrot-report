/**
 * PD-RADIUS-12: the flagged packages lockrot counts under no direct requirement (`unattributed`,
 * fan_in above `exposure_rule.max_fan_in`) as one sentence under the Blast radius table, with the
 * dots and the requirements each sits under one press away (the page's shared level-1 button).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, type FixtureName } from "./support/pages";

async function radius(page: Page, fixture: FixtureName, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(pageUrl(fixture) + "#view=radius");
  await expect(page.locator(".rl")).toBeVisible();
}

const line = (page: Page) => page.locator(".rl-shared-line");
const lines = async (page: Page): Promise<number> =>
  line(page).evaluate((el) => {
    const height = el.getBoundingClientRect().height;
    return Math.round(height / parseFloat(getComputedStyle(el).lineHeight));
  });

test.describe("PD-RADIUS-12: the shared tail", () => {
  test("one entry: the package, its verdict, its fan_in and the limit, in one line at 1440", async ({
    page,
  }) => {
    await radius(page, FIXTURES.miniEdges013);

    await expect(line(page)).toHaveText(
      "acme/shared-util (stale) is left out of Blast radius: 9 direct requirements share it, more than 8. Who shares it",
    );
    expect(await lines(page)).toBe(1);
  });

  for (const fixture of [
    FIXTURES.miniEdges013,
    FIXTURES.akaunting013,
    FIXTURES.wallabagGenerateBaseline013,
    FIXTURES.sharedMany,
  ] as const) {
    test(`${fixture}: closed, it takes two lines or fewer at 390`, async ({ page }) => {
      await radius(page, fixture, 390);

      expect(await lines(page)).toBeLessThanOrEqual(2);
      await expect(page.locator(".rl-sh-panel")).toBeHidden();
    });
  }

  test("more than one entry: counted at level 0, named with verdicts and fan_in at level 1, most shared first", async ({
    page,
  }) => {
    await radius(page, FIXTURES.wallabagGenerateBaseline013);

    await expect(line(page)).toHaveText(
      "2 flagged packages are left out of Blast radius: 9 to 11 direct requirements share each, more than 8. Which 2",
    );
    await page.getByRole("button", { name: "Which 2", exact: true }).click();
    const names = page.locator(".rl-sh-name");
    await expect(names).toHaveText(["doctrine/cache abandoned", "symfony/security-guard abandoned"]);
    await expect(page.locator(".rl-sh-n")).toHaveText(["11 share it", "9 share it"]);
    await expect(page.locator(".rl-sh-names").first()).toContainText("sits under craue/config-bundle");
  });

  test("level 1 opens by keyboard, is named by its words alone, and is labelled by what opened it", async ({
    page,
  }) => {
    await radius(page, FIXTURES.miniEdges013, 390);
    const toggle = page.getByRole("button", { name: "Who shares it", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.focus();
    await page.keyboard.press("Enter");

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("group", { name: "Who shares it" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("9 share it");
    await expect(panel).toContainText("sits under acme/direct-a, acme/direct-b");
    await expect(panel.locator(".rl-sh-dot")).toHaveCount(9);
    await expect(panel.locator(".rl-sh-dot.is-past")).toHaveCount(1);
    await expect(panel.locator(".rl-sh-tick-label")).toHaveText("at most 8");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    const box = await toggle.evaluate((el) => {
      const hit = getComputedStyle(el, "::after");
      return el.getBoundingClientRect().height - parseFloat(hit.top) - parseFloat(hit.bottom);
    });
    expect(box).toBeGreaterThanOrEqual(24);
  });

  test("the package name opens its detail and leaves level 1 as it was", async ({ page }) => {
    await radius(page, FIXTURES.akaunting013);

    await line(page).getByRole("button", { name: "league/config" }).click();

    await expect(page.getByRole("complementary", { name: "league/config" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Who shares it", exact: true })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("says require-dev is not counted only on a run that left it out", async ({ page }) => {
    await radius(page, FIXTURES.akaunting013);
    await page.getByRole("button", { name: "Who shares it", exact: true }).click();
    await expect(page.locator(".rl-sh-panel")).toContainText("(require-dev not counted)");

    await radius(page, FIXTURES.miniEdges013);
    await page.getByRole("button", { name: "Who shares it", exact: true }).click();
    await expect(page.locator(".rl-shared")).not.toContainText("require-dev");
  });

  test("twelve entries up to fan_in 97: the dots stop at twice the limit, the number says the rest", async ({
    page,
  }) => {
    await radius(page, FIXTURES.sharedMany, 390);

    await expect(line(page)).toHaveText(
      "12 flagged packages are left out of Blast radius: 9 to 97 direct requirements share each, more than 8. Which 12",
    );
    await page.getByRole("button", { name: "Which 12", exact: true }).click();
    const first = page.locator(".rl-sh-item").first();
    await expect(first.locator(".rl-sh-dot")).toHaveCount(16);
    await expect(first.locator(".rl-sh-clip")).toHaveText("…");
    await expect(first.locator(".rl-sh-n")).toHaveText("97 share it");
    const scale = await first.locator(".rl-sh-scale").boundingBox();
    expect(scale?.height ?? 99).toBeLessThanOrEqual(20);
    // Every name is in the page; the long list opens clamped, and its own button shows it whole.
    const names = first.locator(".rl-sh-names");
    await expect(names).toContainText("acme/module-097");
    const clamped = await names.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clamped).toBe(true);
    await first.getByRole("button", { name: "All 97", exact: true }).click();
    expect(await names.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("stays apart from the Unlisted footnote, with a rule between", async ({ page }) => {
    await radius(page, FIXTURES.miniEdges013);
    const foot = page.locator(".rl-shared + .rl-foot");

    await expect(foot).toContainText("flagged direct requirements have no row");
    expect(await foot.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid");
  });

  for (const fixture of [FIXTURES.koel013, FIXTURES.wallabag013, FIXTURES.wallabag, FIXTURES.koel] as const) {
    test(`${fixture}: nothing unattributed, or no list at all, draws nothing`, async ({ page }) => {
      await radius(page, fixture);

      await expect(page.locator(".rl-shared")).toHaveCount(0);
    });
  }

  test("prints open, without its button", async ({ page }) => {
    await radius(page, FIXTURES.akaunting013);

    await page.emulateMedia({ media: "print" });

    const printed = page.locator(".print-doc .rl-shared");
    await expect(printed.locator(".rl-sh-panel")).toBeVisible();
    await expect(printed).toContainText("sits under akaunting/laravel-firewall");
    await expect(printed.locator(".l1-btn")).toHaveCount(0);
  });

  test("in forced colours the dots keep their fill and ring, and the marker its shape", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await radius(page, FIXTURES.miniEdges013);
    await page.getByRole("button", { name: "Who shares it", exact: true }).click();

    const dots = await page.locator(".rl-sh-scale").evaluate((scale) => {
      const [filled, past] = [
        scale.querySelector(".rl-sh-dot:not(.is-past)"),
        scale.querySelector(".is-past"),
      ];
      const tick = scale.querySelector(".rl-sh-tick");
      return {
        filled: filled ? getComputedStyle(filled).backgroundColor : "",
        ring: past ? getComputedStyle(past).boxShadow : "",
        tick: tick ? getComputedStyle(tick).borderLeftStyle : "",
        canvas: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(dots.filled).not.toBe(dots.canvas);
    expect(dots.filled).not.toBe("rgba(0, 0, 0, 0)");
    expect(dots.ring).toContain("inset");
    expect(dots.tick).toBe("dashed");
    const marker = await page
      .locator(".rl-shared-line .l1-mark")
      .evaluate((el) => getComputedStyle(el, "::before").content);
    expect(marker).toContain("▶");
  });

  test("the Blast radius rows keep their height with the tail on the page", async ({ page }) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await radius(page, FIXTURES.miniEdges013, width);
      const heights = await page
        .locator(".rrow > .rr-line")
        .evaluateAll((rows) => rows.map((r) => Math.round(r.getBoundingClientRect().height)));
      await page.evaluate(() => {
        document.querySelector(".rl-shared")?.remove();
      });
      const bare = await page
        .locator(".rrow > .rr-line")
        .evaluateAll((rows) => rows.map((r) => Math.round(r.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThan(0);
      expect(heights, `at ${String(width)}px`).toEqual(bare);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds nothing serious with level 1 open, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await radius(page, FIXTURES.wallabagGenerateBaseline013);
      await page.getByRole("button", { name: "Which 2", exact: true }).click();

      const results = await new AxeBuilder({ page }).include(".rl-shared").analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});
