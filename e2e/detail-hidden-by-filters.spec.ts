/**
 * PD-DETAIL-4 (DESIGN.md §5): "the detail survives a filter that hides its package" is kept on
 * purpose (§5's own "deliberately kept" list) — this only tells a reader it is happening, with a
 * control to undo it. mini.json's counts and findings are documented in ledger.test.tsx.
 */
import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test("says nothing while the open package matches the current filters", async () => {
  await report.goto(FIXTURES.mini);
  await report.openPackage("vendor/transitive");

  expect((await report.detail()).text).not.toContain("Hidden by the current filters");
});

test("shows a factual line, with a control that clears the filters, once a search term hides the open package", async () => {
  await report.goto(FIXTURES.mini);
  await report.openPackage("vendor/transitive");
  await report.search("no-such-package");
  expect(await report.rows()).toEqual([]);

  // The deliberate behaviour itself: the detail stays open although the row it names is gone.
  const detail = await report.detail();
  expect(detail.open).toBe(true);
  expect(detail.name).toBe("vendor/transitive");
  expect(detail.text).toContain("Hidden by the current filters");

  await report.clearFiltersFromDetail();

  expect(await report.searchValue()).toBe("");
  expect(await report.rows()).toContain("vendor/transitive");
  expect((await report.detail()).name).toBe("vendor/transitive");
  expect((await report.detail()).text).not.toContain("Hidden by the current filters");
});

// a11y/regression review: "Clear filters" used to unmount itself in the same click that ran it
// (`hidden` flips false once the dispatch clears the filters), dropping keyboard focus to `<body>`
// with nothing read out to say the filters had cleared (WCAG 2.4.3).
test("moves focus to the detail's own Close button instead of dropping it, once clicked", async () => {
  await report.goto(FIXTURES.mini);
  await report.openPackage("vendor/transitive");
  await report.search("no-such-package");

  await report.clearFiltersFromDetail();

  expect(await report.isFocusOnDetailClose()).toBe(true);
});

// a11y review: the note above sits inside `DetailHeader`, with no role or live region of its own
// (`role` null, `aria-live` null, no `[aria-live]` ancestor) — a reader typing a search term never
// heard that the package they had open just left the list. `SearchBar`'s own count line already is
// a live region (`role="status" aria-live="polite"`); it now names the fact too, off the same
// `domain/filters.ts#hiddenByFilters` check, so it can never disagree with the note above about
// when it applies.
test("the search status line also names the open package once it's hidden", async () => {
  await report.goto(FIXTURES.mini);
  await report.openPackage("vendor/transitive");
  expect(await report.countLine()).not.toContain("vendor/transitive");

  await report.search("no-such-package");

  expect(await report.countLine()).toContain("vendor/transitive is hidden by the current filters");
});

test("shows the line when a ledger filter, not the search box, is what hides it", async () => {
  await report.goto(FIXTURES.mini);
  await report.openPackage("vendor/transitive"); // abandoned
  await report.ledgerButton("verdict", "pinned");
  expect(await report.rows()).not.toContain("vendor/transitive");

  expect((await report.detail()).text).toContain("Hidden by the current filters");
});

// The other side of this fact — a package its own tab never lists at all, with or without any
// filter (an `ok`/`finished` package while on Findings) — never shows the line either: that is a
// different fact, covered at the unit level (tests/unit/ui/detail.test.tsx), where the tab's own
// population can be held fixed independently of a real tab switch's own keepDetail wiring.
