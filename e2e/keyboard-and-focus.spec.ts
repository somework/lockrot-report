import { expect, test, type Page } from "@playwright/test";
import { createReportPage, type ReportPage } from "./support/report";
import { report2Url } from "./support/pages";
import { detailSurface } from "./support/report2/detail";

let report: ReportPage;

test.beforeEach(async ({ page }) => {
  report = await createReportPage(page);
  await report.gotoReport2WithHash("composite", "view=findings");
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
    await report.openPackage("symfony/yaml");
    await report.openGlossary();
    expect(await report.isGlossaryOpen()).toBe(true);
    expect((await report.detail()).open).toBe(true);

    await report.pressEscape();
    expect(await report.isGlossaryOpen()).toBe(false);
    expect((await report.detail()).open).toBe(true); // untouched by the same Escape press

    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
  });

  test("leaves the search box for the list's Tab stop when nothing else is open", async () => {
    expect((await report.detail()).open).toBe(false); // nothing opens by itself (PD-ROWS-9)
    await report.focusSearch();
    expect(await report.isSearchFocused()).toBe(true);
    await report.pressEscape();
    expect(await report.isSearchFocused()).toBe(false);
    // PD-ROWS-12: focus used to drop to the page itself, so Tab started again at the top.
    expect(await report.focusedRowName()).toBe((await report.rows())[0]);
  });
});

test.describe("focusedRowName() names a row the way rows() does", () => {
  // CodeRabbit on #6: an Advisories row's accessible name is "package, severity, id", while
  // `rows()` reads its `data-pkg`; the two helpers must agree for any spec that compares them.
  test("an Advisories row is named by its package", async () => {
    await report.tab("advisories");
    const first = (await report.rows())[0];
    if (first === undefined) throw new Error("wallabag's Advisories tab lists no row");
    await report.focusRow(first);
    expect(await report.focusedRowName()).toBe(first);
  });
});

test.describe("j / k walk the visible list and open each package", () => {
  test("j moves forward, k moves back, both open the detail", async () => {
    await report.tab("packages"); // nothing open, so j starts at the first row
    await report.pressJ();
    expect((await report.detail()).name).toBe("twig/twig");
    await report.pressJ();
    expect((await report.detail()).name).toBe("symfony/monolog-bridge");
    await report.pressK();
    expect((await report.detail()).name).toBe("twig/twig");
  });

  test("k at the start of the list clamps to the first item instead of wrapping", async () => {
    await report.tab("packages");
    await report.pressK();
    expect((await report.detail()).name).toBe("twig/twig"); // first item, not the last
    await report.pressK();
    expect((await report.detail()).name).toBe("twig/twig");
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
    await report.focusRow("symfony/yaml");
    await report.pressEnter();
    expect((await report.detail()).name).toBe("symfony/yaml");
    // Re-render replaces the row's DOM node wholesale, so focus does not survive the first Enter —
    // re-focus before the second press rather than assuming keyboard focus persisted across it.
    await report.focusRow("symfony/yaml");
    await report.pressEnter();
    expect((await report.detail()).name).toBe("symfony/yaml");
    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
  });
});

test.describe("M5: Enter on a link inside a row must not hijack the link", () => {
  test("the link is followed, the row's detail does not toggle", async () => {
    // M5 (DESIGN.md §5), fixed on purpose: legacy's keydown handler checked the row before
    // anything about an anchor, so Enter on a focused in-row link toggled the detail instead of
    // following the link.
    // An Advisories row links out to its advisory page.
    await report.tab("advisories");
    expect((await report.detail()).open).toBe(false);
    await report.focusLinkInRow("symfony/yaml");
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
    expect(await report.rowFocusable("symfony/monolog-bridge")).toBe(true);
    expect(await report.rowInTabOrder("symfony/monolog-bridge")).toBe(false);
    await report.openPackage("symfony/monolog-bridge");
    expect(await report.rowSelected("symfony/monolog-bridge")).toBe(true);
    expect(await report.rowInTabOrder("symfony/monolog-bridge")).toBe(true);
  });
});

