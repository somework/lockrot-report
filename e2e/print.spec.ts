import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * Print (print.css, print/PrintDocument.tsx): the stylesheet hides the app chrome, and while the
 * page prints — `beforeprint`, or a print medium, which is what `emulateMedia` gives — the printed
 * report replaces the open tab: one document in sections whatever tab was open. This used to be
 * pure CSS with no listener at all (history.md §10); PD-PRINT-1 (DESIGN.md §5) is the change.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.mini);
});

test("screen media shows the tab bar", async () => {
  expect(await report.isNavigationVisible()).toBe(true);
});

test("print media hides the tab bar and the rest of the interactive chrome with it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
});

test("switching back to screen media restores it", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  expect(await report.isNavigationVisible()).toBe(false);
  await page.emulateMedia({ media: "screen" });
  expect(await report.isNavigationVisible()).toBe(true);
});

// print.css: colour that carries meaning (a verdict's tone) must survive an actual print, not just
// a screen render — Chromium drops background colour on print unless a rule opts out with
// `print-color-adjust: exact` (plus the `-webkit-` form older engines still read). A screenshot
// never exercises that default, so these assert on the computed property and value directly.
test("print keeps the ledger bar segments' colour, unlike Chromium's ink-saving print default", async ({
  page,
}) => {
  const before = await report.ledgerSegmentPrintStyle();

  await page.emulateMedia({ media: "print" });
  const after = await report.ledgerSegmentPrintStyle();

  // The colour itself is unchanged from screen to print...
  expect(after.backgroundColor).toBe(before.backgroundColor);
  expect(after.backgroundColor).not.toBe("");
  expect(after.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  // ...because the rule that keeps it there is in force.
  expect(after.printColorAdjust).toBe("exact");
});

test("print keeps a Findings row's verdict word in its own tone", async ({ page }) => {
  // mini.json: vendor/transitive is the abandoned finding (fixtures/bundles/mini.json). Since
  // PD-ROWS-4 the verdict is a coloured word, not a bordered pill: its tone is its text colour.
  const before = await report.verdictPrintStyle("vendor/transitive", "abandoned");

  await page.emulateMedia({ media: "print" });
  const after = await report.verdictPrintStyle("vendor/transitive", "abandoned");

  expect(after.color).toBe(before.color);
  expect(after.color).not.toBe("");
  expect(after.printColorAdjust).toBe("exact");
});

// PD-ROWS-1/PD-ROWS-4 (DESIGN.md §5, regression review): a Findings row quotes one signal on
// screen, and the detail pane lists the rest — but print drops `.shell-detail` entirely (the rule
// above), so a reader on paper would lose the other signals outright. koel_koel's daverandom/resume carries three (S2, S4, S5; finding-row-key-fact.spec.ts
// already covers its screen-only reading).
test("print shows every signal line of a Findings row, not just its key fact", async ({ page }) => {
  await report.goto(FIXTURES.koel);
  expect(await report.rowSignalIds("daverandom/resume")).toEqual(["S2"]);

  await page.emulateMedia({ media: "print" });

  expect(await report.rowSignalIds("daverandom/resume")).toEqual(["S2", "S4", "S5"]);
});

// PD-PRINT-1: one printed document in sections, whatever tab is open.
const SECTIONS = ["1 Summary", "2 Findings", "3 Advisories", "4 Blast radius", "5 Run data"];

async function printedSections(page: import("@playwright/test").Page): Promise<string[]> {
  const titles = await page.getByRole("heading", { level: 2 }).filter({ hasText: /^\d/ }).allInnerTexts();
  return titles.map((t) => t.replace(/\s+/g, " ").trim());
}

test("the header offers Print / PDF and Copy summary on screen, and neither prints", async ({ page }) => {
  const print = page.getByRole("button", { name: "Print / PDF" });
  const copy = page.getByRole("button", { name: "Copy summary" });
  await expect(print).toBeVisible();
  await expect(copy).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(print).toBeHidden();
  await expect(copy).toBeHidden();
});

test("print media prints the report in sections, whatever tab is open, and screen gets the tab back", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=radius");

  await page.emulateMedia({ media: "print" });

  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);
  await expect(page.getByText("Printed from the Blast radius tab.")).toBeVisible();
  await expect(page.getByText("All packages is left out; print from that tab to include it.")).toBeVisible();
  // The summary band prints even from a tab whose screen had none (Run data hides it).
  await expect(page.getByRole("group", { name: "Ledger" })).toHaveCount(1);

  await page.emulateMedia({ media: "screen" });
  expect(await printedSections(page)).toEqual([]);
  expect(await report.isNavigationVisible()).toBe(true);
});

