import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.goto(FIXTURES.mini);
});

test.describe("/ focuses search, suppressed while already focused", () => {
  test("/ moves focus into the search box", async () => {
    expect(await report.isSearchFocused()).toBe(false);
    await report.pressSlash();
    expect(await report.isSearchFocused()).toBe(true);
  });

  test("/ typed while the search box already has focus does not fire the shortcut again", async () => {
    await report.focusSearch();
    await report.pressSlash();
    // Still just focused (no glossary/detail side effect ever attaches to "/" — the only thing to
    // assert is that the guard held and nothing else moved).
    expect(await report.isSearchFocused()).toBe(true);
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});

test.describe("? opens the glossary, suppressed while search is focused", () => {
  test("? opens the glossary", async () => {
    await report.pressQuestion();
    expect(await report.isGlossaryOpen()).toBe(true);
  });

  test("? typed into the search box does not open the glossary", async () => {
    await report.focusSearch();
    await report.pressQuestion();
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});

test.describe("Escape priority chain", () => {
  test("closes the glossary first, even over an open detail pane", async () => {
    await report.openPackage("vendor/snapshot");
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    expect((await report.detail()).open).toBe(true);

    await report.pressEscape();
    expect(await report.isGlossaryOpen()).toBe(false);
    expect((await report.detail()).open).toBe(true); // untouched by the same Escape press

    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
  });

  test("blurs the search box when nothing else is open", async () => {
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
    await report.focusSearch();
    expect(await report.isSearchFocused()).toBe(true);
    await report.pressEscape();
    expect(await report.isSearchFocused()).toBe(false);
  });
});

test.describe("j / k walk the visible list and open each package", () => {
  test("j moves forward, k moves back, both open the detail", async () => {
    await report.tab("packages"); // nothing open, so j starts at the first row
    await report.pressJ();
    expect((await report.detail()).name).toBe("vendor/transitive");
    await report.pressJ();
    expect((await report.detail()).name).toBe("vendor/snapshot");
    await report.pressK();
    expect((await report.detail()).name).toBe("vendor/transitive");
  });

  test("k at the start of the list clamps to the first item instead of wrapping", async () => {
    await report.tab("packages");
    await report.pressK();
    expect((await report.detail()).name).toBe("vendor/transitive"); // first item, not the last
    await report.pressK();
    expect((await report.detail()).name).toBe("vendor/transitive");
  });

  test("j/k are suppressed while the search box is focused", async () => {
    await report.tab("packages");
    await report.focusSearch();
    await report.pressJ();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("Enter on a focused row opens its detail, and never closes it (PD-ROWS-7)", () => {
  test("opens, then a second Enter keeps it open; Escape closes it", async () => {
    // Findings' rows have always been focusable (unlike Packages' before M6's fix), so this test
    // drives Enter from a Findings row.
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
    await report.focusRow("vendor/snapshot");
    await report.pressEnter();
    expect((await report.detail()).name).toBe("vendor/snapshot");
    // Re-render replaces the row's DOM node wholesale, so focus does not survive the first Enter —
    // re-focus before the second press rather than assuming keyboard focus persisted across it.
    await report.focusRow("vendor/snapshot");
    await report.pressEnter();
    expect((await report.detail()).name).toBe("vendor/snapshot");
    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("M5: Enter on a link inside a row must not hijack the link", () => {
  test("the link is followed, the row's detail does not toggle", async () => {
    // M5 (DESIGN.md §5), fixed on purpose: legacy's keydown handler checked the row before
    // anything about an anchor, so Enter on a focused in-row link toggled the detail instead of
    // following the link.
    await report.tab("packages");
    expect((await report.detail()).open).toBe(false);
    // vendor/transitive's lock came from a Composer repository, so its Packages-tab row links out
    // to Packagist (report.js:66-70, packagistUrl).
    await report.focusLinkInRow("vendor/transitive");
    await report.pressEnter();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("M6: Packages-table rows are focusable and show a selected state", () => {
  test("a row can receive keyboard focus and is marked selected once open", async () => {
    // M6 (DESIGN.md §5), fixed on purpose: legacy's Packages-table rows carried no
    // tabindex/role/aria-current at all, unlike Findings' rows. Focusable, but since PD-ROWS-11 not
    // each a Tab stop: with nothing open the first row is the list's one, and opening this row
    // makes it the one (this test used to read "focusable" as "in the Tab order").
    await report.tab("packages");
    expect(await report.rowFocusable("vendor/snapshot")).toBe(true);
    expect(await report.rowInTabOrder("vendor/snapshot")).toBe(false);
    await report.openPackage("vendor/snapshot");
    expect(await report.rowSelected("vendor/snapshot")).toBe(true);
    expect(await report.rowInTabOrder("vendor/snapshot")).toBe(true);
  });
});

test.describe("PD-ROWS-11: keyboard focus follows the selection", () => {
  test("after a click, j moves focus with the open package, so Enter opens the row j reached", async () => {
    // M5's mismatch: focus stayed on the clicked row while j moved the open package on, so Enter
    // opened the clicked row again instead of the one on screen as open.
    await report.clickPackage("vendor/transitive");
    await report.pressJ();
    const reached = (await report.detail()).name;
    expect(reached).not.toBe("vendor/transitive");
    expect(await report.focusedRowName()).toBe(reached);

    await report.pressEnter();
    expect((await report.detail()).name).toBe(reached);
    await report.pressK();
    expect(await report.focusedRowName()).toBe("vendor/transitive");
    expect((await report.detail()).name).toBe("vendor/transitive");
  });

  test("Escape gives focus back to the row, and j continues below it rather than from the top", async () => {
    await report.tab("packages");
    await report.pressJ();
    await report.pressJ();
    expect((await report.detail()).name).toBe("vendor/snapshot");
    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
    expect(await report.focusedRowName()).toBe("vendor/snapshot");
    expect(await report.rowInTabOrder("vendor/snapshot")).toBe(true);

    const rows = await report.rows();
    await report.pressJ();
    expect((await report.detail()).name).toBe(rows[2]);
  });

  test("j and k typed into the search box stay text, with a package open", async () => {
    await report.tab("packages");
    await report.pressJ();
    const open = (await report.detail()).name;
    await report.focusSearch();
    await report.typeKeys("jk");
    expect(await report.searchValue()).toBe("jk");
    expect(await report.isSearchFocused()).toBe(true);
    expect((await report.detail()).name).toBe(open);
  });

  test("Escape typed in the search box closes the package and leaves focus in the box", async () => {
    await report.tab("packages");
    await report.pressJ();
    await report.focusSearch();
    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
    expect(await report.isSearchFocused()).toBe(true);
  });

  test("Tab reaches one row of the list, then its own links, then leaves the list for the detail", async () => {
    // Every row, and each Findings row's signal link, used to be a Tab stop of its own.
    const rows = await report.rows();
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(await report.listTabStops())).toEqual(new Set([rows[0]]));

    await report.clickPackage(rows[1] ?? "");
    const stops = await report.listTabStops();
    expect(new Set(stops)).toEqual(new Set([rows[1]]));

    let tabs = 0;
    while (!(await report.isFocusInDetail()) && tabs < stops.length + 1) {
      await report.pressTab();
      tabs += 1;
    }
    expect(await report.isFocusInDetail()).toBe(true);
    expect(tabs).toBeLessThanOrEqual(stops.length);
  });
});

test.describe("M7: j/k must not open a package that has no row on screen", () => {
  test("Blast radius only ever selects a package it actually lists", async () => {
    // M7 (DESIGN.md §5), fixed on purpose: legacy's j/k walked every flagged finding while Radius
    // only lists each direct requirement's pulled children, so j/k could open a package with no
    // card and no row on screen (mini.json's vendor/snapshot: direct:false, chain:[]).
    await report.tab("radius");
    expect(await report.rows()).toEqual(["vendor/transitive"]);
    await report.pressJ();
    expect((await report.detail()).name).toBe("vendor/transitive");
    await report.pressJ(); // legacy: cursor advances to vendor/snapshot, which has no row here
    expect((await report.detail()).name).toBe("vendor/transitive");
  });
});

test.describe("M10: j/k must not act while the glossary is open", () => {
  test("selection is untouched behind an open dialog", async () => {
    // M10 (DESIGN.md §5), fixed on purpose: legacy's j/k guard only checked focus against the
    // search box, so keydown still bubbled to the document and moved the selection underneath an
    // open glossary dialog.
    // With vendor/transitive open, a j that got through would move to vendor/snapshot.
    await report.openPackage("vendor/transitive");
    await report.openGlossary();
    await report.pressJ();
    expect((await report.detail()).name).toBe("vendor/transitive");
    expect(await report.hash()).toBe("#pkg=vendor%2Ftransitive");
  });
});