test.describe("PD-ROWS-11: keyboard focus follows the selection", () => {
  test("after a click, j moves focus with the open package, so Enter opens the row j reached", async () => {
    // M5's mismatch: focus stayed on the clicked row while j moved the open package on, so Enter
    // opened the clicked row again instead of the one on screen as open.
    await report.clickPackage("twig/twig");
    await report.pressJ();
    const reached = (await report.detail()).name;
    expect(reached).not.toBe("twig/twig");
    expect(await report.focusedRowName()).toBe(reached);

    await report.pressEnter();
    expect((await report.detail()).name).toBe(reached);
    await report.pressK();
    expect(await report.focusedRowName()).toBe("twig/twig");
    expect((await report.detail()).name).toBe("twig/twig");
  });

  test("Escape gives focus back to the row, and j continues below it rather than from the top", async () => {
    await report.tab("packages");
    await report.pressJ();
    await report.pressJ();
    expect((await report.detail()).name).toBe("symfony/monolog-bridge");
    await report.pressEscape();
    expect((await report.detail()).open).toBe(false);
    expect(await report.focusedRowName()).toBe("symfony/monolog-bridge");
    expect(await report.rowInTabOrder("symfony/monolog-bridge")).toBe(true);

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

  test("Tab reaches one row of the list, then its own links, then leaves the list for the detail", async ({
    page,
  }) => {
    // Every row, and each Findings row's signal link, used to be a Tab stop of its own.
    const rows = await report.rows();
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(await report.listTabStops())).toEqual(new Set([rows[0]]));

    await report.clickPackage(rows[1] ?? "");
    const stops = await report.listTabStops();
    expect(new Set(stops)).toEqual(new Set([rows[1]]));

    // Firefox gives the detail's scroll container a Tab stop of its own once its content scrolls.
    const inDetail = () => page.evaluate(() => document.activeElement?.closest(".shell-detail") != null);
    let tabs = 0;
    while (!(await inDetail()) && tabs < stops.length + 1) {
      await report.pressTab();
      tabs += 1;
    }
    expect(await inDetail()).toBe(true);
    expect(tabs).toBeLessThanOrEqual(stops.length);
  });
});

// PD-ROWS-12: below the wide layout the detail is a sheet over the whole page. Focus used to stay on
// the row under it, ring and all out of sight (WCAG 2.4.11), with Tab going next to that row's own
// covered links. 999 is the sheet at its widest (the split layout starts at 1000), 390 a phone.
for (const [width, height] of [
  [390, 844],
  [999, 768],
] as const) {
  test.describe(`PD-ROWS-12 at ${width}×${height}: a sheet over the page holds focus`, () => {
    test.use({ viewport: { width, height } });

    test("after a click and j, focus is in the sheet and in sight; Escape hands it to the row j reached", async () => {
      await report.clickPackage("twig/twig");
      expect(await report.isFocusInDetail()).toBe(true);
      await report.pressJ();
      const reached = (await report.detail()).name;
      expect(reached).not.toBe("twig/twig");
      expect(await report.isFocusInDetail()).toBe(true);
      expect(await report.isFocusObscured()).toBe(false);

      // Tab stays in the sheet: the list under it is out of reach.
      await report.pressTab();
      expect(await report.isFocusInDetail()).toBe(true);
      expect(await report.isFocusObscured()).toBe(false);

      await report.pressEscape();
      expect((await report.detail()).open).toBe(false);
      expect(await report.focusedRowName()).toBe(reached);
      // The row glides into view (smooth unless prefers-reduced-motion): wait for it to arrive.
      await expect.poll(() => report.isFocusObscured()).toBe(false);
    });

    test("/ closes the sheet and focuses the search box it covered", async () => {
      await report.pressJ();
      expect((await report.detail()).open).toBe(true);
      await report.pressSlash();
      expect((await report.detail()).open).toBe(false);
      expect(await report.isSearchFocused()).toBe(true);
    });
  });
}

test.describe("PD-ROWS-12: one Tab stop per list, and j walks a package listed twice", () => {
  test("Advisories lists twig/twig under many advisories: one Tab stop, and j reaches each of its rows", async () => {
    await report.tab("advisories");
    const rows = await report.rows();
    expect(rows.slice(0, 3)).toEqual(["twig/twig", "twig/twig", "twig/twig"]);
    // Each row used to be a Tab stop of its own, links and all.
    expect(await report.tabStopRowIndexes()).toEqual([0]);
    expect(new Set(await report.listTabStops())).toEqual(new Set(["twig/twig"]));

    await report.pressJ();
    expect(await report.focusedRowIndex()).toBe(0);
    await report.pressJ();
    expect(await report.focusedRowIndex()).toBe(1);
    await report.pressJ();
    expect(await report.focusedRowIndex()).toBe(2);
    await report.pressEscape();
    expect(await report.focusedRowIndex()).toBe(2);
  });

  test("a second Escape from the search box hands focus to the list, not to the page", async () => {
    await report.tab("packages");
    await report.pressJ();
    await report.pressJ();
    await report.focusSearch();
    await report.pressEscape(); // closes the package, focus stays in the box
    expect(await report.isSearchFocused()).toBe(true);
    await report.pressEscape();
    expect(await report.focusedRowName()).toBe("symfony/monolog-bridge");
  });
});

test.describe("M7: j/k must not open a package that has no row on screen", () => {
  test("Blast radius only ever selects a package it actually lists", async () => {
    // M7 (DESIGN.md §5), fixed on purpose: j/k used to walk every flagged finding while Radius only
    // lists each direct requirement, so j/k could open a package with no row on screen. The
    // composite's symfony/polyfill-intl-idn sits folded under guzzlehttp/guzzle.
    await report.tab("radius");
    expect(await report.rows()).toEqual(["friendsofsymfony/oauth-server-bundle", "guzzlehttp/guzzle"]);
    await report.pressJ();
    expect((await report.detail()).name).toBe("friendsofsymfony/oauth-server-bundle");
    await report.pressJ();
    expect((await report.detail()).name).toBe("guzzlehttp/guzzle");
    await report.pressJ(); // a folded package and one with no row are both off screen
    expect((await report.detail()).name).toBe("guzzlehttp/guzzle");
  });
});

test.describe("M10: j/k must not act while the glossary is open", () => {
  test("selection is untouched behind an open dialog", async () => {
    // M10 (DESIGN.md §5), fixed on purpose: legacy's j/k guard only checked focus against the
    // search box, so keydown still bubbled to the document and moved the selection underneath an
    // open glossary dialog.
    // With twig/twig open, a j that got through would move to symfony/monolog-bridge.
    await report.openPackage("twig/twig");
    await report.openGlossary();
    await report.pressJ();
    expect((await report.detail()).name).toBe("twig/twig");
    expect(await report.hash()).toBe("#view=findings&pkg=twig%2Ftwig");
  });
});

test.describe("shortcuts work on a non-Latin layout (shortcutKey)", () => {
  /** A Russian layout's J key: `key` is the Cyrillic letter, `code` the physical key. Playwright's
   *  own `keyboard.press` always types the US layout, so the event is dispatched by hand. */
  async function pressOnLayout(
    page: import("@playwright/test").Page,
    key: string,
    code: string,
  ): Promise<void> {
    await page.evaluate(
      ([k, c]) => {
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent("keydown", { key: k, code: c, bubbles: true, cancelable: true }),
        );
      },
      [key, code] as const,
    );
  }

  test("the J key on a Russian layout opens the first row, K steps back", async ({ page }) => {
    await pressOnLayout(page, "о", "KeyJ");
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("pkg=");
    const first = await page.evaluate(() => location.hash);
    await pressOnLayout(page, "о", "KeyJ");
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(first);
    await pressOnLayout(page, "л", "KeyK");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(first);
  });

  test("a / typed wherever the layout puts it focuses search", async ({ page }) => {
    await pressOnLayout(page, "/", "Digit7");
    expect(await report.isSearchFocused()).toBe(true);
  });

  // CodeRabbit on #6: the J position prints h on Dvorak, and the Slash position prints - on a German
  // layout; both are keys that reader typed on purpose, so neither may act as a shortcut.
  test("a Latin letter on the J position (Dvorak h) does not move the selection", async ({ page }) => {
    await pressOnLayout(page, "h", "KeyJ");
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => location.hash)).not.toContain("pkg=");
  });

  test("a - on the Slash position (German layout) does not focus search", async ({ page }) => {
    await pressOnLayout(page, "-", "Slash");
    expect(await report.isSearchFocused()).toBe(false);
  });
});

