/**
 * The `ReportPage` contract implemented over the Preact rewrite, using only accessible locators
 * (`getByRole`/`getByLabel`/`getByText`) — no class names, no ids, no `data-*` attributes. Every
 * locator choice below is a decision about what role and accessible name a piece of the page must
 * expose, documented at the point it is made. A locator this file cannot find is a bug in the UI,
 * not a licence to fall back to a CSS selector here — fix the markup, not this file.
 */
import type { Locator, Page } from "@playwright/test";
import type { DetailSnapshot, LedgerGroup, RailGroup, ReportPage, SortState, ViewName } from "./report";
import { pageUrl, type FixtureName } from "./pages";

/** The tab's accessible name (`role=tab`). A badge count appended after the label is fine — every
 *  match below is substring, not exact — but the label text itself has to be this. */
const VIEW_LABEL: Readonly<Record<ViewName, string>> = {
  findings: "Findings",
  advisories: "Advisories",
  packages: "All packages",
  radius: "Blast radius",
  run: "Run data",
};

/** `prio`/`verdict`/`sev` ledger buttons: the accessible name is the key itself (the vocabulary
 *  word lockrot already prints — "critical", "abandoned", "unrated" — a count may follow it). */
const LEDGER_LABEL = (key: string): string => key;

/** Rail button accessible names, one map per group, matching the words the legacy rail already
 *  shows a sighted user (`report.js:334-390`) — a rewrite changing the wording changes this map. */
const RAIL_LABEL: Readonly<Record<RailGroup, Readonly<Record<string, string>>>> = {
  scope: { direct: "Direct", transitive: "Transitive", prod: "require", dev: "require-dev" },
  fix: { branch: "A release on this branch", move: "Moving to another branch", none: "No fix listed" },
  since: { new: "New", worsened: "Worsened", known: "Already accepted" },
  // Signal ids (S1..S10) have no fixed word map: the accessible name is expected to contain the id
  // itself (e.g. "S7"), same as the legacy rail's `<span class="mono">S7</span>`.
  signal: {},
};

/** Packages-table column header accessible names, matching the legacy header text (`report.js:581-584`). */
const SORT_LABEL: Readonly<Record<string, string>> = {
  package: "Package",
  version: "Version",
  libyears: "Libyears",
  verdict: "Verdict",
  priority: "Priority",
  reached: "Reached",
  signals: "Signals",
  data: "Data as of",
};

function railLabel(group: RailGroup, key: string): string {
  return RAIL_LABEL[group][key] ?? key;
}

export class NewReportPage implements ReportPage {
  constructor(private readonly page: Page) {}

  async goto(fixture: FixtureName): Promise<void> {
    await freshNavigate(this.page, pageUrl(fixture));
  }

