/**
 * The detail sheet as blocks (SPEC §7.9.8) on recorded pages: the folds of §7.9.8.3, each fold's
 * count against its rows, the keyboard, and the blocks that few findings reach.
 */
import { expect, test, type Locator } from "@playwright/test";
import { sheetUrl } from "./support/pages";
import { detailSurface, goldenOf, openDetail2 } from "./support/report2/detail";

async function openSheet(page: import("@playwright/test").Page, name: string, pkg: string): Promise<Locator> {
  await page.goto(`${sheetUrl(name)}#pkg=${encodeURIComponent(pkg)}`);
  const sheet = detailSurface(page);
  await sheet.waitFor();
  return sheet;
}

const securityRow = (sheet: Locator): Locator =>
  sheet
    .locator(".d2-row")
    .filter({ has: sheet.page().getByRole("heading", { name: "Security", exact: true }) });

test.describe("drupal/core, 62 advisories in a recorded drupal-site run", () => {
  const CORE = "drupal/core";
  const NAME = "drupal-site-drupal-core";

  test("groups the advisories by severity, each group's count its rows, the first group open", async ({
    page,
  }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const row = securityRow(sheet);
    const heads = row.locator(".d3-sev-btn");

    await expect(row.locator(".d3-adv")).toHaveCount(62);
    await expect(heads).toHaveCount(5);
    await expect(heads.first()).toHaveAttribute("aria-expanded", "true");
    const counts = await row
      .locator(".d3-sev-group")
      .evaluateAll((groups) =>
        groups.map((group) => [
          Number(group.querySelector(".d3-sev-n")?.textContent),
          group.querySelectorAll(".d3-adv").length,
        ]),
      );
    expect(counts.map(([shown]) => shown)).toEqual(counts.map(([, rows]) => rows));
    expect(counts.reduce((sum, [shown]) => sum + (shown ?? 0), 0)).toBe(62);
  });

  test("a group head is an H4 whose button opens it by keyboard", async ({ page }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const head = securityRow(sheet).getByRole("heading", { level: 4 }).nth(1);
    const button = head.getByRole("button");
    const list = page.locator(`[id="${(await button.getAttribute("aria-controls")) ?? ""}"]`);

    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await button.focus();
    await page.keyboard.press("Enter");

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();
  });

  test("a summary count opens its group and lands on it", async ({ page }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const row = securityRow(sheet);
    const jump = row.getByRole("link", { name: "38 unrated, show the group" });
    const target = (await jump.getAttribute("href"))?.slice(1) ?? "";
    const url = page.url();

    await jump.click();

    await expect(page.locator(`[id="${target}"] button`)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[id="${target}"]`)).toBeFocused();
    expect(page.url()).toBe(url);
  });

  test("a row that repeats a CVE links the earlier row, and the link opens that row's group", async ({
    page,
  }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const row = securityRow(sheet);
    await expect(row.locator(".d3-adv-cap")).toContainText("22 repeat the CVE of another row.");
    const closed = row.locator('.d3-sev-btn[aria-expanded="false"]');
    while ((await closed.count()) > 0) await closed.first().click();
    // The first repeat whose earlier row sits in another severity group.
    const at = await row
      .locator(".d3-adv-same a")
      .evaluateAll((links) =>
        links.findIndex(
          (a) =>
            a.closest(".d3-sev-group") !==
            document.getElementById(a.getAttribute("href")?.slice(1) ?? "")?.closest(".d3-sev-group"),
        ),
      );
    expect(at).toBeGreaterThanOrEqual(0);
    const link = row.locator(".d3-adv-same a").nth(at);
    const target = page.locator(`[id="${(await link.getAttribute("href"))?.slice(1) ?? ""}"]`);
    await target.locator("xpath=ancestor::div[contains(@class,'d3-sev-group')]/h4/button").click();
    await expect(target).toBeHidden();

    await link.click();

    await expect(target).toBeVisible();
    await expect(target).toBeFocused();
    await expect(target.locator(".d3-adv-head")).toContainText((await link.textContent()) ?? "");
  });

  test("the verdict's count links to the Security row", async ({ page }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const link = sheet.locator(".d3-verdict-line").getByRole("link", { name: "62 advisories" });

    await expect(link).toHaveAttribute("href", `#${(await securityRow(sheet).getAttribute("id")) ?? "none"}`);
    await link.click();
    await expect(securityRow(sheet)).toBeFocused();
    await expect(detailSurface(page)).toHaveCount(1);
  });

  test("Held by shows the worst three of 12 and folds the rest behind their own grades", async ({ page }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const held = sheet.locator(".d3-holders").first();

    await expect(held.getByRole("heading", { level: 3 })).toHaveText("Held by · 12");
    await expect(held.locator(":scope > .d3-chain > li")).toHaveCount(3);
    await expect(held.locator("details > summary")).toHaveText(/^9 more/);
    await held.locator("details > summary").focus();
    await page.keyboard.press("Enter");
    await expect(held.locator("details .d3-chain > li")).toHaveCount(9);
  });

  test("Reach names three of its seven and folds the rest behind '4 more'", async ({ page }) => {
    const sheet = await openSheet(page, NAME, CORE);
    const reach = sheet.locator(".d3-q").filter({ hasText: /^Reach/ });
    const more = reach.getByRole("button", { name: "4 more" });

    await expect(reach.locator(".d3-namelist > li:visible")).toHaveCount(3);
    await more.focus();
    await page.keyboard.press("Space");

    await expect(reach.getByRole("button", { name: "show fewer" })).toHaveAttribute("aria-expanded", "true");
    await expect(reach.locator(".d3-namelist > li:visible")).toHaveCount(7);
  });
});

test.describe("symfony/yaml, a range string past RANGE_INLINE_MAX (case E)", () => {
  test("folds to its count of ranges, and opens to the string as written, one alternative per line", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, "E", "symfony/yaml");
    const [first] = (goldenOf("security", "E") as { rows: { affects: string; ranges: string[] }[] }).rows;
    const button = securityRow(sheet).locator(".d3-range-btn").first();
    const range = page.locator(`[id="${(await button.getAttribute("aria-controls")) ?? ""}"]`);

    await expect(securityRow(sheet).locator(".d3-adv-affects").first()).toHaveText(first?.affects ?? "");
    await button.press("Enter");

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(range.locator(".d3-range-alt")).toHaveText(first?.ranges ?? []);
    expect(await range.textContent()).toBe((first?.ranges ?? []).join(""));
  });
});

