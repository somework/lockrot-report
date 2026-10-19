/**
 * The move check on the recorded page cases (SPEC §7.9.4 Ready to run, §7.9.16, §7.9.21): a ready
 * move, the three parts of the gate partition, a refused move beside a resolving one, a move that
 * was not checked, a refused baseline, and a run that checked no move.
 */
import { expect, test, type Page } from "@playwright/test";
import { report2Url } from "./support/pages";
import { findingsRowCell } from "./support/report2/findings";
import { overviewSurface } from "./support/report2/overview";
import { runSurface } from "./support/report2/run";

const readyBlock = (page: Page) => overviewSurface(page).locator(".ov-first");

test.describe("snipe-it, lockrot's engine run with a move check", () => {
  test("lists the ready moves, a ready move's Also holds, and the held and way-out lines", async ({
    page,
  }) => {
    await page.goto(report2Url("page-snipe-it"));
    const block = readyBlock(page);

    await expect(block.locator(".ov-first-note")).toHaveText(
      "for findings that fail the gate, in lockrot's rank order",
    );
    await expect(block.locator(".ov-move-pkg")).toHaveText([
      "mtdowling/jmespath.php",
      "league/commonmark",
      "pragmarx/google2fa-laravel",
    ]);
    await expect(block.locator(".ov-move").nth(2).locator(".ov-move-also")).toHaveText(
      "Also holds: bacon/bacon-qr-code (high), pragmarx/google2fa-qrcode (medium)",
    );
    await expect(block.locator(".ov-first-foot")).toContainText(
      "2 of 14 findings that fail the gate are held by other packages.",
    );
    await expect(block.locator(".ov-first-foot")).toContainText(
      "9 need another way out: 6 find an alternative, 1 raise PHP >=8.4, 1 test, 1 no move",
    );
  });

  test("shows a resolving move's command beside a refused move, which shows none and names its holders", async ({
    page,
  }) => {
    await page.goto(report2Url("page-snipe-it") + "#view=findings");

    expect(await findingsRowCell(page, "pragmarx/google2fa-laravel", "next")).toContain(
      "composer require 'pragmarx/google2fa-laravel:^2.3'",
    );
    const refused = await findingsRowCell(page, "bacon/bacon-qr-code", "next");
    expect(refused).toContain("held by pragmarx/google2fa-laravel and 1 more");
    expect(refused).not.toContain("composer require");
  });

  test("the way-out link opens exactly the findings it counts", async ({ page }) => {
    await page.goto(report2Url("page-snipe-it"));
    await readyBlock(page)
      .getByRole("link", { name: /need another way out/ })
      .click();

    await expect(page.locator('[data-surface="findings"] [role="row"][data-pkg]')).toHaveCount(9);
  });
});

test("snipe-it.unloaded‡ counts the move that was not checked by its reason", async ({ page }) => {
  await page.goto(report2Url("page-snipe-it.unloaded-dagger"));

  await expect(readyBlock(page).locator(".ov-move")).toHaveCount(2);
  await expect(readyBlock(page).locator(".ov-first-foot")).toContainText(
    "10 need another way out: 6 find an alternative, 1 raise PHP >=8.4, 1 test, 1 no move, 1 not checked: a package it needs could not be loaded",
  );
});

test.describe("wallabag-2.6, whose baseline Composer's solver refuses", () => {
  test("has no ready move, and counts the moves that were not checked by that reason", async ({ page }) => {
    await page.goto(report2Url("baselined-wallabag-2.6"));
    const block = readyBlock(page);

    await expect(block.locator(".ov-move")).toHaveCount(0);
    await expect(block.locator(".ov-first-none")).toHaveText(
      "No move is ready to run for the findings that fail the gate: none has a checked command that no other package holds.",
    );
    await expect(block.locator(".ov-first-foot")).toContainText(
      "28 not checked: Composer refuses the lock itself",
    );
  });

  test("names the refused lock in the Run tab, and prints the moves_not_checked note", async ({ page }) => {
    await page.goto(report2Url("baselined-wallabag-2.6") + "#view=run");
    const run = runSurface(page);

    await expect(run).toContainText("not checked, because Composer's solver refuses the lock itself");
    await expect(run).toContainText(
      "moves not checked: Composer's solver refuses the lock itself at php 8.4.99, so it would refuse every move",
    );
  });
});

test("the composite, a run that checked no move, has no ready move and says so in the way-out line", async ({
  page,
}) => {
  await page.goto(report2Url("composite"));
  const block = readyBlock(page);

  await expect(block.locator(".ov-move")).toHaveCount(0);
  await expect(block.locator(".ov-first-foot")).toContainText("not checked: the run checked no move");
  await expect(runSurface(page)).toHaveCount(0);
});