test.describe("report-2: keys on the Findings rows and the detail sheet", () => {
  const sheetName = (page: Page) => detailSurface(page).getAttribute("aria-label");
  const focusedPkg = (page: Page) =>
    page.evaluate(() => document.activeElement?.getAttribute("data-pkg") ?? null);

  test("j opens the first row, j and k walk the list, Escape closes and hands focus back", async ({
    page,
  }) => {
    await page.goto(report2Url("composite") + "#view=findings");
    await expect(detailSurface(page)).toHaveCount(0);

    await page.keyboard.press("j");
    await expect.poll(() => sheetName(page)).toBe("twig/twig");
    await page.keyboard.press("j");
    await expect.poll(() => sheetName(page)).toBe("symfony/monolog-bridge");
    await page.keyboard.press("k");
    await expect.poll(() => sheetName(page)).toBe("twig/twig");

    await page.keyboard.press("Escape");
    await expect(detailSurface(page)).toHaveCount(0);
    await expect.poll(() => focusedPkg(page)).toBe("twig/twig");
  });

  test("Enter on a row opens its sheet and a second Enter keeps it open", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=findings");
    const row = page.getByRole("row", { name: "symfony/yaml", exact: true });

    await row.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => sheetName(page)).toBe("symfony/yaml");
    await row.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => sheetName(page)).toBe("symfony/yaml");
  });

  test("Escape in the shell menu closes the menu first, then the sheet", async ({ page }) => {
    await page.goto(`${report2Url("B")}#pkg=${encodeURIComponent("symfony/monolog-bridge")}`);
    const sheet = detailSurface(page);
    const shell = sheet.getByRole("button", { name: "Shell: POSIX" });

    await shell.click();
    await expect(sheet.getByRole("menuitemradio", { name: /^POSIX/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(sheet.getByRole("menuitemradio", { name: /^cmd\.exe/ })).toBeFocused();
    await page.keyboard.press("Escape");

    await expect(sheet.getByRole("menu")).toBeHidden();
    await expect(shell).toBeFocused();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detailSurface(page)).toHaveCount(0);
  });
});

