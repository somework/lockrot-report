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

/** The lead as the reader sees it: the words a shorter step of S8's clause hides are left out. */
const leadShown = (page: Page): Promise<string> =>
  page.locator(".detail-answer").evaluate((answer) => {
    const shown = (node: Node): string =>
      node instanceof HTMLElement && getComputedStyle(node).display === "none"
        ? ""
        : node.nodeType === Node.TEXT_NODE
          ? (node.textContent ?? "")
          : [...node.childNodes].map(shown).join("");
    return shown(answer);
  });

/** S8's clause in the lead says the words of its step, the fullest that costs no line over the barest. */
async function expectMove(page: Page, words: Readonly<Record<"" | "short" | "bare", string>>): Promise<void> {
  const fit = await page.locator(".detail-answer").evaluate((answer) => {
    const lines = () =>
      Math.round(answer.getBoundingClientRect().height / parseFloat(getComputedStyle(answer).lineHeight));
    const set = (step: string) => {
      if (step === "") delete answer.dataset["fit"];
      else answer.dataset["fit"] = step;
    };
    const at = answer.dataset["fit"] ?? "";
    set("bare");
    const bare = lines();
    const fuller = ["", "short", "bare"].slice(0, ["", "short", "bare"].indexOf(at)).map((step) => {
      set(step);
      return lines();
    });
    set(at);
    return { at: at as "" | "short" | "bare", bare, fuller };
  });
  expect(await leadShown(page)).toContain(words[fit.at]);
  for (const taken of fit.fuller) expect(taken, `fuller than ${fit.at}`).toBeGreaterThan(fit.bare);
}