  async gotoWithHash(fixture: FixtureName, hash: string): Promise<void> {
    const base = pageUrl(fixture);
    const fragment = hash.startsWith("#") ? hash : "#" + hash;
    await freshNavigate(this.page, base + fragment);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  url(): string {
    return this.page.url();
  }

  async hash(): Promise<string> {
    return this.page.evaluate(() => location.hash);
  }

  async setLocationHash(fragment: string): Promise<void> {
    const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
    await this.page.evaluate((v) => {
      location.hash = v;
    }, value);
  }

  /** `role=tab` — the ARIA tabs pattern, so `aria-selected` and keyboard tab-list semantics are
   *  the assistive-tech contract instead of a bespoke `.tab` class. */
  private tabLocator(name: ViewName): Locator {
    return this.page.getByRole("tab", { name: VIEW_LABEL[name] });
  }

  async tab(name: ViewName): Promise<void> {
    await this.tabLocator(name).click();
  }

  async activeTab(): Promise<ViewName | null> {
    const selected = this.page.getByRole("tab", { selected: true });
    if ((await selected.count()) === 0) return null;
    const text = (await selected.first().textContent()) ?? "";
    const match = (Object.keys(VIEW_LABEL) as ViewName[]).find((view) => text.includes(VIEW_LABEL[view]));

    return match ?? null;
  }

  async tabCount(name: ViewName): Promise<string> {
    const text = (await this.tabLocator(name).textContent()) ?? "";

    return text.replace(VIEW_LABEL[name], "").trim();
  }

  /** `role=searchbox` (native `<input type="search">` already gets this role; an accessible name
   *  via `aria-label`/`<label>` is still required so `getByRole` alone can find it). */
  private searchLocator(): Locator {
    return this.page.getByRole("searchbox");
  }

  async search(text: string): Promise<void> {
    await this.searchLocator().fill(text);
  }

  async searchValue(): Promise<string> {
    return this.searchLocator().inputValue();
  }

  async focusSearch(): Promise<void> {
    await this.searchLocator().click();
  }

  async isSearchFocused(): Promise<boolean> {
    return this.searchLocator().evaluate((el) => el === document.activeElement);
  }

  /** A named action, not an icon: the search bar's own "Clear" button. Matched exactly, because the
   *  empty state offers a second action with the same effect ("Clear filters", as the legacy page
   *  does), and a substring match would find both whenever a filter empties the list. */
  async clear(): Promise<void> {
    await this.page.getByRole("button", { name: "Clear", exact: true }).click();
  }

  /** The status line is a live region (`role=status`, matching legacy's `role="status"`); its
   *  accessible name/content is read directly rather than through a specific id. */
  async countLine(): Promise<string | null> {
    const status = this.page.getByRole("status");
    if ((await status.count()) === 0) return null;
    const text = (await status.textContent())?.trim();

    return text ? text : null;
  }

  async emptyMessage(): Promise<string | null> {
    // No fixed role for prose; a short, stable text probe is the accessible equivalent of the
    // legacy `.empty` class here — the exact copy is expected to differ (DESIGN.md M20), only its
    // presence is asked for by callers of this method.
    const empty = this.page.getByText(/nothing (was flagged|matches)/i);
    if ((await empty.count()) === 0) return null;

    return collapse((await empty.first().textContent()) ?? "");
  }

  /**
   * Rows/cards are expected to carry `role=row` (the Packages table), `role=option` (a selectable
   * Findings/Radius entry) or `role=listitem`, each with an accessible name that IS the package
   * name (version/tags are presentation, not folded into the name) — this is the concrete
   * assistive-tech contract `rows()` is written against, not a guess at what exists today.
   */
  async rows(): Promise<string[]> {
    const candidates = this.page
      .getByRole("row")
      .or(this.page.getByRole("option"))
      .or(this.page.getByRole("listitem"));
    const count = await candidates.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = candidates.nth(i);
      // Table header rows are `role=row` too; skip anything acting as a column header.
      if ((await el.getByRole("columnheader").count()) > 0) continue;
      const name = (await el.getAttribute("aria-label")) ?? (await el.textContent());
      if (name) names.push(name.trim());
    }

    return names;
  }

  private pkgLocator(name: string): Locator {
    return this.page
      .getByRole("row", { name, exact: true })
      .or(this.page.getByRole("option", { name, exact: true }))
      .or(this.page.getByRole("listitem", { name, exact: true }))
      .first();
  }

  async clickPackage(name: string): Promise<void> {
    await this.pkgLocator(name).click();
  }

  async openPackage(name: string): Promise<void> {
    const before = await this.detail();
    if (before.open && before.name === name) return;
    await this.clickPackage(name);
    const after = await this.detail();
    if (!(after.open && after.name === name)) {
      await this.clickPackage(name);
    }
  }

  /** The detail pane's Close action, scoped to the open region so it never matches the glossary's
   *  own Close button. */
  async closeDetail(): Promise<void> {
    await this.detailRegion().getByRole("button", { name: "Close" }).click();
  }

  /** `role=region` (or `complementary`, the legacy detail aside's ARIA equivalent) named after the
   *  open package — the accessible-name contract `detail()`/`closeDetail()` rely on. */
  private detailRegion(): Locator {
    return this.page.getByRole("region").or(this.page.getByRole("complementary"));
  }

  async detail(): Promise<DetailSnapshot> {
    const region = this.detailRegion();
    if ((await region.count()) === 0) return { open: false, name: null, text: "" };
    const name = await region.first().getAttribute("aria-label");
    const text = collapse((await region.first().textContent()) ?? "");

    return { open: true, name, text };
  }

  async clearFiltersFromDetail(): Promise<void> {
    await this.detailRegion().getByRole("button", { name: "Clear filters" }).click();
  }

  /** a11y/regression review: "Clear filters" used to unmount itself on click (`hidden` flips false
   *  in the same dispatch), dropping keyboard focus to `<body>`. It now moves focus to the panel's
   *  own Close button, which never unmounts — checked by name rather than by counting `document
   *  .activeElement === document.body`, since a body-focused page and a page focused on some other,
   *  unrelated control would both fail that weaker check the same way. */
  async isFocusOnDetailClose(): Promise<boolean> {
    return this.detailRegion()
      .getByRole("button", { name: "Close" })
      .evaluate((el) => el === document.activeElement);
  }