test.describe("WCAG 2.4.11: the footer never covers the focused filter", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // The walk must bring the footer into view, the moment the rail shrinks: the last assertion says so.
  test("each rail button is on top at its own centre as Tab walks the rail", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=findings");
    const buttons = page.locator(".shell-rail button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    await buttons.first().focus();
    const coveredBy = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const box = active.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit !== null && active.contains(hit) ? null : `${active.textContent} under ${hit?.className}`;
      });

    for (let at = 1; at < count; at += 1) {
      await page.keyboard.press("Tab");
      await expect.poll(coveredBy, { timeout: 2000 }).toBeNull();
    }
    await expect(page.locator("html.footer-in-view")).toHaveCount(1);
  });
});

test.describe("WCAG 2.1.4: the Keyboard shortcuts switch", () => {
  test("survives a reload, and with it off j opens nothing", async ({ page }) => {
    await page.goto(report2Url("composite") + "#view=findings");
    await page.getByRole("button", { name: "What these words mean" }).click();
    const glossary = page.getByRole("dialog");
    await glossary.getByText("Keys and search").click();
    const box = glossary.getByRole("checkbox", { name: "Keyboard shortcuts" });
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.keyboard.press("Escape");

    await page.reload();
    await page.keyboard.press("j");
    await page.getByRole("button", { name: "What these words mean" }).click();
    await page.getByRole("dialog").getByText("Keys and search").click();
    await expect(detailSurface(page)).toHaveCount(0);

    await expect(
      page.getByRole("dialog").getByRole("checkbox", { name: "Keyboard shortcuts" }),
    ).not.toBeChecked();
  });
});
