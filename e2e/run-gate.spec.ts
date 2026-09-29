/**
 * PD-GATE-1..5 (DESIGN.md §5): lockrot's gate merged into the page — the header's words, the
 * summary's clause and its level 1, the row mark that never grows a row, the "Fails this run"
 * filter and its address, Run data's rows — and the reports without a gate, which look as before.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, pageUrl } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

/** Each marked row: its height with its mark where it sits, then with none; and whether the mark is
 *  inside the row, uncut. */
async function markedRows(page: Page, selector = "li.frow.has-gate") {
  return page.evaluate((selector) => {
    const rows = [...document.querySelectorAll<HTMLElement>(selector)];
    const placed = rows.map((row) => {
      const box = row.getBoundingClientRect();
      const mark = [...row.querySelectorAll<HTMLElement>(".gate-mark")].find(
        (m) => m.getClientRects().length > 0,
      );
      const at = row.dataset["gateAt"] ?? "";
      const m = mark?.getBoundingClientRect();
      const inside =
        m === undefined ||
        (m.left >= box.left - 0.5 &&
          m.right <= box.right + 0.5 &&
          m.bottom <= box.bottom + 0.5 &&
          (mark?.scrollWidth ?? 0) <= (mark?.clientWidth ?? 0) + 1);
      return { pkg: row.dataset["pkg"], at, height: box.height, inside, shown: mark !== undefined };
    });
    for (const row of rows) {
      row.dataset["gateAt"] = "none";
      row.removeAttribute("data-gate-tight");
    }
    const bare = rows.map((row) => row.getBoundingClientRect().height);
    return placed.map((row, i) => ({ ...row, bare: bare[i] ?? 0 }));
  }, selector);
}

test.describe("PD-GATE-3: a row's mark never grows it and is never cut", () => {
  for (const fixture of [
    FIXTURES.wallabagOfflineStrictUnchecked013,
    FIXTURES.koelNoTokenUnchecked013,
    FIXTURES.wallabagBaselineOlder013,
    FIXTURES.miniEdges013,
  ] as const) {
    test(`${fixture}: 320 to 1920`, async ({ page }) => {
      await report.goto(fixture);
      for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pageUrl(fixture));
        const rows = await markedRows(page);
        expect(rows.length, `${width}px`).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.height, `${row.pkg} at ${width}px`).toBe(row.bare);
          expect(row.inside, `${row.pkg} at ${width}px`).toBe(true);
          expect(row.shown || row.at === "none", `${row.pkg} at ${width}px`).toBe(true);
        }
        // The word, not a bare tick: almost every row finds room for it.
        const worded = rows.filter((row) => row.shown).length;
        expect(worded / rows.length, `${width}px`).toBeGreaterThan(0.9);
      }
    });
  }

  for (const fixture of [
    FIXTURES.wallabagOfflineStrictUnchecked013,
    FIXTURES.koelNoTokenUnchecked013,
  ] as const) {
    test(`${fixture}: an All packages row keeps its height too, and its words stay inside it`, async ({
      page,
    }) => {
      for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pageUrl(fixture) + "#view=packages");
        const rows = await markedRows(page, "tr.pk-row.has-gate");
        expect(rows.length, `${width}px`).toBeGreaterThan(100);
        for (const row of rows) {
          expect(row.height, `${row.pkg} at ${width}px`).toBe(row.bare);
          expect(row.inside, `${row.pkg} at ${width}px`).toBe(true);
        }
        if (width >= 390) {
          const worded = rows.filter((row) => row.shown).length;
          expect(worded / rows.length, `${width}px`).toBeGreaterThan(0.95);
        }
      }
    });
  }

  test("a repeated way in dims its words, never the mark beside it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report.goto(FIXTURES.wallabagOfflineStrictUnchecked013);
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("li.frow .gate-mark.is-fails")]
        .filter((m) => m.getClientRects().length > 0)
        .map((m) => ({
          ditto: m.closest(".fc-reach")?.classList.contains("is-ditto") ?? false,
          colour: getComputedStyle(m).color,
        })),
    );
    expect(colours.some((c) => c.ditto)).toBe(true);
    expect(new Set(colours.map((c) => c.colour)).size).toBe(1);
  });

  test("a screen reader hears the mark with the row: its description says it fails this run", async ({
    page,
  }) => {
    await report.goto(FIXTURES.koelNoTokenUnchecked013);
    const row = page.locator('li.frow[data-pkg="jwilsson/spotify-web-api-php"]');
    await expect(row).toHaveAccessibleName("jwilsson/spotify-web-api-php");
    await expect(row).toHaveAccessibleDescription("left-behind fails this run");
    await report.goto(FIXTURES.miniEdges013);
    await expect(page.locator('li.frow[data-pkg="acme/future-step"]')).toHaveAccessibleDescription(
      "old-promise exempt: waiver, does not fail",
    );
  });
});