test.describe("level 0: the answer without a click", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("scheb/2fa-bundle: the lead names the newest branch that fits your require.php, Release branches why the newest does not", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    await expectMove(page, {
      "": "its last release was 4.5 years ago; 7.x is the newest that fits your require.php.",
      short: "its last release was 4.5 years ago; 7.x fits your require.php.",
      bare: "its last release was 4.5 years ago; 7.x fits.",
    });
    const sub = page.locator(".detail-timeline-sub");
    // Why 8.x does not fit, without a glossary. Which step of the sentence fits is the fonts' call
    // (PD-TIMELINE-16), so what level 0 leaves out is asserted at level 1.
    await expect(sub).toContainText("8.x needs a newer PHP than your require.php");
    await expect(sub).toContainText("allows at its lowest");
    await expect(sub).not.toContainText("misses");
    await expect(sub).not.toContainText("requires php");
    // Two lines at most for the floors, in this browser's own fonts (PD-TIMELINE-16).
    const added = await sub.evaluate((node) => {
      const said = node.querySelector<HTMLElement>(".detail-timeline-floors-said");
      const lines = () =>
        Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight));
      const withIt = lines();
      if (said !== null) said.hidden = true;
      const without = lines();
      if (said !== null) said.hidden = false;
      return withIt - without;
    });
    expect(added).toBeLessThanOrEqual(2);
  });

  test("plank/laravel-mediable: none admits, and the summary counts only the newer branches and yours", async ({
    page,
  }) => {
    await open(page, FIXTURES.akaunting013, "plank/laravel-mediable");
    await expectMove(page, {
      "": "; no newer branch fits your require.php.",
      short: "; no newer branch fits your require.php.",
      bare: "; no newer branch fits.",
    });
    const sub = page.locator(".detail-timeline-sub");
    // The constraint is quoted where the reader's fonts leave room for it, and one press away always.
    await expect(sub).toContainText(
      /7\.x and 6\.x need a newer PHP than your require\.php( \(\^8\.1\))? allows at its lowest/,
    );
    await expect(sub).not.toContainText("of 10");
    await toggle(page).click();
    await expect(page.locator(".floors-def")).toBeVisible();
    await expect(page.locator(".floors-def")).toContainText("require.php (^8.1)");
  });

  test("acme/left: an unknown floor reads as any other, what S8 reads it as one press away; yours at the release its php comes from", async ({
    page,
  }) => {
    await open(page, FIXTURES.miniEdges013, "acme/left");
    await expectMove(page, {
      "": "; no newer branch fits the extension floor.",
      short: "; no newer branch fits the extension floor.",
      bare: "; no newer branch fits.",
    });
    await expect(page.locator(".detail-answer")).not.toContainText("ext-sodium");
    const sub = page.locator(".detail-timeline-sub");
    // Why no newer branch fits stays in every step; yours is said beside it where the fonts leave room.
    await expect(sub).toContainText("3.x and 2.x are blocked by extension.");
    const yours =
      /Yours \(as of 1\.9\.0\) needs a newer PHP than your require\.php( \(\^8\.3\))? allows at its lowest/;
    const yoursSaid = yours.test((await sub.textContent()) ?? "");
    await toggle(page).click();
    if (!yoursSaid) {
      await expect(page.locator(".detail-timeline-floors")).toContainText(
        /1\.x \(yours\):? needs a newer PHP than your require\.php allows at its lowest/,
      );
    }
    await expect(page.locator(".floors-def")).toContainText(
      "lockrot reads the extension floor as ext-sodium >=2.",
    );
    await expect(page.locator(".detail-timeline")).toContainText("^8.3");
    await expect(page.locator(".floors-def code", { hasText: "ext-sodium >=2" })).toHaveCount(1);
  });

  test("acme/floors: level 0 says only what holds for every newer branch; each one's way is level 1's", async ({
    page,
  }) => {
    await open(page, FIXTURES.miniEdges013, "acme/floors");
    await expect(page.locator(".detail-timeline-sub")).toContainText(
      "Yours stops before your require.php (^8.3) and PHP 8.4; no newer branch admits both.",
    );
    await expect(page.locator(".detail-timeline-sub")).not.toContainText("differently");
    await toggle(page).click();
    await expect(page.locator(".detail-timeline-floors li").first()).toHaveText(
      "6.x needs a newer PHP than your require.php allows at its lowest and stops before PHP 8.4",
    );
  });

  test("PHP 8.4 never breaks across a line", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, FIXTURES.miniEdges013, "acme/floors");
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

  test("scheb/2fa-bundle: at every width level 0 still says why 8.x does not fit, in at most two more lines", async ({
    page,
  }) => {
    for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
      const sub = page.locator(".detail-timeline-sub");
      await expect(sub, `${String(width)}px`).toContainText("8.x needs a newer PHP than your require.php");
      const grown = await sub.evaluate((node) => {
        const said = node.querySelector<HTMLElement>(".detail-timeline-floors-said");
        if (said === null) return Infinity;
        const now = node.getBoundingClientRect().height;
        said.hidden = true;
        const without = node.getBoundingClientRect().height;
        said.hidden = false;
        // The button's focus box stands a pixel or two above a line of text.
        return now - without - 2 * parseFloat(getComputedStyle(node).lineHeight) - 3;
      });
      expect(grown, `${String(width)}px: past two lines by`).toBeLessThanOrEqual(0);
    }
  });

  for (const width of [390, 1440]) {
    test(`${String(width)}px: S8's clause takes no more lines than "while 8.x kept releasing" did`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [fixture, pkg] of LEADS) {
        await open(page, fixture, pkg);
        const lines = await page.locator(".detail-answer").evaluate((answer) => {
          // Lines, not pixels: a mono name on a line moves its box by a fraction of a pixel.
          const count = () =>
            Math.round(
              answer.getBoundingClientRect().height / parseFloat(getComputedStyle(answer).lineHeight),
            );
          const nodes = [...answer.childNodes];
          const isText = (n: ChildNode | undefined, start: string) =>
            n?.nodeType === Node.TEXT_NODE && (n.textContent ?? "").startsWith(start);
          const at = nodes.findIndex((n) => isText(n, "; "));
          const end = nodes.findIndex((n, i) => i > at && isText(n, "."));
          const stop = nodes[end];
          if (at < 0 || stop === undefined) return null;
          const clause = nodes.slice(at, end);
          const now = count();
          const branch =
            clause[0]?.textContent === "; "
              ? (clause[1]?.cloneNode(false) as ChildNode | undefined)
              : undefined;
          const older: ChildNode[] =
            branch === undefined
              ? [document.createTextNode(" while 8.x kept releasing")]
              : [document.createTextNode(" while "), branch, document.createTextNode(" kept releasing")];
          if (branch !== undefined) branch.textContent = "8.x";
          stop.before(...older);
          clause.forEach((n) => {
            n.remove();
          });
          const before = count();
          older.forEach((n, i) => {
            if (i === 0) n.replaceWith(...clause);
            else n.remove();
          });
          return { now, before };
        });
        expect(lines, `${pkg}: S8's clause`).not.toBeNull();
        expect(lines?.now ?? Infinity, `${fixture} ${pkg}`).toBeLessThanOrEqual(lines?.before ?? 0);
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

  test("level 1 holds only what level 0 left: scheb's newest in full, the branches that admit both, none when every branch was said", async ({
    page,
  }) => {
    await open(page, FIXTURES.wallabag013, "scheb/2fa-bundle");
    await toggle(page).click();
    await expect(page.locator(".detail-timeline-floors li").first()).toHaveText(
      "8.x needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
    );
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
        const probe = document.createElement("span");
        probe.style.color = "LinkText";
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
    test(`${fixture}: no S8 row is taller than with the words it said before, 320 to 1440`, async ({
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
        // The new words can be shorter than the old, which in a wide font saves the row a line.
        for (const row of rows) {
          expect(row.now, `${row.pkg ?? ""} at ${String(width)}px`).toBeLessThanOrEqual(row.before);
        }
      }
    });
  }
});
