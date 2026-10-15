import { expect, test } from "@playwright/test";
import { commandLines, detailSurface, golden, openDetail2, phpGolden } from "./support/report2/detail";

/**
 * The clipboard itself is the browser's: permissions for it exist only in Chromium, and a headless
 * WebKit refuses the write outright. What the page owns is the feedback, so the API is replaced
 * before the page loads — once resolving, once rejecting — and both branches are checked the same
 * way on every engine.
 */
function stubClipboard(mode: string): void {
  const writes: string[] = [];
  (window as unknown as { __copied: string[] }).__copied = writes;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text);
        return mode === "resolve" ? Promise.resolve() : Promise.reject(new Error("denied"));
      },
    },
  });
}

test.describe("report-2: the detail sheet and its copy control", () => {
  const B = "symfony/monolog-bridge";

  test("names a graded replacement the answer points at", async ({ page }) => {
    const sheet = await openDetail2(page, "replace-graded", "web-token/jwt-key-mgmt");

    await expect(sheet.locator(".d2-answer")).toHaveText(golden("answer", "replace-graded"));
  });

  test("names the package and its grade, and prints the golden answer above the copy control", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, "B", B);

    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(B);
    await expect(sheet.locator(".detail-head .pill")).toHaveText("critical");
    await expect(sheet.locator(".d2-asof")).toHaveText("Ages as of 2026-10-01");
    await expect(sheet.locator(".d2-answer")).toHaveText(golden("answer", "B"));
    expect(await commandLines(sheet)).toEqual(["composer require 'symfony/monolog-bridge:^5.4.52'"]);
  });

  test("closing returns to no sheet open", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);

    await sheet.getByRole("button", { name: "Close" }).click();

    await expect(detailSurface(page)).toHaveCount(0);
  });

  test("copies the move as written for POSIX, says so, and reverts", async ({ page }) => {
    await page.addInitScript(stubClipboard, "resolve");
    const sheet = await openDetail2(page, "B", B);
    const copy = sheet.locator(".d2-copy-btn");

    await copy.click();

    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      "composer require 'symfony/monolog-bridge:^5.4.52'",
    ]);
    await expect(copy).toHaveText("Copy", { timeout: 3000 });
  });

  test("copies both steps of a two-command move in order, in the shell the menu picks", async ({ page }) => {
    await page.addInitScript(stubClipboard, "resolve");
    const sheet = await openDetail2(page, "A", "twig/twig");

    await sheet.getByRole("button", { name: "Shell: POSIX" }).click();
    await sheet.getByRole("menuitemradio", { name: /^cmd\.exe/ }).click();
    await sheet.locator(".d2-copy-btn").click();

    await expect(sheet.locator(".d2-copy-btn")).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      phpGolden("A").commands_cmd.join("\n"),
    ]);
  });

  test("keeps the shell for the next page this viewer opens", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);
    await sheet.getByRole("button", { name: "Shell: POSIX" }).click();
    await sheet.getByRole("menuitemradio", { name: /^PowerShell/ }).click();

    const again = await openDetail2(page, "A", "twig/twig");

    await expect(again.getByRole("button", { name: "Shell: PowerShell" })).toBeVisible();
  });

  test("says to copy by hand when the browser refuses", async ({ page }) => {
    await page.addInitScript(stubClipboard, "reject");
    const sheet = await openDetail2(page, "B", B);

    await sheet.locator(".d2-copy-btn").click();

    await expect(sheet.locator(".d2-copy-btn")).toHaveText("Select it and copy");
  });
});
