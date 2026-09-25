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

test.describe("PD-GLOSSARY-8: threshold values in definitions", () => {
  test("leads with what this run set a config key to, the key name kept beside it", async () => {
    // mini.json records all four thresholds: release-warn-years 3, release-high-years 5,
    // push-warn-years 3, push-high-years 5.
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const text = await report.glossaryText();

    expect(text).toContain("3 years (release-warn-years)");
    expect(text).toContain("5 years (release-high-years)");
    expect(text).toContain("5 years (push-high-years)");
    // The key name itself is kept — it is what a reader would set — not replaced by the value.
    expect(text).toContain("release-warn-years");
  });
});

test.describe("PD-GLOSSARY-9: the finished entry names how to accept a package yourself", () => {
  test("names extra.lockrot.ignore and links to the configuration docs' allowlist section", async ({
    page,
  }) => {
    await report.goto(FIXTURES.mini);
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });

    const finishedTerm = dialog.locator('dt[data-term="finished"]');
    await expect(finishedTerm).toBeVisible();
    // The note is a second paragraph *inside* "finished"'s own <dd> (Glossary.tsx#VerdictDefs),
    // not a sibling <dd> of its own — a second top-level <dd> per entry shifts every dt/dd pair
    // after it by one column in the deflist's grid (app.css), breaking the whole grid's track
    // sizing, not only this row's.
    const note = finishedTerm.locator("xpath=following-sibling::dd[1]").locator(".glossary-note");
    await expect(note).toContainText("extra.lockrot.ignore");
    await expect(note).toContainText("composer.json");

    const link = note.getByRole("link", { name: /lockrot\.dev/i });
    await expect(link).toHaveAttribute("href", "https://lockrot.dev/configuration/#the-allowlist");
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
  test("clicking the verdict pill in the detail header opens its definition without closing the detail", async () => {
    // A walk found a reader took a Findings row's own pill for the row's own target and clicked it
    // expecting the package, landing on a definition popover instead. The pill that still opens one
    // lives in the open package's own detail header (`DetailHeader.tsx`) — `clickVerdictPill` opens
    // the package first (a no-op here, since the line above already opened it).
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    expect(await report.isPillPopoverOpen()).toBe(false);

    await report.clickVerdictPill("vendor/transitive", "abandoned");

    expect(await report.isPillPopoverOpen()).toBe(true);
    expect(await report.pillPopoverText()).toMatch(/composer repository marks it abandoned/i);
    expect((await report.detail()).open).toBe(true);
    expect((await report.detail()).name).toBe("vendor/transitive");
  });

  test("a Findings row's own pill is plain: clicking it opens the package, not a popover (PD-GLOSSARY-4/5)", async () => {
    await report.goto(FIXTURES.mini);
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)

    await report.clickPillInFindingsRow("vendor/transitive", "abandoned");

    expect(await report.isPillPopoverOpen()).toBe(false);
    expect((await report.detail()).open).toBe(true);
    expect((await report.detail()).name).toBe("vendor/transitive");

    // The same click contract as the rest of the row: a second click on the now-open package's own
    // pill keeps it open (PD-ROWS-7), rather than closing it or opening a popover.
    await report.clickPillInFindingsRow("vendor/transitive", "abandoned");
    expect(await report.isPillPopoverOpen()).toBe(false);
    expect((await report.detail()).name).toBe("vendor/transitive");
  });

  // visual review: fixed and viewport-centred with no dimming, the popover could land squarely on
  // the very row it opened from on a short page, with no cue it was an overlay rather than broken
  // layout (`mini`'s own list is short enough at 1024/1440px for the centred card to overlap it).
  test("dims the page behind it, like the glossary's own backdrop", async () => {
    await report.goto(FIXTURES.mini);
    expect(await report.pillPopoverBackdropVisible()).toBe(false);

    await report.clickVerdictPill("vendor/transitive", "abandoned");

    expect(await report.pillPopoverBackdropVisible()).toBe(true);
  });

  test('"In the glossary" opens the glossary', async () => {
    await report.goto(FIXTURES.mini);
    await report.clickVerdictPill("vendor/transitive", "abandoned");
    expect(await report.isPillPopoverOpen()).toBe(true);

    await report.openGlossaryFromPillPopover();

    expect(await report.isGlossaryOpen()).toBe(true);
  });

  test('"In the glossary" scrolls to and focuses that verdict\'s own entry (PD-GLOSSARY-7, DESIGN.md §5)', async () => {
    // Before this fix, "In the glossary" opened the dialog scrolled to the top, same as the "?"
    // shortcut — a reader who wanted "abandoned"'s own entry still had to find it among the other
    // eight, and the dialog's default focus landed on Close, not on any entry.
    await report.goto(FIXTURES.mini);
    await report.clickVerdictPill("vendor/transitive", "abandoned");
    await report.openGlossaryFromPillPopover();
    expect(await report.isGlossaryOpen()).toBe(true);

    const focused = await report.glossaryFocusedEntry();
    expect(focused?.text).toMatch(/^abandoned/);
    expect(focused?.inView).toBe(true);
  });

  test('"In the glossary" returns focus to the pill once the glossary closes (a11y review)', async () => {
    // The old behaviour: "In the glossary" carries `popovertargetaction="hide"`, which hides the
    // popover — its own ancestor — in the same click, so by the time the glossary's dialog reads
    // `document.activeElement` to remember who opened it, that button is already gone and focus has
    // already fallen to `<body>`. Closing the glossary then left focus on its own (also now closed)
    // Close button, with the next Tab landing back at the top of the page, instead of on the pill.
    await report.goto(FIXTURES.mini);
    await report.clickVerdictPill("vendor/transitive", "abandoned");
    await report.openGlossaryFromPillPopover();
    expect(await report.isGlossaryOpen()).toBe(true);

    await report.closeGlossaryButton();

    expect(await report.isGlossaryOpen()).toBe(false);
    expect(await report.isPillFocused("vendor/transitive", "abandoned")).toBe(true);
  });

  test("Escape closes the popover without closing an already-open detail (PD-GLOSSARY-6)", async () => {
    await report.goto(FIXTURES.mini);
    await report.openPackage("vendor/transitive");
    expect((await report.detail()).open).toBe(true);

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
