import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { FIXTURES } from "./support/pages";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("theme toggle and persistence", () => {
  test("toggling flips the effective theme and writes localStorage['lockrot-theme']", async () => {
    await report.goto(FIXTURES.mini);
    const before = await report.theme();
    await report.toggleTheme();
    const after = await report.theme();
    expect(after).not.toBe(before);
    expect(await report.themeStorageValue()).toBe(after);
  });

  test("persists across a reload", async () => {
    await report.goto(FIXTURES.mini);
    await report.toggleTheme();
    const chosen = await report.theme();
    await report.reload();
    expect(await report.theme()).toBe(chosen);
  });
});

test.describe("M11: the theme button must reflect the effective theme, not just an attribute", () => {
  test.use({ colorScheme: "dark" });

  test("the first click under an OS dark preference actually switches to light", async () => {
    // M11 (DESIGN.md §5), fixed on purpose: legacy's template shipped no data-theme attribute, so
    // the first click computed "next" off that absent attribute and set it explicitly — visually
    // a no-op — and only a second click reached light.
    await report.goto(FIXTURES.mini);
    expect(await report.theme()).toBe("dark"); // OS preference, no stored/explicit theme yet
    await report.toggleTheme();
    expect(await report.theme()).toBe("light");
  });
});

test.describe("glossary", () => {
  test("opens via its button, shows the verdict and signal reference, and closes via its own button", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.isGlossaryOpen()).toBe(false);
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    // innerText reflects CSS text-transform (the heading is upper-cased by report.css), so this
    // matches case-insensitively rather than asserting a particular casing.
    expect(await report.glossaryText()).toMatch(/nine verdicts/i);
    await report.closeGlossaryButton();
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});

test.describe("M2: S10 belongs in the glossary like every other signal", () => {
  test("the glossary lists S10 (the vocabulary is a fixed constant, independent of the fixture)", async () => {
    // M2 (DESIGN.md §5), fixed on purpose: legacy's glossary only had definitions for S1..S9 — S10
    // (NotCheckedRule) is emitted by the analyzer but was never given a name or a definition.
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    expect(await report.glossaryText()).toContain("S10");
  });
});

test.describe("M28: the glossary must stay reachable when showModal() is not allowed", () => {
  test.beforeEach(async ({ page }) => {
    // A sandboxed frame without allow-modals throws from showModal() even though the method
    // exists (history.md item 5); this reproduces that without standing up a real iframe.
    await page.addInitScript(() => {
      try {
        HTMLDialogElement.prototype.showModal = () => {
          throw new Error("modals are not allowed here");
        };
      } catch {
        // best-effort in whichever engine is running this project
      }
    });
  });

  test("the fallback glossary is still reachable and stays in view", async () => {
    // M28 (DESIGN.md §5), fixed on purpose: legacy's fallback set a plain open attribute with no
    // positioning of its own, so the UA default rendered it in normal flow after the footer.
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    expect(await report.glossaryPosition()).toBe("fixed");
  });

  test("it can still be closed the same way, whichever mode it opened in", async () => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    await report.pressEscape();
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});