  async rowFocusable(name: string): Promise<boolean> {
    return this.pkgLocator(name).evaluate((el) => (el as HTMLElement).tabIndex >= 0);
  }

  /** `aria-selected` (M6: the new packages table marks the open row selected, unlike legacy). */
  async rowSelected(name: string): Promise<boolean> {
    return (await this.pkgLocator(name).getAttribute("aria-selected")) === "true";
  }

  async focusRow(name: string): Promise<void> {
    await this.pkgLocator(name).focus();
  }

  async focusedRowName(): Promise<string | null> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      const role = active.getAttribute("role");
      if (role === "row" || role === "option" || role === "listitem") {
        return active.getAttribute("aria-label") ?? active.textContent.trim();
      }

      return null;
    });
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }

  async focusLinkInRow(name: string): Promise<void> {
    await this.pkgLocator(name).getByRole("link").first().focus();
  }

  async rowSignalIds(name: string): Promise<string[]> {
    const links = await this.pkgLocator(name).getByRole("link").all();
    return Promise.all(links.map((link) => link.innerText()));
  }

  async rowMoreSignalsText(name: string): Promise<string | null> {
    const note = this.pkgLocator(name).getByText(/more signals?, open the package/);
    return (await note.count()) > 0 ? (await note.first().innerText()).trim() : null;
  }

  /** Whether the row's "+N more…" note is currently on screen — `Locator#isVisible()`, not
   *  `innerText()` (`rowMoreSignalsText`'s own check): a hidden element's `innerText` getter falls
   *  back to its descendant text per the HTML spec, so it would keep reading the note's words even
   *  once print.css (PD-ROWS-1, DESIGN.md §5) hides it. */
  async rowMoreSignalsVisible(name: string): Promise<boolean> {
    const note = this.pkgLocator(name).getByText(/more signals?, open the package/);
    return (await note.count()) > 0 && (await note.first().isVisible());
  }

  async rowAgeScaleLabel(name: string): Promise<string | null> {
    const scale = this.pkgLocator(name).getByRole("img");
    return (await scale.count()) > 0 ? scale.first().getAttribute("aria-label") : null;
  }

  /** The age scale's decorative parts (`AgeScale.tsx`) carry no accessible role of their own — the
   *  whole thing is one `role=img` — so they're read by position from that element (`children[0]`
   *  the track, its own two ticks and dot inside that), the same structural approach
   *  `ledgerSegmentPrintStyle` below already uses for the ledger's first bar segment, rather than by
   *  class. a11y review (PD-ROWS-2, DESIGN.md §5): forced-colors mode used to paint the track, both
   *  ticks and the dot the same Canvas colour as the page itself; each boolean here is whether that
   *  part's own computed colour still differs from it. */
  async ageScaleForcedColorsVisible(name: string): Promise<{ track: boolean; tick: boolean; dot: boolean }> {
    return this.pkgLocator(name)
      .getByRole("img")
      .first()
      .evaluate((scale) => {
        const track = scale.children[0];
        const tick = track?.children[0];
        const dot = track?.children[2];
        if (
          !(track instanceof HTMLElement) ||
          !(tick instanceof HTMLElement) ||
          !(dot instanceof HTMLElement)
        ) {
          throw new Error("age scale is missing a track, tick or dot");
        }
        const pageBg = getComputedStyle(document.body).backgroundColor;
        const trackColor = getComputedStyle(track, "::before").backgroundColor;
        const tickColor = getComputedStyle(tick).backgroundColor;
        const dotStyle = getComputedStyle(dot);
        const distinct = (c: string) => c !== pageBg && c !== "rgba(0, 0, 0, 0)" && c !== "";
        // The dot's shape carries the zone (views.css): a hollow/dashed ring paints its border, a
        // filled dot (at or above `high`) its background, with the border deliberately left the same
        // colour as the page there to separate it from the tick beside it — either one, on its own,
        // says the dot is drawn at all.
        const dotVisible = distinct(dotStyle.borderTopColor) || distinct(dotStyle.backgroundColor);
        return { track: distinct(trackColor), tick: distinct(tickColor), dot: dotVisible };
      });
  }

  /** The name starts with the key (a count may follow it, see LEDGER_LABEL). Anchored rather than a
   *  substring, because rail buttons carry the same vocabulary inside longer names: the S1 signal
   *  filter reads "S1 marked abandoned", which a bare "abandoned" would also match. Scoped to the
   *  `role=group, name="Ledger"` strip (Ledger.tsx) since PD-GLOSSARY-4/5 gave a verdict pill the
   *  bare word itself as its own accessible name, both in a row and in the open detail — without
   *  this scope, filtering by "abandoned" would resolve to all three at once. */
  private ledgerLocator(_group: LedgerGroup, key: string): Locator {
    return this.page.getByRole("group", { name: "Ledger" }).getByRole("button", {
      name: new RegExp(`^${escapeRegExp(LEDGER_LABEL(key))}(\\s|$)`, "i"),
    });
  }

  async ledgerButton(group: LedgerGroup, key: string): Promise<void> {
    await this.ledgerLocator(group, key).click();
  }

  async ledgerButtonPressed(group: LedgerGroup, key: string): Promise<boolean | null> {
    const el = this.ledgerLocator(group, key);
    if ((await el.count()) === 0) return null;
    const has = await el.evaluate((node) => node.hasAttribute("aria-pressed"));

    return has ? (await el.getAttribute("aria-pressed")) === "true" : null;
  }

  async ledgerButtonTitle(group: LedgerGroup, key: string): Promise<string | null> {
    return this.ledgerLocator(group, key).getAttribute("title");
  }

  /** The legend chip's own colours, read the same structural way `ageScaleForcedColorsVisible`
   *  reads the age scale's: by position (`children[0]`, the swatch), not by class. a11y review
   *  (PD-LEDGER-2, DESIGN.md §5): forced-colors mode used to flatten a pressed chip and an unpressed
   *  one to the same Canvas-on-Canvas look, and erase the swatch the same way. */
  async legendButtonForcedColorsStyle(
    group: LedgerGroup,
    key: string,
  ): Promise<{ backgroundColor: string; borderColor: string; swatchBackgroundColor: string }> {
    return this.ledgerLocator(group, key).evaluate((el) => {
      const swatch = el.children[0];
      if (!(swatch instanceof HTMLElement)) throw new Error("legend chip has no swatch");
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        swatchBackgroundColor: getComputedStyle(swatch).backgroundColor,
      };
    });
  }

  async priorityLedgerTooltip(): Promise<string | null> {
    return this.page
      .getByText(/priority of the .* flagged packages/i)
      .first()
      .getAttribute("title");
  }

  async hasSummaryLine(text: string): Promise<boolean> {
    // Visible, not just present: the phone fold's <summary> is shown closed by default, and this
    // is the assertion that a reader sees the line without opening it — a collapsed <details>'s
    // non-summary content would fail the same check.
    const line = this.page.getByText(text);
    return (await line.count()) > 0 && (await line.first().isVisible());
  }

  /** The accessible name the gate fact's button always starts with (Header.tsx#gateFact) —
   *  fixed vocabulary, same convention as VIEW_LABEL/RAIL_LABEL above. */
  private gateFactButton(): Locator {
    return this.page.getByRole("button", { name: /^(no gate|gate:)/i });
  }

  /** The sentence the popover's own text always starts with (Header.tsx#gateFact); found by that
   *  text, not by the popover's plumbing (`popover="auto"`, an id relationship) which is
   *  Header.tsx's implementation detail, not this contract's. */
  private gateFactPopover(): Locator {
    return this.page.getByText(/^This run was given --fail-on=/);
  }

  async gateFactLabel(): Promise<string | null> {
    const button = this.gateFactButton();
    if ((await button.count()) === 0) return null;

    return collapse((await button.textContent()) ?? "");
  }

  async openGateFact(): Promise<void> {
    await this.gateFactButton().click();
  }

  async isGateFactOpen(): Promise<boolean> {
    return this.gateFactPopover().isVisible();
  }

  async gateFactPopoverText(): Promise<string> {
    return collapse((await this.gateFactPopover().textContent()) ?? "");
  }

  private railLocator(group: RailGroup, key: string): Locator {
    return this.page.getByRole("button", { name: railLabel(group, key) });
  }

  async railOption(group: RailGroup, key: string): Promise<void> {
    await this.railLocator(group, key).click();
  }

  async railOptionPressed(group: RailGroup, key: string): Promise<boolean | null> {
    const el = this.railLocator(group, key);
    if ((await el.count()) === 0) return null;
    const has = await el.evaluate((node) => node.hasAttribute("aria-pressed"));

    return has ? (await el.getAttribute("aria-pressed")) === "true" : null;
  }

  private columnHeader(key: string): Locator {
    return this.page.getByRole("columnheader", { name: SORT_LABEL[key] ?? key });
  }

  async sortBy(key: string): Promise<void> {
    const header = this.columnHeader(key);
    const button = header.getByRole("button");
    if ((await button.count()) > 0) await button.click();
    else await header.click();
  }

  async sortState(): Promise<SortState | null> {
    const headers = this.page.getByRole("columnheader");
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      const header = headers.nth(i);
      const sort = await header.getAttribute("aria-sort");
      if (sort && sort !== "none") {
        const name = (await header.textContent()) ?? "";
        const key = Object.keys(SORT_LABEL).find((k) => name.includes(SORT_LABEL[k] ?? "\u0000")) ?? null;
        if (key) return { key, desc: sort === "descending" };
      }
    }

    return null;
  }

  /** No fixed role for a card; found by its heading text and read as whatever container element
   *  wraps that heading — the accessible contract this asks for is just that the stated count and
   *  the `data-open`-equivalent openable rows agree, not a specific markup shape. */
  async radiusCard(parent: string): Promise<{ statedCount: number | null; listedCount: number } | null> {
    return this.page.evaluate((name) => {
      const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,[role=heading]")).find(
        (h) => h.textContent === name,
      );
      const card =
        heading?.closest("article, section, [role=region], [role=listitem]") ?? heading?.parentElement;
      if (!card) return null;
      const text = card.textContent;
      const match = /(\d+)\s+flagged/.exec(text);
      const statedCount = match ? Number(match[1]) : null;
      // The openable entries are the rows `rows()` reads (list items or options, one per package);
      // a card drawn with bare buttons or links instead is counted by those.
      const rows = card.querySelectorAll('li, [role="listitem"], [role="option"]').length;
      const listedCount = rows > 0 ? rows : card.querySelectorAll('[role="button"], a, button').length;

      return { statedCount, listedCount };
    }, parent);
  }

  /** `getByRole('button', { name: /what these words mean/i })` — the locator uses the page's
   *  accessible name, which keeps the legacy copy on purpose. */
  async openGlossary(): Promise<void> {
    await this.page.getByRole("button", { name: /what these words mean/i }).click();
  }

  private glossaryLocator(): Locator {
    return this.page.getByRole("dialog", { name: /what these words mean/i });
  }

  async closeGlossaryButton(): Promise<void> {
    await this.glossaryLocator().getByRole("button", { name: "Close" }).click();
  }

  async isGlossaryOpen(): Promise<boolean> {
    return (await this.glossaryLocator().count()) > 0 && (await this.glossaryLocator().isVisible());
  }

  async glossaryText(): Promise<string> {
    return collapse((await this.glossaryLocator().textContent()) ?? "");
  }

  async glossaryPosition(): Promise<string> {
    return this.glossaryLocator().evaluate((el) => getComputedStyle(el).position);
  }

  /** PD-GLOSSARY-4/5: the verdict word inside a row (`pkgLocator`) is a `<button>`, its accessible
   *  name the verdict itself, same case-insensitive matching every role lookup here uses. */
  async clickVerdictPill(pkg: string, verdict: string): Promise<void> {
    await this.pkgLocator(pkg).getByRole("button", { name: verdict }).click();
  }

  /** There is no accessible role for "the currently open popover" to query by name — `:popover-open`
   *  is the platform's own answer to "which one, if any", the same way `glossaryPosition()` above
   *  reads a computed style rather than a role. At most one `popover="auto"` element is showing at
   *  once, so this never has to pick among several. */
  async isPillPopoverOpen(): Promise<boolean> {
    return this.page.evaluate(() => document.querySelector(":popover-open") !== null);
  }

  async pillPopoverText(): Promise<string> {
    return collapse(
      await this.page.evaluate(() => document.querySelector(":popover-open")?.textContent ?? ""),
    );
  }

  /** visual review (DESIGN.md §5, PD-GLOSSARY-4): the popover used to dim nothing behind it, so a
   *  fixed, viewport-centred card could land on the very row that opened it with no cue it was an
   *  overlay. `::backdrop` is a pseudo-element, unreachable by role or by `textContent`, so this
   *  reads its computed style the same way `:popover-open` above is read — off the platform, not a
   *  class. */
  async pillPopoverBackdropVisible(): Promise<boolean> {
    return this.page.evaluate(() => {
      const popover = document.querySelector(":popover-open");
      if (popover === null) return false;
      const backdrop = getComputedStyle(popover, "::backdrop").backgroundColor;
      return backdrop !== "rgba(0, 0, 0, 0)" && backdrop !== "";
    });
  }

  async openGlossaryFromPillPopover(): Promise<void> {
    await this.page.getByRole("button", { name: /in the glossary/i }).click();
  }

  async glossaryFocusedEntry(): Promise<{ text: string | null; inView: boolean } | null> {
    const dialog = this.glossaryLocator();
    if ((await dialog.count()) === 0) return null;

    return dialog.evaluate((dialogEl) => {
      const active = document.activeElement;
      if (!active || !dialogEl.contains(active)) return null;
      const rect = active.getBoundingClientRect();
      const box = dialogEl.getBoundingClientRect();
      const inView = rect.top >= box.top && rect.bottom <= box.bottom;
      const text = active.textContent;

      return { text: typeof text === "string" ? text.trim() : null, inView };
    });
  }

  async isPillFocused(pkg: string, verdict: string): Promise<boolean> {
    return this.pkgLocator(pkg)
      .getByRole("button", { name: verdict })
      .evaluate((el) => el === document.activeElement);
  }

  async theme(): Promise<"dark" | "light"> {
    return this.page.evaluate(() => {
      const attribute = document.documentElement.getAttribute("data-theme");
      if (attribute === "light") return "light";
      if (attribute === "dark") return "dark";

      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });
  }

  /** The theme control's accessible name is the action it performs, same convention as legacy
   *  ("Dark"/"Light" — press to switch to that theme), so it is found the same way. */
  async toggleTheme(): Promise<void> {
    await this.page.getByRole("button", { name: /^(dark|light)$/i }).click();
  }

  async themeStorageValue(): Promise<string | null> {
    return this.page.evaluate(() => {
      try {
        return localStorage.getItem("lockrot-theme");
      } catch {
        return null;
      }
    });
  }

  async copyButtonLabel(): Promise<string | null> {
    const button = this.page.getByRole("button", { name: /copy|copied|select it and copy/i });
    if ((await button.count()) === 0) return null;

    return (await button.first().textContent())?.trim() ?? null;
  }

  async clickCopyButton(): Promise<void> {
    await this.page.getByRole("button", { name: /^copy$/i }).click();
  }

  async isScrollLocked(): Promise<boolean> {
    return this.page.evaluate(() => getComputedStyle(document.body).overflow === "hidden");
  }

  async bundleKeys(): Promise<string[]> {
    return this.page.evaluate(() => {
      const node = document.getElementById("lockrot-data");
      const text = node ? node.textContent : null;

      return text ? Object.keys(JSON.parse(text) as Record<string, unknown>) : [];
    });
  }

  async isNavigationVisible(): Promise<boolean> {
    return this.tabLocator("findings").isVisible();
  }

  async ledgerSegmentPrintStyle(): Promise<{ backgroundColor: string; printColorAdjust: string }> {
    const bar = this.page
      .getByRole("group", { name: "Ledger" })
      .getByRole("img", { name: "Verdict distribution" });
    return bar.evaluate((el) => {
      const segment = el.firstElementChild;
      if (!(segment instanceof HTMLElement)) throw new Error("Verdict distribution bar has no segment");
      const style = getComputedStyle(segment);
      return {
        backgroundColor: style.backgroundColor,
        printColorAdjust:
          style.getPropertyValue("-webkit-print-color-adjust") ||
          style.getPropertyValue("print-color-adjust"),
      };
    });
  }

  async pillPrintStyle(
    pkg: string,
    verdict: string,
  ): Promise<{ borderColor: string; printColorAdjust: string }> {
    return this.pkgLocator(pkg)
      .getByRole("button", { name: verdict })
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          borderColor: style.borderColor,
          printColorAdjust:
            style.getPropertyValue("-webkit-print-color-adjust") ||
            style.getPropertyValue("print-color-adjust"),
        };
      });
  }

  async pressSlash(): Promise<void> {
    await this.page.keyboard.press("/");
  }

  async pressQuestion(): Promise<void> {
    await this.page.keyboard.press("?");
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
  }

  async pressJ(): Promise<void> {
    await this.page.keyboard.press("j");
  }

  async pressK(): Promise<void> {
    await this.page.keyboard.press("k");
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Same-document hash-only navigations never re-run a page's boot script, so every fresh load
 *  bounces through `about:blank` first. */
async function freshNavigate(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}
