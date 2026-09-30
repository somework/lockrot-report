/**
 * A pinned package against its tags (`domain/pinned.ts`, `ui/detail/DetailLead.tsx`, PD-S6-4): the
 * answer's clause, its level 1, the Snapshot key fact's note and the Findings row's S6 words.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, type FixtureName } from "./support/pages";

async function open(page: Page, fixture: FixtureName, pkg: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`${pageUrl(fixture)}#view=findings&pkg=${encodeURIComponent(pkg)}`);
  await expect(page.locator("aside.detail .detail-answer")).toBeVisible();
}

const answer = (page: Page) => page.locator("aside.detail .detail-answer");
const panel = (page: Page) => page.locator("aside.detail .detail-tags");
const fact = (page: Page) => page.locator("aside.detail .detail-fact").nth(1);

test.describe("level 0: the answer and the key fact", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a tagged snapshot says plainly which is newer, the reader's snapshot dated beside it", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle");
    await expect(answer(page)).toHaveText(
      "Your dev-master snapshot (2022-03-24) is 3.2 years newer than the newest tag, 1.6.2. You require it directly.",
    );
    // S2 fired: the release slot keeps its age, and nothing repeats the tag under it.
    await expect(fact(page)).toHaveText(/^Last release\s*7\.7 y ago$/);

    await open(page, FIXTURES.mautic013, "rector/rector");
    await expect(answer(page)).toContainText(
      "Your dev-main snapshot (2026-08-04) is 1 month older than the newest tag, 2.6.7.",
    );
    await expect(fact(page)).toHaveText(/^Snapshot\s*2 mo ago$/);
  });

  test("null is 'could not tell', false is 'no tag at all', and neither is the other", async ({ page }) => {
    await open(page, FIXTURES.miniEdges013, "acme/path-lib");
    await expect(answer(page)).toContainText(
      "a branch snapshot; lockrot could not tell whether it has a tag.",
    );
    await expect(page.locator("aside.detail .detail-answer .l1-btn")).toHaveCount(0);

    await open(page, FIXTURES.wallabag013, "wallabag/rulerz");
    await expect(answer(page)).toContainText(
      "a branch snapshot; its repository lists no tag, not even a pre-release.",
    );
    await expect(answer(page)).not.toContainText("could not tell");
  });

  test("no tag at all is said in full at level 0, so nothing opens (rulerz, acme/untagged)", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "wallabag/rulerz");
    await expect(page.locator("aside.detail .detail-answer .l1-btn")).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);

    await open(page, FIXTURES.miniEdges013, "acme/untagged");
    await expect(answer(page)).toHaveText(
      "Installed 1.0.0, but its repository lists no tag, not even a pre-release. You require it directly.",
    );
    await expect(page.locator("aside.detail .detail-answer .l1-btn")).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
  });

  test("an older report says only what its fields state: fos as 0.13 does, core-lib less", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag, "friendsofsymfony/oauth-server-bundle");
    await expect(answer(page)).toContainText(
      "Your dev-master snapshot (2022-03-24) is 3.2 years newer than the newest tag, 1.6.2.",
    );
    await open(page, FIXTURES.mautic, "mautic/core-lib");
    await expect(answer(page)).toContainText("Pinned to 7.0.0-dev, a branch snapshot rather than a release.");
    await expect(fact(page)).toHaveText(/^Snapshot\s*not recorded\s*a branch commit, not a release$/);
  });

  test("the word stable appears nowhere in the answer, its level 1 or the key facts", async ({ page }) => {
    for (const [fixture, pkg] of [
      [FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle"],
      [FIXTURES.wallabag013, "wallabag/rulerz"],
      [FIXTURES.miniEdges013, "acme/untagged"],
    ] as const) {
      await open(page, fixture, pkg);
      await expect(page.locator("aside.detail .detail-lead")).not.toContainText(/stable/i);
    }
  });
});

test.describe("level 1: the tag words open the dates and the pre-release caveat", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keyboard: named by its whole phrase without the marker, toggled by Enter and Space", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle");
    const button = page.getByRole("button", { name: "the newest tag, 1.6.2", exact: true });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page)).toBeHidden();

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole("group", { name: "the newest tag, 1.6.2" })).toBeVisible();
    await expect(panel(page).locator(".detail-tags-dates")).toHaveText(
      "tag 1.6.2 2019-01-23 3.2 years later snapshot dev-master 2022-03-24 · yours",
    );
    await expect(panel(page)).toContainText("A tag here can be a pre-release: lockrot counts those as tags.");

    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(panel(page)).toBeHidden();
  });

  test("the dates stack oldest first: a tag newer than the snapshot comes second (rector)", async ({
    page,
  }) => {
    await open(page, FIXTURES.mautic013, "rector/rector");
    await page.getByRole("button", { name: "the newest tag, 2.6.7" }).click();
    await expect(panel(page).locator(".detail-tags-role")).toHaveText(["snapshot", "tag"]);
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noOverflow).toBe(true);
  });

  test("the reader's choice follows j and k back to the package, and Escape hands focus to its row", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle");
    const name = { name: "the newest tag, 1.6.2", exact: true } as const;
    await page.getByRole("button", name).click();
    await page.locator("li.frow[data-pkg='friendsofsymfony/oauth-server-bundle']").focus();
    await page.keyboard.press("j");
    await expect(page.locator("aside.detail")).not.toHaveAttribute(
      "aria-label",
      "friendsofsymfony/oauth-server-bundle",
    );
    await page.keyboard.press("k");
    await expect(page.locator("aside.detail")).toHaveAttribute(
      "aria-label",
      "friendsofsymfony/oauth-server-bundle",
    );
    await expect(page.getByRole("button", name)).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("li.frow[data-pkg='friendsofsymfony/oauth-server-bundle']")).toBeFocused();
  });

  test("in forced colours the version keeps the shared marker and link colour", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle");
    const button = page.getByRole("button", { name: "the newest tag, 1.6.2", exact: true });
    const glyph = await button.locator(".l1-mark").evaluate((el) => getComputedStyle(el, "::before").content);
    expect(glyph).toBe('"▶"');
    await expect(button).toHaveCSS("border-bottom-style", "dotted");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds nothing serious in the lead with level 1 open, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, FIXTURES.mautic013, "rector/rector");
      await page.getByRole("button", { name: "the newest tag, 2.6.7" }).click();
      await page.mouse.move(0, 0);
      const result = await new AxeBuilder({ page }).include(".detail-lead").analyze();
      expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    });
  }
});

test.describe("the Findings row", () => {
  test("a pinned row leads with S6 in words the search finds too", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageUrl(FIXTURES.mautic013)}#view=findings`);
    const rector = page.locator("li.frow[data-pkg='rector/rector']");
    await expect(rector.locator(".fc-why > .sid")).toHaveText("S6");
    await expect(rector.locator(".fc-why-text")).toHaveText("snapshot 1 mo before tag 2.6.7");

    await page.goto(`${pageUrl(FIXTURES.wallabag013)}#view=findings&q=${encodeURIComponent("after tag")}`);
    await expect(page.locator("li.frow")).toHaveCount(1);
    const fos = page.locator("li.frow[data-pkg='friendsofsymfony/oauth-server-bundle']");
    // The age column shows the tag's years, so the row names no second number of years, and the
    // column says whose its number is.
    await expect(fos.locator(".fc-why-text")).toHaveText("snapshot after tag 1.6.2");
    await expect(fos.locator(".match-note")).toHaveCount(0);
    await expect(fos.locator(".age-whose")).toHaveText("tag");
    await expect(fos.getByRole("img")).toHaveAttribute("aria-label", /^newest tag released /);
  });

  test("an untagged row says its version is not a tag in plain words, and no age is called a tag", async ({
    page,
  }) => {
    await page.goto(`${pageUrl(FIXTURES.miniEdges013)}#view=findings`);
    const untagged = page.locator("li.frow[data-pkg='acme/untagged']");
    await expect(untagged.locator(".fc-why-text")).toHaveText("1.0.0 is not a tag in its repository");
    await page.goto(`${pageUrl(FIXTURES.mautic013)}#view=findings`);
    await expect(page.locator("li.frow[data-pkg='rector/rector'] .age-whose")).toHaveCount(0);
    await expect(page.locator("li.frow .age-whose")).toHaveCount(0);
  });

  test("the tag word stays inside its row, clear of the number, the bar and the way in, at every width", async ({
    page,
  }) => {
    await page.goto(`${pageUrl(FIXTURES.wallabag013)}#view=findings`);
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const fos = page.locator("li.frow[data-pkg='friendsofsymfony/oauth-server-bundle']");
      const row = await fos.boundingBox();
      const word = await fos.locator(".age-whose").boundingBox();
      const num = await fos.locator(".age-num").boundingBox();
      const bar = await fos.locator(".age-bar").boundingBox();
      const reach = await fos.locator(".fc-reach").boundingBox();
      expect(row && word && num && bar && reach, `${String(width)}px`).toBeTruthy();
      if (row === null || word === null || num === null || bar === null || reach === null) continue;
      expect(word.y, `${String(width)}px`).toBeGreaterThanOrEqual(row.y);
      expect(word.y + word.height, `${String(width)}px`).toBeLessThanOrEqual(row.y + row.height);
      const clear = (other: { x: number; y: number; width: number; height: number }) =>
        word.x >= other.x + other.width ||
        word.x + word.width <= other.x ||
        word.y >= other.y + other.height - 2 ||
        word.y + word.height <= other.y + 2;
      expect(clear(num), `${String(width)}px: the word clear of the number`).toBe(true);
      expect(clear(bar), `${String(width)}px: the word clear of the bar`).toBe(true);
      expect(clear(reach), `${String(width)}px: the word clear of the way in`).toBe(true);
    }
  });

  for (const fixture of [
    FIXTURES.wallabag013,
    FIXTURES.mautic013,
    FIXTURES.miniEdges013,
    FIXTURES.wallabag,
  ]) {
    test(`${fixture}: an S6 row is no taller than with S6's own summary, at every width`, async ({
      page,
    }) => {
      await page.goto(`${pageUrl(fixture)}#view=findings`);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const rows = await page.locator("li.frow").evaluateAll((items) =>
          items
            .filter((li) => li.querySelector(".fc-why > .sid")?.textContent === "S6")
            .map((li) => {
              const words = li.querySelector<HTMLElement>(".fc-why-text");
              const summary = li.querySelector<HTMLElement>(".fc-why")?.title ?? "";
              if (words === null) return { pkg: li.dataset["pkg"], height: 0, shipped: 0 };
              const shown = words.textContent;
              const height = li.getBoundingClientRect().height;
              words.textContent = summary;
              const shipped = li.getBoundingClientRect().height;
              words.textContent = shown;
              return { pkg: li.dataset["pkg"], height, shipped };
            }),
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.height, `${row.pkg} at ${width}px`).toBeLessThanOrEqual(row.shipped);
        }
      }
    });
  }
});
