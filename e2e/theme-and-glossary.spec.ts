import { expect, test } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
});

test.describe("theme toggle and persistence", () => {
  test("toggling flips the effective theme and writes localStorage['lockrot-theme']", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    const before = await report.theme();
    await report.toggleTheme();
    const after = await report.theme();
    expect(after).not.toBe(before);
    expect(await report.themeStorageValue()).toBe(after);
  });

  test("persists across a reload", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.toggleTheme();
    const chosen = await report.theme();
    await report.reload();
    expect(await report.theme()).toBe(chosen);
  });
});

test.describe("M11: the theme button must reflect the effective theme, not just an attribute", () => {
  test.use({ colorScheme: "dark" });

  test("the first click under an OS dark preference actually switches to light", async () => {
    // M11 (DESIGN.md §5), fixed on purpose: the template shipped no data-theme attribute, so the
    // first click computed "next" off that absent attribute and set it explicitly, visually a no-op.
    await report.gotoReport2WithHash("composite", "view=findings");
    expect(await report.theme()).toBe("dark"); // OS preference, no stored/explicit theme yet
    await report.toggleTheme();
    expect(await report.theme()).toBe("light");
  });
});

test.describe("glossary", () => {
  test("opens via its button, shows the verdict reference, and closes via its own button", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    expect(await report.isGlossaryOpen()).toBe(false);
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    // innerText reflects CSS text-transform, so this matches case-insensitively.
    expect(await report.glossaryText()).toMatch(/seven verdicts/i);
    await report.closeGlossaryButton();
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});

test.describe("M2: S10 belongs in the glossary like every other signal", () => {
  test("the glossary lists S10 (the vocabulary is a fixed constant, independent of the case)", async () => {
    // M2 (DESIGN.md §5), fixed on purpose: the glossary used to define S1..S9 only. S10 sits inside
    // "The signals", a collapsed <details>: textContent reads a closed <details> as an open one.
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    expect(await report.glossaryText()).toContain("S10");
  });
});

test.describe("PD-GLOSSARY-9/10: how to accept a package yourself, in its own fold", () => {
  test("names extra.lockrot.ignore and composer.json", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });

    // A step for whoever maintains the lock, not part of what any verdict means, so it has a closed
    // fold of its own at the end.
    await dialog.locator("summary", { hasText: /accepting a package/i }).click();
    const note = dialog.locator(".glossary-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("extra.lockrot.ignore");
    await expect(note).toContainText("composer.json");
  });
});

test.describe("PD-GLOSSARY-1: the search hint", () => {
  test("is one short line pointing at the glossary, not the old keys/search-syntax paragraph", async ({
    page,
  }) => {
    // Scoped to `.hint` itself: the glossary's own "Keys and search" section carries the address-bar
    // note and the key list verbatim, so a page-wide text search would find a match there even with
    // the glossary closed (a <dialog> without `open` stays in the DOM).
    await report.gotoReport2WithHash("composite", "view=findings");
    const hint = page.locator(".hint");
    await expect(hint).toHaveText(/press \? for keys and search syntax/i);
    await expect(hint).not.toContainText("address bar is a link");
    await expect(hint).not.toContainText("priority:");
  });
});

test.describe("M28: the glossary must stay reachable when showModal() is not allowed", () => {
  test.beforeEach(async ({ page }) => {
    // A sandboxed frame without allow-modals throws from showModal() even though the method
    // exists; this reproduces that without standing up a real iframe.
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
    // M28 (DESIGN.md §5), fixed on purpose: the fallback set a plain open attribute with no
    // positioning of its own, so the UA default rendered it in normal flow after the footer.
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    expect(await report.glossaryPosition()).toBe("fixed");
  });

  test("it can still be closed the same way, whichever mode it opened in", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    await report.pressEscape();
    expect(await report.isGlossaryOpen()).toBe(false);
  });
});

test.describe("report-2: the theme and the glossary", () => {
  test("the theme toggle flips and persists on a report-2 page", async () => {
    await report.gotoReport2WithHash("composite", "view=findings");
    const before = await report.theme();
    await report.toggleTheme();
    const after = await report.theme();
    expect(after).not.toBe(before);
    await report.reload();
    expect(await report.theme()).toBe(after);
  });

  test("opens with the seven verdicts in view and the seven flags open, the rest folded", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });
    await expect(dialog.getByRole("heading", { name: "The seven verdicts" })).toBeVisible();
    await expect(dialog.locator("dt[data-term]")).toHaveText(
      // run.verdicts, then run.flag_ids, each with its count when it has one.
      [
        "critical 3",
        "high 2",
        "medium",
        "low 2",
        "unknown",
        "finished",
        "ok",
        "abandoned 1",
        "silent",
        "pinned 1",
        "left-behind 1",
        "old-promise 3",
        "stale 2",
        "vulnerable 4",
      ],
    );
    const folded = ["The signals", "One number for the lock: libyears", "Keys and search"];
    for (const title of folded) {
      const details = dialog.locator("summary", { hasText: title }).locator("xpath=ancestor::details[1]");
      expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    }
  });

  test("a grade's words take its floor from the model and the flags this run's thresholds", async ({
    page,
  }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });
    await expect(dialog.locator('dt[data-term="critical"] + dd')).toHaveText(
      "A score from 32: a critical finding.",
    );
    await expect(dialog.locator('dt[data-term="silent"] + dd')).toContainText("5 years (release-high-years)");
  });

  test("links the verdicts' anchor on lockrot.dev, and S9 says it raises vulnerable", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    const dialog = page.getByRole("dialog", { name: /what these words mean/i });
    await expect(dialog.getByRole("link", { name: /The verdicts on lockrot.dev/ })).toHaveAttribute(
      "href",
      "https://lockrot.dev/verdicts/#the-nine-verdicts",
    );
    await dialog.locator("summary", { hasText: "The signals" }).click();
    await expect(
      dialog.locator("dt", { hasText: "S9" }).locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("Advisories on the installed version; raises the vulnerable flag.");
  });

  test("'How the score works' closes the glossary on the Run tab's section", async ({ page }) => {
    await report.gotoReport2WithHash("composite", "view=findings");
    await report.openGlossary();
    await page
      .getByRole("dialog", { name: /what these words mean/i })
      .getByRole("link", { name: /How the score works/ })
      .click();
    expect(await report.isGlossaryOpen()).toBe(false);
    await expect.poll(() => report.hash()).toContain("view=run");
  });
});
