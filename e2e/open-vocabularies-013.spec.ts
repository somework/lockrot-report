/**
 * PD-VOCAB-1: a value this page does not know, in any open vocabulary, renders as written in code
 * on every tab, in the detail, the glossary and on paper, with no console error. The real 0.13
 * bundles also go through forced colours and print.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES, REPO_ROOT, type FixtureName } from "./support/pages";

const FIXTURES_013: readonly FixtureName[] = [
  FIXTURES.wallabag013,
  FIXTURES.koel013,
  FIXTURES.koelAll013,
  FIXTURES.mautic013,
  FIXTURES.akaunting013,
  FIXTURES.miniEdges013,
  FIXTURES.miniEdgesLockOnly013,
  FIXTURES.koelLockOnly013,
  FIXTURES.koelNoTokenUnchecked013,
  FIXTURES.wallabagBaselineOlder013,
  FIXTURES.wallabagBaselineSelf013,
  FIXTURES.wallabagGenerateBaseline013,
  FIXTURES.wallabagOfflineStrict013,
  FIXTURES.wallabagOfflineStrictUnchecked013,
  FIXTURES.miniGateGenerate013,
  FIXTURES.miniGateNone013,
  FIXTURES.miniGateNull013,
  FIXTURES.miniGateUnchecked013,
  FIXTURES.miniGateUnknown013,
  FIXTURES.miniGateVerdict013,
];

const TABS = ["Advisories", "All packages", "Blast radius", "Run data", "Findings"] as const;
const SECTIONS = ["1 Summary", "2 Findings", "3 Advisories", "4 Blast radius", "5 Run data"];

/** Console errors and uncaught exceptions, collected from the moment the page is created. */
function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function printedSections(page: Page): Promise<string[]> {
  const titles = await page.getByRole("heading", { level: 2 }).filter({ hasText: /^\d/ }).allInnerTexts();
  return titles.map((t) => t.replace(/\s+/g, " ").trim());
}

/** The first verdict the bundle flags, in the ledger's own order of the run's flagged verdicts. */
function firstFlaggedVerdict(fixture: FixtureName): string | null {
  const bundle = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures/bundles", `${fixture}.json`), "utf8")) as {
    report: { run?: { flagged_verdicts?: string[] }; counts?: Record<string, number> };
  };
  const flagged = bundle.report.run?.flagged_verdicts ?? [];
  return flagged.find((verdict) => (bundle.report.counts?.[verdict] ?? 0) > 0) ?? null;
}

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("mini-0.13-edges: every value this page does not know, shown as written", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every tab, acme/licensed and acme/left open, the glossary: no console error", async ({ page }) => {
    const problems = watchErrors(page);
    await report.goto(FIXTURES.miniEdges013);
    for (const name of TABS) {
      await page.getByRole("tab", { name }).click();
    }

    await report.tab("packages");
    const rail = await report.railRows();
    expect(rail.filter((row) => ["S99", "acme:licence"].includes(row.label))).toEqual([
      { label: "S99", count: 1, pressed: false },
      { label: "acme:licence", count: 1, pressed: false },
    ]);

    await report.openPackage("acme/licensed");
    const licensed = await report.detail();
    expect(licensed.name).toBe("acme/licensed");
    expect(licensed.text).toContain("also acme:licence, S99, checks this page does not know.");
    expect(licensed.text).toContain("Could not run: S2 release age (undated releases, see S10)");
    expect(licensed.text).toContain("A check from outside lockrot, which this page does not know.");
    expect(licensed.text).toContain("A lockrot check this page does not know. S99 in lockrot’s docs");
    expect(licensed.text).not.toContain("acme:licence in lockrot’s docs");
    const detail = page.getByRole("complementary", { name: "acme/licensed" });
    await expect(detail.locator("code", { hasText: /^acme:licence$/ }).first()).toBeAttached();

    await report.tab("findings");
    await report.openPackage("acme/left");
    const left = await report.detail();
    expect(left.name).toBe("acme/left");
    // S8's unknown floor_source is its data as written; the branch rows' 0.13 fields are not drawn
    // yet.
    const floor = page
      .getByRole("complementary", { name: "acme/left" })
      .locator("dl.detail-data > dt")
      .filter({ hasText: /^floor source$/ });
    expect(await floor.evaluate((dt) => dt.nextElementSibling?.textContent)).toBe("extension");
    expect(left.text).not.toContain("straddles");

    await report.openGlossary();
    const glossary = await report.glossaryText();
    expect(glossary).toMatch(/S99\s*A lockrot check this page does not know\./);
    expect(glossary).toMatch(/acme:licence\s*A check from outside lockrot, which this page does not know\./);
    await report.pressEscape();

    expect(problems).toEqual([]);
  });

  test("on paper, from All packages: the ids as written, no console error", async ({ page }) => {
    const problems = watchErrors(page);
    await report.gotoWithHash(FIXTURES.miniEdges013, "view=packages");
    await page.emulateMedia({ media: "print" });
    await expect.poll(() => printedSections(page)).toEqual([...SECTIONS, "6 All packages"]);
    // The printed report is its own document (PrintDocument.tsx); its rows carry the package name.
    const row = page.locator('.pd-packages tr[data-pkg="acme/licensed"]');
    await expect(row).toContainText("S99 acme:licence S10");
    await expect(row.locator("code")).toHaveText(["S99", "acme:licence"]);
    expect(problems).toEqual([]);
  });
});

test.describe("every 0.13 bundle: forced colors and print, as the older fixtures", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const fixture of FIXTURES_013) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${fixture}, ${colorScheme} forced colors: waffle and verdict bar keep their marks`, async ({
        page,
      }) => {
        const problems = watchErrors(page);
        await report.goto(fixture);
        await page.emulateMedia({ colorScheme, forcedColors: "active" });

        const waffle = await report.summaryWaffle();
        if (waffle !== null && waffle.flagged > 0 && waffle.total > waffle.flagged) {
          await expect
            .poll(() => report.summaryWaffleForcedColors())
            .toEqual({ flaggedDistinct: true, restOutlined: true });
        }
        const verdict = firstFlaggedVerdict(fixture);
        if (verdict !== null) {
          await expect
            .poll(() => report.verdictBarForcedColors(verdict))
            .toEqual({ partFilled: true, rowFramed: false });
        }
        const first = (await report.rows())[0];
        if (first !== undefined) {
          await report.openPackage(first);
          expect((await report.detail()).open).toBe(true);
        }
        expect(problems).toEqual([]);
      });
    }

    test(`${fixture}, print: the chrome hides, every section prints, the tones survive`, async ({ page }) => {
      const problems = watchErrors(page);
      await report.goto(fixture);
      const hasBar = firstFlaggedVerdict(fixture) !== null;
      const before = hasBar ? await report.ledgerSegmentPrintStyle() : null;

      await page.emulateMedia({ media: "print" });
      expect(await report.isNavigationVisible()).toBe(false);
      await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
      if (before !== null) {
        const after = await report.ledgerSegmentPrintStyle();
        expect(after.backgroundColor).toBe(before.backgroundColor);
        expect(after.printColorAdjust).toBe("exact");
      }

      await page.emulateMedia({ media: "screen" });
      expect(await report.isNavigationVisible()).toBe(true);
      expect(problems).toEqual([]);
    });
  }
});
