import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

/**
 * PD-SEARCH-1 (DESIGN.md §5): free text keeps legacy's semantics — a word in the package name,
 * version, verdict or evidence — and the address keeps `q=`, but the page now says when a package
 * was found outside its name. On wallabag, "hoa/" lists the 14 hoa/* packages and the two
 * wallabag/rulerz packages whose evidence names the hoa/* packages they pull in.
 */
let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.wallabag);
});

test("the status line splits the count and names the two packages that only mention the word", async () => {
  await report.search("hoa/");
  expect(await report.rows()).toHaveLength(16);
  // No repeated "16" (PD-SEARCH-1 polish item 2: the Findings tab's split total is always the same
  // 16 the line already opened with) and no literal "·" glyph (item 1).
  expect(await report.countLine()).toContain(
    "14 on the row, 2 mention “hoa/” (wallabag/rulerz, wallabag/rulerz-bundle)",
  );
  // The address is unchanged: the query is still just q=.
  expect(await report.hash()).toContain("q=hoa%2F");
});

test("the query is echoed back with the reader's own case, matching stays case-insensitive", async () => {
  await report.search("HOA/");
  expect(await report.rows()).toHaveLength(16);
  expect(await report.countLine()).toContain("14 on the row, 2 mention “HOA/”");
});

test("a row found only in its evidence quotes the hit; a row found by its name does not", async ({
  page,
}) => {
  await report.search("hoa/");
  const rulerz = page.locator('[data-pkg="wallabag/rulerz"]');
  await expect(rulerz.locator(".match-note")).toHaveText(
    "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
  );
  await expect(rulerz.locator(".match-note mark")).toHaveText("hoa/");
  await expect(page.locator('[data-pkg="hoa/compiler"] .match-note')).toHaveCount(0);
  // The row's accessible name is still the package alone.
  await expect(page.getByRole("listitem", { name: "wallabag/rulerz", exact: true })).toBeVisible();
  // PD-SEARCH-1 polish item 5: the same words again as a `title`, for a mouse reader once the wide
  // ledger clips the note itself to one line.
  await expect(rulerz.locator(".match-note")).toHaveAttribute(
    "title",
    "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
  );
});

test("the note stays one line on the wide, one-line ledger, instead of growing the row", async ({ page }) => {
  await report.search("hoa/");
  const note = page.locator('[data-pkg="wallabag/rulerz"] .match-note');
  const [noteBox, style] = await Promise.all([
    note.boundingBox(),
    note.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { whiteSpace: computed.whiteSpace, textOverflow: computed.textOverflow };
    }),
  ]);
  expect(style.whiteSpace).toBe("nowrap");
  expect(style.textOverflow).toBe("ellipsis");
  // One line of this note's own 11.5px/16px text (search.css); two would be ~32px.
  expect(noteBox?.height ?? 0).toBeLessThan(20);
});

test("the names beside the split are visible but out of the live region's own announcement", async ({
  page,
}) => {
  await report.search("hoa/");
  const namesNode = page.locator('.match-split [aria-hidden="true"]');
  await expect(namesNode).toBeVisible();
  await expect(namesNode).toHaveText("(wallabag/rulerz, wallabag/rulerz-bundle)");
});

test("a #q= link loads with the split and the notes already in place", async ({ page }) => {
  await report.gotoWithHash(FIXTURES.wallabag, "view=packages&q=hoa%2F");
  expect(await report.countLine()).toContain("14 on the row, 2 mention “hoa/”");
  await expect(page.locator('[data-pkg="wallabag/rulerz-bundle"] .match-note mark')).toHaveText("hoa/");
});

test("the Advisories tab counts packages, and each row of one found in its evidence carries the note", async ({
  page,
}) => {
  await report.tab("advisories");
  await report.search("11.x");
  expect(await report.countLine()).toContain("1 package matches “11.x”: 1 mentions it (spomky-labs/otphp)");
  await expect(page.locator(".adv .match-note")).toHaveCount(2);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious axe violation with the notes on screen, ${colorScheme}`, async ({ page }) => {
    // The scheme is set before the page loads, so no colour is caught mid-transition.
    await page.emulateMedia({ colorScheme });
    await report.gotoWithHash(FIXTURES.wallabag, "q=hoa%2F");
    await expect(page.locator(".match-note").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".fledger").include('[role="status"]').analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`))).toEqual([]);
  });
}