test("printing from All packages adds it as the last section and says why", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.mini, "view=packages");

  await page.emulateMedia({ media: "print" });

  await expect.poll(() => printedSections(page)).toEqual([...SECTIONS, "6 All packages"]);
  await expect(page.getByText(/Printed because the page was open on All packages/)).toBeVisible();
});

test("the printed Blast radius is its top: each ranked row's packages stay folded", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=radius");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  // hoa/compiler is listed under wallabag/rulerz's row: shown when the tab itself prints, not here.
  await expect(page.getByRole("list", { name: "Listed under wallabag/rulerz" })).toBeHidden();
});

test("the summary band carries the dev/production rollup on screen and on paper", async ({ page }) => {
  await report.goto(FIXTURES.wallabag);
  await expect(page.getByText("51 in production, 18 dev-only", { exact: true })).toBeVisible();
  await expect(page.getByText("20 required directly, 49 pulled in", { exact: true })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  // The screen's band is still in the DOM, hidden under the printed one.
  await expect(
    page.getByText("51 in production, 18 dev-only", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
});

test("a PDF of the page is the sectioned report, numbered, and leaves the screen as it was", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "page.pdf() is Chromium-only");
  await report.gotoWithHash(FIXTURES.wallabag, "view=advisories");
  await page.evaluate(() => {
    const host = document.querySelector(".print-doc");
    const seen: number[] = [];
    (window as unknown as { printKids: number[] }).printKids = seen;
    // App registered its listener first, so by the time this runs the report is in place.
    window.addEventListener("beforeprint", () => {
      seen.push(host?.childElementCount ?? -1);
    });
  });

  const pdf = await page.pdf({ format: "A4" });

  expect(await page.evaluate(() => (window as unknown as { printKids: number[] }).printKids)).toEqual([1]);
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  // Back on screen: the print is gone and the reader's tab is untouched.
  expect(await page.evaluate(() => document.querySelector(".print-doc")?.childElementCount)).toBe(0);
  await expect(page.getByRole("tab", { name: /Advisories/ })).toHaveAttribute("aria-selected", "true");
});

test("printing from the dark theme prints dark ink on white", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await report.goto(FIXTURES.mini);

  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const ink = await page
    .getByRole("heading", { name: /Summary/ })
    .evaluate((el) => getComputedStyle(el).color);
  // --ink's light value, #0f1a19.
  expect(ink).toBe("rgb(15, 26, 25)");
});

// PD-PRINT-4: a Findings group on paper is a table whose head — the group's name and the column
// head with the age axis' captions — Chromium repeats on every page the group runs onto. The repeat
// needs the head to be a table-header-group that does not break inside; each row a table row.
test("a printed Findings group repeats its name and age axis on every page it runs onto", async ({
  page,
}) => {
  await report.goto(FIXTURES.wallabag);
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const layout = await page.locator(".pd-findings .pf-group").evaluateAll((groups) =>
    groups.map((group) => {
      const top = group.querySelector(".pf-top");
      const row = group.querySelector(".pf-tr");
      const style = (el: Element | null) => (el ? getComputedStyle(el) : null);
      return {
        group: style(group)?.display,
        head: style(top)?.display,
        headBreak: style(top)?.breakInside,
        axis: top?.querySelector(".fhead-axis")?.textContent,
        row: style(row)?.display,
      };
    }),
  );
  expect(layout).toHaveLength(4);
  for (const group of layout) {
    expect(group).toEqual({
      group: "table",
      head: "table-header-group",
      headBreak: "avoid",
      axis: "Years since release03y5y10y+",
      row: "table-row",
    });
  }
  // No section is forced onto a page of its own any more.
  expect(await page.locator(".pd-findings").evaluate((el) => getComputedStyle(el).breakBefore)).toBe("auto");
});