test.describe("PD-GATE-2: the summary leads with every failing package", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("koel without a token: the total comes before the split, and it is the one emphasis", async ({
    page,
  }) => {
    await report.goto(FIXTURES.koelNoTokenUnchecked013);
    const line = page.locator(".lead-gate");
    await expect(line).toHaveText("173 fail this run: 2 flagged, 171 unchecked, on All packages→.");
    const text = (await line.textContent()) ?? "";
    expect(text.indexOf("173")).toBeLessThan(text.indexOf("2 flagged"));
    // Why the unflagged fail, in the fail-on's own kind: their check did not run.
    expect(text).not.toContain("not flagged");
    // One line at a phone's width: the lead grows by one line at most.
    const box = await line.boundingBox();
    expect(box?.height ?? 99).toBeLessThan(26);
  });

  test("the unchecked count opens All packages on exactly those, each marked, focus kept", async ({
    page,
  }) => {
    await report.gotoWithHash(FIXTURES.koelNoTokenUnchecked013, "q=a");
    const link = page.getByRole("button", { name: /^171 unchecked/ });
    await link.click();
    await expect(page.getByRole("tab", { name: /All packages/ })).toHaveAttribute("aria-selected", "true");
    expect(await report.hash()).toContain("gate=fails");
    expect(await report.hash()).toContain("q=a");
    await expect(link).toBeFocused();
    await report.gotoWithHash(FIXTURES.koelNoTokenUnchecked013, "");
    await page.getByRole("button", { name: /^171 unchecked/ }).click();
    await expect(page.locator(".count-line")).toContainText("171 of 201 packages");
    await expect(page.locator("tr[data-pkg].has-gate")).toHaveCount(171);
    const worded = await page.evaluate(
      () =>
        [...document.querySelectorAll("tr[data-pkg] .gate-mark")].filter(
          (mark) => getComputedStyle(mark).display !== "none",
        ).length,
    );
    expect(worded).toBe(171);
  });

  test("level 1 opens by keyboard, is named by its words alone, and prints open", async ({ page }) => {
    await report.goto(FIXTURES.wallabagOfflineStrictUnchecked013);
    const total = page.getByRole("button", { name: "186 fail this run" });
    await total.focus();
    await page.keyboard.press("Enter");
    await expect(total).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(".gate-why").first();
    await expect(panel).toContainText("--strict-network");
    await expect(panel).toContainText("2 of the 4 run notes name them, on Run data.");
    await expect(panel).toContainText("Of those, 30 are flagged and 156 are not (unknown).");
    await page.keyboard.press("Enter");
    await expect(total).toHaveAttribute("aria-expanded", "false");
    await page.emulateMedia({ media: "print" });
    const printed = page.locator(".print-doc .gate-why");
    await expect(printed).toBeVisible();
    await expect(printed).toContainText("Fails on any package whose check did not run.");
  });

  test("the pressed filter keeps a carrier in forced colours, and the marker its shape", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ forcedColors: "active" });
    await report.goto(FIXTURES.koelNoTokenUnchecked013);
    const toggle = page.getByRole("button", { name: "2 flagged" });
    const before = await toggle.evaluate((el) => getComputedStyle(el).borderBottomStyle);
    await toggle.click();
    const after = await toggle.evaluate((el) => {
      const style = getComputedStyle(el);
      return { border: style.borderBottomStyle, weight: style.fontWeight };
    });
    expect(before).toBe("dotted");
    expect(after.border).toBe("solid");
    expect(Number(after.weight)).toBeGreaterThanOrEqual(700);
    const marker = await page
      .locator(".lead-gate .l1-mark")
      .evaluate((el) => getComputedStyle(el, "::before").content);
    expect(marker).toContain("▶");
  });

  for (const fixture of [FIXTURES.koelNoTokenUnchecked013, FIXTURES.wallabagBaselineOlder013] as const) {
    test(`${fixture}: axe finds nothing serious with level 1 open, light and dark`, async ({ page }) => {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await report.goto(fixture);
        await page.locator(".ledger .l1-btn").first().click();
        const results = await new AxeBuilder({ page }).include(".ledger").include(".topbar").analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual(
          [],
        );
      }
    });
  }
});

