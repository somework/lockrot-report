/**
 * Release branches against the run's PHP floors (`domain/floors.ts`, `ui/detail/TimelineFloors.tsx`,
 * PD-TIMELINE-13/14): the sentence that ends the sub, "Each branch" and its list, the fold rows'
 * words, S8's lead clause and its ledger why. Written against this renderer's classes, as
 * timeline.spec.ts is.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURES, pageUrl, type FixtureName } from "./support/pages";

async function open(page: Page, fixture: FixtureName, pkg: string, view = "findings"): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`${pageUrl(fixture)}#view=${view}&pkg=${encodeURIComponent(pkg)}`);
  await expect(page.locator(".detail-timeline")).toBeVisible();
}

const toggle = (page: Page) => page.getByRole("button", { name: "Each branch", exact: true });

test.describe("level 0: the answer without a click", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("scheb/2fa-bundle: the lead names the newest branch that fits, Release branches why the newest does not", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    await expect(page.locator(".detail-answer")).toContainText(
      "its last release was 4.5 years ago; 7.x is the newest that fits.",
    );
    const sub = page.locator(".detail-timeline-sub");
    await expect(sub).toContainText(
      "(3 months ago). Yours, 7.x and 6.x admit your require.php (>=8.2) and PHP 8.4; 8.x admits only PHP 8.4.",
    );
    await expect(sub).not.toContainText("requires php");
  });

  test("plank/laravel-mediable: none admits, and the summary counts only the newer branches and yours", async ({
    page,
  }) => {
    await open(page, FIXTURES.akaunting013, "plank/laravel-mediable");
    await expect(page.locator(".detail-answer")).toContainText("; no newer branch fits.");
    const sub = page.locator(".detail-timeline-sub");
    await expect(sub).toContainText(
      "Yours admits your require.php (^8.1) and PHP 8.4; 7.x and 6.x admit only PHP 8.4.",
    );
    await expect(sub).not.toContainText("of 10");
  });

  test("acme/left: an unknown floor reads as any other; yours at the release its php comes from", async ({
    page,
  }) => {
    await open(page, FIXTURES.miniEdges013, "acme/left");
    const lead = page.locator(".detail-answer");
    await expect(lead).toContainText("; no newer branch fits.");
    await expect(lead).not.toContainText("ext-sodium");
    await expect(page.locator(".detail-timeline-sub")).toContainText(
      "Yours (as of 1.9.0) needs a newer PHP than your require.php (^8.3); 3.x and 2.x are blocked by extension.",
    );
  });

  test("PHP 8.4 never breaks across a line", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    const phrases = page.locator(".detail-timeline-sub .nowrap", { hasText: /^PHP 8\.4$/ });
    await expect(phrases.first()).toBeVisible();
    for (const phrase of await phrases.all()) {
      expect(await phrase.evaluate((el) => el.getClientRects().length)).toBe(1);
    }
  });

  test("rector/rector: no project floor is said once; a closed fold says what it hides", async ({ page }) => {
    await open(page, FIXTURES.mautic013, "rector/rector");
    await expect(page.locator(".detail-timeline-sub")).toContainText(
      "The project names no PHP floor. 14 branches admit PHP 8.4; 7 stop before it.",
    );
    await expect(page.locator(".detail-timeline-fold-words")).toContainText("7 stop before PHP 8.4");
  });

  test("an older report shows less: no floors sentence, no button, no fold words", async ({ page }) => {
    await open(page, FIXTURES.wallabag, "scheb/2fa-bundle");
    await expect(page.locator(".detail-timeline-sub")).not.toContainText("admit");
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator(".detail-timeline-fold-words")).toHaveCount(0);
  });
});

test.describe("space: the lead as tall as before, Release branches at most two lines longer", () => {
  const LEADS = [
    [FIXTURES.wallabag013, "scheb/2fa-bundle"],
    [FIXTURES.wallabagBaselineOlder013, "scheb/2fa-bundle"],
    [FIXTURES.akaunting013, "plank/laravel-mediable"],
    [FIXTURES.miniEdges013, "acme/left"],
  ] as const;
  const SUBS = [
    ...LEADS,
    [FIXTURES.wallabag013, "phpunit/php-timer"],
    [FIXTURES.miniEdges013, "acme/floors"],
    [FIXTURES.mautic013, "rector/rector"],
    [FIXTURES.koelAll013, "brick/math"],
    [FIXTURES.koelAll013, "sentry/sentry"],
  ] as const;

  for (const width of [390, 1440]) {
    test(`${String(width)}px: S8's clause takes no more lines than "while 8.x kept releasing" did`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [fixture, pkg] of LEADS) {
        await open(page, fixture, pkg);
        const heights = await page.locator(".detail-answer").evaluate((answer) => {
          const nodes = [...answer.childNodes];
          const at = nodes.findIndex(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").startsWith("; "),
          );
          const clause = nodes.slice(at, at + 3);
          const said = clause.map((n) => n.textContent ?? "");
          const now = answer.getBoundingClientRect().height;
          const older =
            said[0] === "; " ? [" while ", "8.x", " kept releasing"] : [" while 8.x kept releasing"];
          clause.forEach((n, i) => (n.textContent = older[i] ?? n.textContent));
          const before = answer.getBoundingClientRect().height;
          clause.forEach((n, i) => (n.textContent = said[i] ?? ""));
          return at < 0 ? null : { now, before };
        });
        expect(heights, `${pkg}: S8's clause`).not.toBeNull();
        expect(heights?.now ?? Infinity, `${fixture} ${pkg}`).toBeLessThanOrEqual(heights?.before ?? 0);
      }
    });

    test(`${String(width)}px: the floors sentence adds at most two lines to the sub`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [fixture, pkg] of SUBS) {
        await open(page, fixture, pkg);
        const grown = await page.locator(".detail-timeline-sub").evaluate((sub) => {
          const said = sub.querySelector<HTMLElement>(".detail-timeline-floors-said");
          if (said === null) return null;
          const line = parseFloat(getComputedStyle(sub).lineHeight);
          const now = sub.getBoundingClientRect().height;
          said.hidden = true;
          const without = sub.getBoundingClientRect().height;
          said.hidden = false;
          return { grown: now - without, twoLines: 2 * line };
        });
        expect(grown, `${pkg} has a floors sentence`).not.toBeNull();
        // The button's focus box stands a pixel or two above a line of text.
        expect(grown?.grown ?? Infinity, `${fixture} ${pkg}`).toBeLessThanOrEqual((grown?.twoLines ?? 0) + 3);
      }
    });
  }
});

test.describe("level 1: every branch, opened by keyboard", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("named by its words alone, labels its panel, toggles with Enter and keeps focus", async ({ page }) => {
    await open(page, FIXTURES.koelAll013, "sentry/sentry");
    const button = toggle(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = page.getByRole("group", { name: "Each branch" });
    await expect(page.locator(".detail-timeline-floors")).toBeHidden();

    await button.focus();
    await page.keyboard.press("Enter");

    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(panel.locator("li")).toHaveText([
      "3.x and 0.1.x – 0.22.x (22) admit both",
      "2.x and 1.x stop before both",
    ]);
    await expect(panel).toContainText("lockrot does not test it");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("level 1 holds only what level 0 left: scheb's newest way, none when every branch was said", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    await toggle(page).click();
    await expect(page.locator(".detail-timeline-floors li")).toHaveText([
      "8.x needs a newer PHP than your require.php but admits PHP 8.4",
    ]);
    await open(page, FIXTURES.wallabag013, "friendsofsymfony/oauth-server-bundle");
    await expect(page.locator(".detail-timeline-sub")).toContainText("1.x stops before both.");
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator(".detail-timeline-floors")).toHaveCount(0);
  });

  test("j keeps the reader's choice on the next package with a level 1, and Escape hands focus to its row", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");

    await page.locator("li.frow[data-pkg='scheb/2fa-bundle']").focus();
    const aside = page.locator("aside.detail");
    let next = "scheb/2fa-bundle";
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("j");
      await expect(aside).not.toHaveAttribute("aria-label", next);
      next = (await aside.getAttribute("aria-label")) ?? "";
      if ((await toggle(page).count()) > 0) break;
    }
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator(`li.frow[data-pkg='${next}']`)).toBeFocused();
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds nothing serious with level 1 and every fold open, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, FIXTURES.miniEdges013, "acme/floors");
      await toggle(page).click();
      for (const fold of await page.locator(".detail-timeline-fold-btn").all()) await fold.click();
      await page.mouse.move(0, 0);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      const result = await new AxeBuilder({ page }).include(".detail-timeline").analyze();
      expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    });
  }

  test("in forced colours the button keeps its marker and link colour", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page, FIXTURES.wallabag013, "phpunit/php-timer");
    const mark = toggle(page).locator(".l1-mark");
    const glyph = await mark.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(glyph).toBe('"▶"');
    await expect(toggle(page)).toHaveCSS(
      "color",
      await page.evaluate(() => {
        const probe = document.createElement("a");
        probe.href = "#";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }),
    );
  });
});

test.describe("the ledger's S8 why follows S8's reach, and no row grows", () => {
  test("names the branch that fits, or none", async ({ page }) => {
    await page.goto(`${pageUrl(FIXTURES.wallabag013)}#view=findings`);
    await expect(page.locator("li.frow[data-pkg='scheb/2fa-bundle'] .fc-why-text")).toHaveText(
      "5.x stopped; 7.x fits",
    );
    await expect(page.locator("li.frow[data-pkg='craue/config-bundle'] .fc-why-text")).toHaveText(
      "2.x stopped; 3.x ships",
    );
    await page.goto(`${pageUrl(FIXTURES.akaunting013)}#view=findings`);
    await expect(page.locator("li.frow[data-pkg='plank/laravel-mediable'] .fc-why-text")).toHaveText(
      "5.x stopped; none fits",
    );
  });

  for (const fixture of [FIXTURES.wallabag013, FIXTURES.akaunting013, FIXTURES.miniEdges013] as const) {
    test(`${fixture}: each S8 row is as tall as with the words it said before, 320 to 1440`, async ({
      page,
    }) => {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("about:blank");
        await page.goto(`${pageUrl(fixture)}#view=findings`);
        await expect(page.locator("li.frow").first()).toBeVisible();
        const rows = await page.evaluate(() => {
          const bundle = JSON.parse(document.getElementById("lockrot-data")?.textContent ?? "{}") as {
            report: {
              findings: { package: string; signals: { id: string; data: Record<string, unknown> }[] }[];
            };
          };
          const newest = new Map(
            bundle.report.findings.map((f) => [
              f.package,
              f.signals.find((s) => s.id === "S8")?.data["newest_branch"],
            ]),
          );
          return [...document.querySelectorAll<HTMLElement>("li.frow")].flatMap((row) => {
            const why = row.querySelector<HTMLElement>(".fc-why-text");
            const text = why?.textContent ?? "";
            const m = /^(\S+) stopped; \S+ fits$/.exec(text);
            const was = newest.get(row.dataset["pkg"] ?? "");
            if (why === null || m === null || typeof was !== "string") return [];
            const now = row.getBoundingClientRect().height;
            why.textContent = `${m[1] ?? ""} stopped; ${was} ships`;
            const before = row.getBoundingClientRect().height;
            why.textContent = text;
            return [{ pkg: row.dataset["pkg"], now, before }];
          });
        });
        expect(rows.length, `${String(width)}px`).toBeGreaterThan(0);
        for (const row of rows) expect(row.now, `${row.pkg ?? ""} at ${String(width)}px`).toBe(row.before);
      }
    });
  }
});
