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

  test("PD-GLOSSARY-2: opens with the nine verdicts visible and the other sections collapsed", async ({
    page,
  }) => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });

    // "The nine verdicts" is not behind a <summary> at all — it is always in view.
    await expect(dialog.getByRole("heading", { name: "The nine verdicts" })).toBeVisible();

    // The other four sections are each a closed <details>: the <summary> is there to click and is
    // always visible, but its content is not part of what a sighted reader sees without opening it.
    const titles = [
      "The signals",
      "One number for the lock: libyears",
      "How a priority is reached",
      "Keys and search",
    ];
    for (const title of titles) {
      const summary = dialog.locator("summary", { hasText: title });
      await expect(summary).toBeVisible();
      const details = summary.locator("xpath=ancestor::details[1]");
      expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    }
  });
});

test.describe("M2: S10 belongs in the glossary like every other signal", () => {
  test("the glossary lists S10 (the vocabulary is a fixed constant, independent of the fixture)", async () => {
    // M2 (DESIGN.md §5), fixed on purpose: legacy's glossary only had definitions for S1..S9 — S10
    // (NotCheckedRule) is emitted by the analyzer but was never given a name or a definition.
    //
    // PD-GLOSSARY-2: S10 now sits inside "The signals", a collapsed <details> — this still passes
    // unchanged because textContent (glossaryText's source) reads a closed <details>'s content the
    // same as an open one; only layout hides it, not the DOM.
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    expect(await report.glossaryText()).toContain("S10");
  });
});

test.describe("PD-GLOSSARY-1: the search hint", () => {
  test("is one short line pointing at the glossary, not the old keys/search-syntax paragraph", async ({
    page,
  }) => {
    // Scoped to `.hint` itself: the glossary's own "Keys and search" section (PD-GLOSSARY-2) now
    // carries the address-bar note and the `verdict:`/`priority:`/... key list verbatim, so a
    // page-wide text search for them would still find a match there even with the glossary closed
    // (a <dialog> without `open` stays in the DOM). The hint paragraph is the one thing under test.
    await report.goto(FIXTURES.mini);
    const hint = page.locator(".hint");
    await expect(hint).toHaveText(/press \? for keys and search syntax/i);
    await expect(hint).not.toContainText("address bar is a link");
    await expect(hint).not.toContainText("priority:");
  });
});

test.describe("PD-GLOSSARY-4/5: a verdict pill's popover", () => {
  test("clicking a pill in a Findings row opens its definition and does not toggle the row's detail", async () => {
    await report.goto(FIXTURES.mini);
    // Whatever the detail pane holds on load (the wide-screen boot pick, DESIGN.md §5) must stay
    // exactly as it is — the click below must neither open nor close it, whichever package it names.
    const before = await report.detail();
    expect(await report.isPillPopoverOpen()).toBe(false);

    await report.clickVerdictPill("vendor/transitive", "abandoned");

    expect(await report.isPillPopoverOpen()).toBe(true);
    expect(await report.pillPopoverText()).toMatch(/composer repository marks it abandoned/i);
    expect(await report.detail()).toEqual(before);
  });

  test('"In the glossary" opens the glossary', async () => {
    await report.goto(FIXTURES.mini);
    await report.clickVerdictPill("vendor/transitive", "abandoned");
    expect(await report.isPillPopoverOpen()).toBe(true);

    await report.openGlossaryFromPillPopover();

    expect(await report.isGlossaryOpen()).toBe(true);
  });

  test("Escape closes the popover without closing an already-open detail (PD-GLOSSARY-6)", async () => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    expect((await report.detail()).open).toBe(true);

    // The row's own pill, not the detail's — both exist at once in the wide layout (DESIGN.md §8).
    await report.clickVerdictPill("vendor/transitive", "abandoned");
    expect(await report.isPillPopoverOpen()).toBe(true);

    await report.pressEscape();

    expect(await report.isPillPopoverOpen()).toBe(false);
    expect((await report.detail()).open).toBe(true);
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
