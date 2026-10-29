import { expect, test } from "@playwright/test";
import {
  commandLines,
  detailSurface,
  golden,
  goldenOf,
  openDetail2,
  phpGolden,
} from "./support/report2/detail";

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

  test("names a graded replacement in the move's action, linked to its registry page", async ({ page }) => {
    const sheet = await openDetail2(page, "replace-graded", "web-token/jwt-key-mgmt");
    const [move] = goldenOf("moves", "replace-graded") as { action: string }[];

    await expect(sheet.locator(".d3-move-action")).toHaveText(move?.action ?? "");
  });

  test("names the package and its grade, the golden verdict line, then the move's commands", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, "B", B);

    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(B);
    await expect(sheet.locator(".detail-head .pill")).toHaveText("critical");
    await expect(sheet.locator(".d2-asof")).toHaveText("Ages as of 2026-10-01");
    await expect(sheet.locator(".d3-verdict-line")).toHaveText(golden("verdict-line", "B"));
    await expect(sheet.locator(".d3-move .eyebrow").first()).toHaveText("The move");
    expect(await commandLines(sheet)).toEqual(phpGolden("B").commands_posix);
  });

  test("dates a branch snapshot's lock time as a snapshot, never as a release", async ({ page }) => {
    const sheet = await openDetail2(page, "G", "friendsofsymfony/oauth-server-bundle");

    await sheet.getByText("The lock entry", { exact: true }).click();

    const lock = sheet.locator("details", { hasText: "The lock entry" });
    await expect(lock.locator("dt", { hasText: "snapshot dated" })).toHaveCount(1);
    await expect(lock.locator("dt", { hasText: /^released$/ })).toHaveCount(0);
    await expect(lock.locator("dt", { hasText: "branch snapshot" })).toHaveCount(1);
  });

  test("tones a score-0 verdict's chip as none, from score_model", async ({ page }) => {
    const sheet = await openDetail2(page, "ok-unchecked", "scheb/2fa-google-authenticator");

    await expect(sheet.locator(".detail-head .pill")).toHaveText("ok");
    await expect(sheet.locator(".detail-head .pill")).toHaveClass(/\btone-none\b/);
  });

  test("closing returns to no sheet open", async ({ page }) => {
    const sheet = await openDetail2(page, "B", B);

    await sheet.getByRole("button", { name: "Close" }).click();

    await expect(detailSurface(page)).toHaveCount(0);
  });

  test("copies the move's steps as written for POSIX, says so, and reverts", async ({ page }) => {
    await page.addInitScript(stubClipboard, "resolve");
    const sheet = await openDetail2(page, "B", B);
    const copy = sheet.locator(".d2-copy-btn");

    await copy.click();

    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      phpGolden("B").commands_posix.join("\n"),
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

// A wrapped command reads as one command: its later lines start to the right of its first, so a
// flag that wraps, such as `--no-update`, does not look like the start of a new command.
test.describe("report-2: a wrapped command at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("hangs its second line to the right of its first", async ({ page }) => {
    const sheet = await openDetail2(page, "A", "twig/twig");
    const line = sheet.locator(".d3-move .d2-copy-line").first();
    await expect(line).toContainText("--no-update");

    const starts = await line.evaluate((node) => {
      const boxes = [...node.querySelectorAll(".d3-arg")].map((arg) => arg.getBoundingClientRect());
      const firstTop = Math.min(...boxes.map((box) => box.top));
      const leftOf = (onFirst: boolean): number =>
        Math.min(...boxes.filter((box) => box.top <= firstTop + 1 === onFirst).map((box) => box.left));
      return { first: leftOf(true), second: leftOf(false) };
    });

    expect(Number.isFinite(starts.second), "the command does not wrap at 375px").toBe(true);
    expect(starts.second).toBeGreaterThan(starts.first);
  });
});