test.describe("PD-GATE-4: the 'Fails this run' filter and its address", () => {
  test("the rail's row lists the failing findings and round-trips through the address", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await report.gotoWithHash(FIXTURES.wallabagOfflineStrictUnchecked013, "gate=fails");
    const rail = page.getByRole("group", { name: "Filters" });
    const row = rail.getByRole("button", { name: /^Fails this run/ });
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".count-line")).toContainText("30 of 43");
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect(row).toBeFocused();
    expect(await report.hash()).not.toContain("gate=");
  });

  for (const fixture of [
    FIXTURES.koel013,
    FIXTURES.miniGateNull013,
    FIXTURES.wallabag,
    FIXTURES.wallabagOfflineStrict013,
  ] as const) {
    test(`${fixture}: a stale gate=fails lists every row and leaves the address`, async ({ page }) => {
      await report.gotoWithHash(fixture, "gate=fails");
      expect((await report.rows()).length).toBeGreaterThan(0);
      expect(await report.hash()).not.toContain("gate=");
      await expect(page.getByRole("button", { name: /^Fails this run/ })).toHaveCount(0);
    });
  }
});

test.describe("PD-GATE-1: no decided gate, nothing new", () => {
  for (const [fixture, label] of [
    [FIXTURES.koel013, "no gate ⓘ"],
    [FIXTURES.akaunting013, "no gate ⓘ"],
    [FIXTURES.miniGateNone013, "no gate ⓘ"],
    [FIXTURES.miniGateNull013, null],
    [FIXTURES.wallabag, "no gate ⓘ"],
    [FIXTURES.mini, "gate: silent ⓘ"],
  ] as const) {
    test(`${fixture}: the header's fact as before, and no clause, mark or rail row`, async ({ page }) => {
      await report.goto(fixture);
      expect(await report.gateFactLabel()).toBe(label);
      await expect(page.locator(".gate-fact, .lead-gate, .gate-mark, .gate-why")).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Ledger" })).not.toContainText("fail this run");
    });
  }
});

test.describe("PD-GATE-5: Run data's rows", () => {
  test("mode, strict network and result, rows of the existing table", async () => {
    await report.gotoWithHash(FIXTURES.wallabagOfflineStrictUnchecked013, "view=run");
    await expect(report.runField("mode")).toHaveText("check");
    await expect(report.runField("strict network")).toHaveText("yes · a failed network lookup fails the run");
    await expect(report.runField("result")).toHaveText("fails · --strict-network · --fail-on=unchecked");
  });

  test("an older report: strict network is an em dash and why, never 'no', and no result row", async ({
    page,
  }) => {
    await report.gotoWithHash(FIXTURES.wallabag, "view=run");
    await expect(report.runField("strict network")).toHaveText("— not in this document");
    await expect(page.locator("dt", { hasText: /^result$/ })).toHaveCount(0);
  });
});

test.describe("PD-GATE-3: the detail says it in one line under its pills", () => {
  for (const width of [390, 1440]) {
    test(`at ${width}px the line is one line, and the links keep the pills' row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [fixture, pkg, text] of [
        [
          FIXTURES.koelNoTokenUnchecked013,
          "jwilsson/spotify-web-api-php",
          "fails this run · meets --fail-on=unchecked",
        ],
        [FIXTURES.miniEdges013, "acme/future-step", "does not fail · meets --fail-on=high, exempt: waiver"],
        [
          FIXTURES.wallabagGenerateBaseline013,
          "guzzlehttp/streams",
          "does not fail · meets --fail-on=high, not applied",
        ],
      ] as const) {
        await report.gotoWithHash(fixture, `pkg=${encodeURIComponent(pkg)}`);
        const detail = page.getByRole("complementary", { name: pkg });
        const line = detail.locator(".detail-gate");
        await expect(line).toHaveText(text);
        expect((await line.boundingBox())?.height ?? 99, pkg).toBeLessThan(24);
        const pills = await detail.locator(".detail-pills").boundingBox();
        const links = await detail.locator(".detail-links").boundingBox();
        expect(Math.abs((pills?.y ?? 0) - (links?.y ?? 99)), pkg).toBeLessThan(8);
      }
    });
  }
});