test("printed All packages heads are words, so the repeated head on a continuation page is not blank", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=packages");
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual([...SECTIONS, "6 All packages"]);

  const heads = page.locator(".pd-packages thead th");
  await expect(heads).toHaveText([
    "Package",
    "Version",
    "Libyears",
    /^Verdict/,
    "Priority",
    "Reached",
    "Signals",
  ]);
  await expect(page.locator(".pd-packages thead button")).toHaveCount(0);
  await expect(page.getByText("Every package's data is as of 2026-09-24.", { exact: false })).toBeVisible();
});

// PD-PRINT-5: Blast radius's ranked rows are a table on paper as well, its head — the key and the
// column head with the age axis — repeated on every page the rows run onto; each row one unbreakable
// table row; and what follows the ranking keeps to its last row, never opening a page on its own.
test("the printed Blast radius repeats its key and age axis over every page its ranked rows run onto", async ({
  page,
}) => {
  await report.goto(FIXTURES.koel);
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const layout = await page.locator(".pd-radius .rl-ptable").evaluate((table) => {
    const top = table.querySelector(".rl-ptop");
    const rows = [...table.querySelectorAll(".rl-list > .rrow")];
    const style = (el: Element | null) => (el ? getComputedStyle(el) : null);
    return {
      table: style(table)?.display,
      head: style(top)?.display,
      headBreak: style(top)?.breakInside,
      key: top?.querySelector(".rl-key") !== null,
      axis: top?.querySelector(".fhead-axis")?.textContent,
      rows: rows.map((row) => [style(row)?.display, style(row)?.breakInside]),
      after: [...(table.parentElement?.querySelectorAll(":scope > .rl-fold, :scope > .rl-foot") ?? [])].map(
        (el) => style(el)?.breakBefore,
      ),
    };
  });
  expect(layout).toEqual({
    table: "table",
    head: "table-header-group",
    headBreak: "avoid",
    key: true,
    axis: "Their years since release03y5y10y+",
    rows: [
      ["table-row", "avoid"],
      ["table-row", "avoid"],
    ],
    after: ["avoid", "avoid"],
  });
});

test("the Blast radius tab on screen keeps its plain list: the print table is paper's only", async ({
  page,
}) => {
  await report.gotoWithHash(FIXTURES.koel, "view=radius");
  await expect(page.locator("main .rl-ptable")).toHaveCount(0);
  await expect(page.locator("main .rl > .rl-head")).toHaveCount(1);
});

// PD-PRINT-5: the axis that repeats on every printed page reads as a scale — "Reached" clear of its
// "0", the 3y and 5y captions clear of each other, the grey-bar key inside the age column between its
// caption and its ticks, not stacked on "Reached".
test("the printed Findings axis keeps its captions apart", async ({ page }) => {
  // A4's printable width at 96 dpi (210mm less 2 × 13mm margins): the list's two-line layout.
  await page.setViewportSize({ width: 696, height: 1000 });
  await report.goto(FIXTURES.wallabag);
  await page.emulateMedia({ media: "print" });
  await expect.poll(() => printedSections(page)).toEqual(SECTIONS);

  const head = page.locator(".pd-findings .fhead").first();
  const box = async (selector: string) => {
    const b = await head.locator(selector).boundingBox();
    if (b === null) throw new Error(`${selector} has no box`);
    return b;
  };
  const reach = await box(".fhead-reach");
  const zero = await box(".fhead-tick.is-start");
  const warn = await box(".fhead-tick.is-warn");
  const high = await box(".fhead-tick.is-high");
  const key = await box(".fhead-key");
  const caption = await box(".fhead-axis-label");
  const age = await box(".fhead-age");

  expect(zero.x - (reach.x + reach.width)).toBeGreaterThanOrEqual(16);
  expect(high.x - (warn.x + warn.width)).toBeGreaterThanOrEqual(8);
  expect(key.x).toBeGreaterThanOrEqual(age.x - 1);
  expect(key.y).toBeGreaterThanOrEqual(caption.y + caption.height - 1);
  expect(key.y + key.height).toBeLessThanOrEqual(zero.y + 1);
});
