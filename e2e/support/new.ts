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

  /** The name starts with the key (a count may follow it, see LEDGER_LABEL). Anchored rather than a
   *  substring, because rail buttons carry the same vocabulary inside longer names: the S1 signal
   *  filter reads "S1 marked abandoned", which a bare "abandoned" would also match. */
  private ledgerLocator(_group: LedgerGroup, key: string): Locator {
    return this.page.getByRole("button", {
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

  async priorityLedgerTooltip(): Promise<string | null> {
    return this.page
      .getByText(/priority of the .* flagged packages/i)
      .first()
      .getAttribute("title");
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

  /** `getByRole('button', { name: /what these words mean/i })` — the legend opener keeps the
   *  legacy copy as its accessible name, so the same text works as the locator across renderers. */
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

/** See the identical helper in `legacy.ts`: same-document hash-only navigations never re-run a
 *  page's boot script, so every fresh load bounces through `about:blank` first. */
async function freshNavigate(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}