test.describe("enshrined/svg-sanitize, a 23-branch timeline (baselined wallabag 2.6)", () => {
  test("keeps all 23 branches in the table and names each fold by the rows it holds", async ({ page }) => {
    const sheet = await openDetail2(page, "baselined-wallabag-2.6", "enshrined/svg-sanitize");
    const table = sheet.getByRole("table", { name: "Release branches" });
    const folds = await table.locator(".detail-timeline-fold-btn").evaluateAll((buttons) =>
      buttons.map((button) => {
        const head = button.closest(".detail-timeline-fold");
        let rows = 0;
        for (
          let next = head?.nextElementSibling;
          next?.classList.contains("is-folded");
          next = next.nextElementSibling
        )
          rows++;
        return [Number.parseInt(button.textContent, 10), rows];
      }),
    );

    await expect(table.locator(".detail-timeline-row[data-branch]")).toHaveCount(23);
    expect(folds.length).toBeGreaterThan(0);
    expect(folds.map(([shown]) => shown)).toEqual(folds.map(([, rows]) => rows));
  });

  test("a fold opens by keyboard, and its rows lose their clip", async ({ page }) => {
    const sheet = await openDetail2(page, "baselined-wallabag-2.6", "enshrined/svg-sanitize");
    const button = sheet.locator(".detail-timeline-fold-btn").first();
    const collapsed = sheet.locator(".detail-timeline-row.is-collapsed");
    const before = await collapsed.count();
    const folded = Number.parseInt((await button.textContent()) ?? "", 10);

    await button.focus();
    await page.keyboard.press("Enter");

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(collapsed).toHaveCount(before - folded);
    expect(folded).toBeGreaterThan(0);
  });
});

test.describe("an also[] move (case B-also‡)", () => {
  test("follows the lead card with a Then card and its own Held by, named for its move", async ({ page }) => {
    const sheet = await openDetail2(page, "B-also-dagger", "symfony/monolog-bridge");
    const moves = goldenOf("moves", "B-also-dagger") as { heading: string; action: string }[];

    await expect(sheet.locator(".d3-move > h3")).toHaveText(moves.map((m) => m.heading));
    await expect(sheet.locator(".d3-move-action")).toHaveText(moves.map((m) => m.action));
    await expect(sheet.locator(".d3-move.is-then + .d3-holders h3 .vh")).toHaveText(/^, the move to /);
  });
});

test.describe("a partial update (case partial)", () => {
  test("prints the golden Meanwhile line under the Security summary, its command as code", async ({
    page,
  }) => {
    const sheet = await openDetail2(page, "partial", "laravel/framework");
    const line = securityRow(sheet).locator(".d3-meanwhile");

    await expect(line).toHaveText((goldenOf("security", "partial") as { meanwhile: string }).meanwhile);
    await expect(line.locator("code")).toHaveText("composer update laravel/framework");
  });
});

test("drupal/core at target PHP 8.1: the move card and Held by say what Composer's solver found", async ({
  page,
}) => {
  const sheet = await openSheet(page, "drupal-site-php81-drupal-core", "drupal/core");
  const card = sheet.locator(".d3-move-facts").first();
  const holders = sheet.locator(".d3-holders").first();

  await expect(card.locator(".d3-after-cond")).toContainText(["Composer refuses the move"]);
  await holders.locator(".d3-fold > summary").click();
  await expect(holders).toContainText("its own step: require ^10.3.9 on 10.x · Composer refuses the move");
  const release = holders.locator(".d3-holder", {
    hasText: "drupal/core 10.6.19, its own release",
  });
  await expect(release.first()).toBeVisible();
  await expect(release.locator(".d3-holder-step")).toHaveCount(0);
});
