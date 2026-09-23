import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { currentRenderer, FIXTURES } from "./support/pages";

const renderer = currentRenderer();
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
    await report.closeDetail(); // clear the boot auto-open first
    await report.focusSearch();
    expect(await report.isSearchFocused()).toBe(true);
    await report.pressEscape();
    expect(await report.isSearchFocused()).toBe(false);
  });
});

test.describe("j / k walk the visible list and open each package", () => {
  test("j moves forward, k moves back, both open the detail", async () => {
    await report.tab("packages"); // no boot auto-open here, a clean cursor at -1
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

test.describe("Enter on a focused row toggles its detail", () => {
  test("opens, then closes on a second Enter", async () => {
    // Findings' .row carries tabindex="0" in legacy (M6 is specifically that Packages' <tr> does
    // not), so this is the tab where focusing a row is meaningful on both renderers today.
    await report.closeDetail(); // clear the boot auto-open first
    await report.focusRow("vendor/snapshot");
    await report.pressEnter();
    expect((await report.detail()).name).toBe("vendor/snapshot");
    // Re-render replaces the row's DOM node wholesale, so focus does not survive the first Enter —
    // re-focus before the second press rather than assuming keyboard focus persisted across it.
    await report.focusRow("vendor/snapshot");
    await report.pressEnter();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("M5: Enter on a link inside a row must not hijack the link", () => {
  test("the link is followed, the row's detail does not toggle", async () => {
    test.fail(
      renderer === "legacy",
      "M5: the keydown handler checks .closest('.row, tbody tr') before anything about an anchor " +
        "(unlike the click handler), so Enter on a focused in-row link toggles the detail instead " +
        "of following it (report.js:1022-1030)",
    );
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
    test.fail(
      renderer === "legacy",
      "M6: legacy <tr> rows carry no tabindex/role/aria-current, only Findings' .row does " +
        "(report.js:569 vs :436); lastRow()'s node.focus() is then a no-op on Packages",
    );
    await report.tab("packages");
    expect(await report.rowFocusable("vendor/snapshot")).toBe(true);
    await report.openPackage("vendor/snapshot");
    expect(await report.rowSelected("vendor/snapshot")).toBe(true);
  });
});

test.describe("M7: j/k must not open a package that has no row on screen", () => {
  test("Blast radius only ever selects a package it actually lists", async () => {
    test.fail(
      renderer === "legacy",
      "M7: on Radius, j/k walk FLAGGED (every flagged finding) while the view only lists each " +
        "direct requirement's *pulled* children — an unreachable flagged finding (mini.json's " +
        "vendor/snapshot: direct:false, chain:[]) opens with no card and no row (report.js:599)",
    );
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
    test.fail(
      renderer === "legacy",
      "M10: the j/k guard only checks document.activeElement !== #q; a native <dialog> traps Tab " +
        "focus but keydown still bubbles to document, so j/k keep moving the selection underneath " +
        "an open glossary (report.js:1039-1048)",
    );
    await report.openGlossary(); // boot already auto-opened vendor/transitive on this wide viewport
    await report.pressJ();
    expect(await report.hash()).not.toContain("pkg="); // select() was never reached -> pkgAuto still true
  });
});
