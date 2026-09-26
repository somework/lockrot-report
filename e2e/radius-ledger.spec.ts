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
    "wallabag/rulerz (14) and phpunit/phpunit (13) pull in 27 of the 49 flagged packages that sit under 17 of the 29 direct requirements lockrot's exposure list names.",
  );
  // Every requirement the tab names: 17 ranked, 5 flagged themselves, 7 through rows above — and
  // the 8 flagged direct requirements with nothing flagged counted under them, which the footnote names.
  expect(await report.countLine()).toBe(
    "29 of 29 direct requirements on the exposure list, plus 8 of 8 flagged ones with nothing flagged counted under them",
  );
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

test("under the rail's Direct filter every sentence says it counts matching packages only", async ({
  page,
}) => {
  await open(page, "view=radius&scope=direct");

  // The answer says what the filter shows, not only what it does not: 12 rows below, 8 in the
  // footnote.
  await expect(page.locator(".rl-answer")).toHaveText(
    "The filter matches 20 flagged direct requirements themselves, and nothing listed under any of them: 12 on lockrot's exposure list, below, and 8 with nothing flagged counted under them, at the end.",
  );
  await expect(page.locator(".rl-scope")).toHaveText(
    "Only flagged packages that match the filter are counted. Without it, 49 sit under 17 of the 29 direct requirements lockrot's exposure list names.",
  );
  // Nothing ranks, so the "flagged themselves" tail is the list: a heading over rows always shown,
  // not a fold, and it says no "more".
  await expect(
    page.getByRole("button", { name: /^12 direct requirements match the filter themselves/ }),
  ).toHaveCount(0);
  const self = page.locator("#rl-fold-self");
  await expect(self).toContainText(/^12 direct requirements match the filter themselves/);
  await expect(self).toContainText("nothing listed under them does");
  await expect(page.getByRole("list", { name: "Direct requirements flagged themselves" })).toBeVisible();
  // The tail's own head says its ages are each requirement's own, and a row listing nothing shows a
  // dash where the squares go, never a "0".
  await expect(page.locator(".rl-head.is-own")).toContainText("Its own years since release");
  await expect(row(page, "wallabag/rulerz").locator(".rl-num")).toHaveText("–");
  await expect(row(page, "wallabag/rulerz")).toContainText(
    "None of the 14 flagged packages listed under it match the filter.",
  );
  // 12 rows and the footnote's 8: the rail's Direct count, and with Transitive the band's 69.
  await expect(page.locator(".rl-foot")).toContainText("8 flagged direct requirements have");
  expect(await report.countLine()).toMatch(/^12 of 29 direct requirements/);
});

test("a search narrows the answer to what matches it", async ({ page }) => {
  await open(page, "view=radius&q=hoa");

  await expect(page.locator(".rl-answer")).toHaveText(
    "Of the 29 direct requirements lockrot's exposure list names, only wallabag/rulerz has matching flagged packages under it: 14.",
  );
  // rulerz-bundle's name lacks "hoa": the tail head says the match is in its evidence, not itself.
  await page.getByRole("button", { name: /^1 more matches “hoa” only in its own evidence/ }).click();
  const bundle = row(page, "wallabag/rulerz-bundle");
  // Its 15 (lockrot's count, the one its evidence quotes) as 14 + 1, in one statement.
  await expect(bundle).toContainText(
    "Of the 15 flagged packages it pulls in, 14 that match are listed under wallabag/rulerz; the other one, listed under it, does not match.",
  );
  await expect(bundle).not.toContainText("Reaches 14 flagged packages");
  await expect(bundle.locator("mark")).toHaveText("hoa");
  await expect(bundle).toContainText("matched in:");
});

test("the footnote's names open the same detail as Findings", async ({ page }) => {
  await open(page, "view=radius");

  await page.locator(".rl-foot").getByRole("button", { name: "lcobucci/jwt" }).click();

  expect((await report.detail()).name).toBe("lcobucci/jwt");
  expect(await page.evaluate(() => location.hash)).toBe("#view=radius&pkg=lcobucci%2Fjwt");
});

test("beside an open package the squares stay in the requirement's column, off the age axis", async ({
  page,
}) => {
  for (const [hash, width] of [
    ["view=radius&pkg=phpunit%2Fphpunit", 1440],
    ["view=radius", 1024],
  ] as const) {
    await open(page, hash, width);
    const line = row(page, "phpunit/phpunit").locator(".rr-line").first();
    const squares = await line.locator(".rl-sq").boundingBox();
    const age = await line.locator(".fc-age").boundingBox();
    const axis = await page.locator(".rl-head:not(.is-own) .fhead-age").boundingBox();
    if (!squares || !age || !axis) throw new Error("no box");
    expect(squares.x + squares.width).toBeLessThanOrEqual(axis.x);
    expect(age.x).toBeGreaterThanOrEqual(axis.x - 1);
  }
});

// The ranked list's sticky head ("Their years since release") stops where the ranked rows do, so
// it never sits over the "flagged themselves" tail's own head ("Its own years since release").
test("on a phone the tail's own column head never shares the top with the ranking's", async ({ page }) => {
  await open(page, "view=radius", 390);
  await page.getByRole("button", { name: /^5 more are flagged themselves/ }).click();
  const own = page.locator(".rl-head.is-own");
  const main = page.locator(".rl-ranked > .rl-head");
  // Scroll the tail's first row to the top: its head is then stuck there.
  await row(page, "scheb/2fa-backup-code").evaluate((el) => {
    el.scrollIntoView({ block: "start" });
  });
  const ownBox = await own.boundingBox();
  const mainBox = await main.boundingBox();
  if (ownBox === null || mainBox === null) throw new Error("a head has no box");
  expect(ownBox.y).toBeLessThan(40);
  expect(mainBox.y + mainBox.height).toBeLessThanOrEqual(ownBox.y + 1);
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
