import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, pageUrl } from "./support/pages";

/**
 * PD-RADIUS-1..5 (DESIGN.md §5): the Blast radius tab as a ranked ledger over wallabag_wallabag —
 * 29 direct requirements, 17 listing flagged packages (wallabag/rulerz 14, phpunit/phpunit 13), 5
 * flagged themselves with nothing listed, 7 reaching flagged packages only through rows above.
 */
let report: ReportPage;

async function open(page: Page, hash: string, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  report = await createReportPage(page);
  await page.goto(pageUrl(FIXTURES.wallabag) + "#" + hash);
}

const row = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

test("answers first: the fewest rows that hold half of what is listed", async ({ page }) => {
  await open(page, "view=radius");

  await expect(page.locator(".rl-answer")).toHaveText(
    "wallabag/rulerz (14) and phpunit/phpunit (13) pull in 27 of the 49 flagged packages that sit under 17 of your 29 direct requirements.",
  );
  expect(await report.countLine()).toBe("22 of 29 direct requirements");
});

test("a row's toggle shows its packages as a tree; the requirement opens the full Findings detail", async ({
  page,
}) => {
  await open(page, "view=radius");
  const toggle = page.getByRole("button", { name: "Show the 14 packages listed under wallabag/rulerz" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "hoa/compiler")).toBeHidden();

  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "hoa/compiler")).toBeVisible();
  // The toggle opened no package.
  expect((await report.detail()).open).toBe(false);

  await row(page, "wallabag/rulerz").locator(".rr-line .rr-name").click();
  const detail = await report.detail();
  expect(detail.name).toBe("wallabag/rulerz");
  // The same detail a Findings row opens: the checks strip and the answer sentence.
  expect(detail.text).toContain("S10");
  expect(await page.evaluate(() => location.hash)).toBe("#view=radius&pkg=wallabag%2Frulerz");
});

test("a #pkg= link to a listed package opens the row that lists it, the address format unchanged", async ({
  page,
}) => {
  await open(page, "view=radius&pkg=hoa%2Fcompiler");

  await expect(row(page, "hoa/compiler")).toBeVisible();
  await expect(row(page, "hoa/compiler")).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => location.hash)).toBe("#view=radius&pkg=hoa%2Fcompiler");
});

test("j/k walk the rows on screen, into an open row's packages and never a folded one", async ({ page }) => {
  await open(page, "view=radius");
  await page.getByRole("button", { name: "Show the 14 packages listed under wallabag/rulerz" }).click();

  // Focus is on rulerz's toggle, inside its row: j goes on to the first package of its tree.
  await report.pressJ();
  expect((await report.detail()).name).toBe("hoa/consistency");
  await report.pressK();
  expect((await report.detail()).name).toBe("wallabag/rulerz");
  // From rulerz's last package, j goes to phpunit/phpunit itself, not into its folded packages.
  await row(page, "hoa/visitor").click();
  await report.pressJ();
  expect((await report.detail()).name).toBe("phpunit/phpunit");
  await report.pressJ();
  expect((await report.detail()).name).toBe("wallabag/phpepub");
});

test("'listed under' jumps to that row, opens it, focuses it and marks the package", async ({ page }) => {
  await open(page, "view=radius");

  await row(page, "scheb/2fa-google-authenticator")
    .getByRole("button", { name: "symfony/security-bundle" })
    .click();

  const target = row(page, "symfony/security-bundle");
  await expect(target).toBeFocused();
  await expect(row(page, "symfony/security-guard")).toBeVisible();
  await expect(row(page, "symfony/security-guard")).toHaveClass(/is-flash/);
});

test("the tails name every requirement left out of the ranking, and open on demand", async ({ page }) => {
  await open(page, "view=radius");
  const other = page.getByRole("button", { name: /7 more direct requirements reach flagged packages/ });
  await expect(other).toHaveAttribute("aria-expanded", "false");
  await expect(other).toContainText("dama/doctrine-test-bundle");

  await page.getByRole("button", { name: /7 that reach flagged packages only through rows above/ }).click();

  await expect(other).toHaveAttribute("aria-expanded", "true");
  await expect(other).toBeFocused();
  const receipt = row(page, "doctrine/cache").last();
  await expect(receipt).toContainText("listed under doctrine/doctrine-bundle");
  await expect(receipt).toContainText("also behind these 6");
  await expect(page.locator(".rl-foot")).toContainText("lcobucci/jwt");
});

test("on a phone the one-each rows start folded: no wall of rows", async ({ page }) => {
  await open(page, "view=radius", 390);
  const singles = page.getByRole("button", { name: /12 more pull in one flagged package each/ });

  await expect(singles).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "j0k3r/graby")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  await singles.click();
  await expect(row(page, "j0k3r/graby")).toBeVisible();
});

test("print opens every row and fold", async ({ page }) => {
  await open(page, "view=radius");
  await page.emulateMedia({ media: "print" });

  await expect(row(page, "hoa/compiler")).toBeVisible();
  await expect(row(page, "scheb/2fa-bundle")).toBeVisible();
  await expect(row(page, "doctrine/cache").last()).toBeVisible();
});

test("axe: no serious or critical violation with rows and folds open, both schemes", async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, "view=radius&pkg=hoa%2Fcompiler");
  await page.getByRole("button", { name: /7 more direct requirements/ }).click();
  for (const colorScheme of ["light", "dark"] as const) {
    // Reduced motion: a row's background eases between themes, and axe would read it mid-way.
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const results = await new AxeBuilder({ page }).include(".rl").analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .flatMap((v) =>
        v.nodes.map((n) => `${colorScheme} ${v.id}: ${n.target.join(" ")} ${n.failureSummary ?? ""}`),
      );
    expect(serious).toEqual([]);
  }
});
