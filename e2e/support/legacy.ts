/**
 * The `ReportPage` contract implemented over `legacy/report.js`/`report.html`'s hand-written DOM —
 * ids, classes and `data-*` attributes exactly as that file emits them. This is the parity
 * reference: the suite is made green here first, so a passing spec proves it tests something
 * (DESIGN.md §6) before it is ever pointed at the rewrite.
 */
import type { Locator, Page } from "@playwright/test";
import type { DetailSnapshot, LedgerGroup, RailGroup, ReportPage, SortState, ViewName } from "./report";
import { pageUrl, type FixtureName, type Renderer } from "./pages";

const TAB_BADGE_ID: Readonly<Record<ViewName, string>> = {
  findings: "tabFindings",
  advisories: "tabAdvisories",
  packages: "tabPackages",
  radius: "tabRadius",
  run: "tabRun",
};

/** Escapes a value for use inside a double-quoted CSS attribute selector. Fixtures used by this
 *  suite carry no package name that needs more than this (see e2e/metacharacter-names.spec.ts). */
function attr(value: string): string {
  return value.replace(/"/g, '\\"');
}

export class LegacyReportPage implements ReportPage {
  readonly renderer: Renderer = "legacy";

  constructor(private readonly page: Page) {}

  async goto(fixture: FixtureName): Promise<void> {
    await freshNavigate(this.page, pageUrl(this.renderer, fixture));
  }

  async gotoWithHash(fixture: FixtureName, hash: string): Promise<void> {
    const base = pageUrl(this.renderer, fixture);
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

  private tabLocator(name: ViewName): Locator {
    return this.page.locator(`.tab[data-view="${name}"]`);
  }

  async tab(name: ViewName): Promise<void> {
    await this.tabLocator(name).click();
  }

  async activeTab(): Promise<ViewName | null> {
    const views: ViewName[] = ["findings", "advisories", "packages", "radius", "run"];
    for (const view of views) {
      const selected = await this.tabLocator(view).getAttribute("aria-selected");
      if (selected === "true") return view;
    }

    return null;
  }

  async tabCount(name: ViewName): Promise<string> {
    return (await this.page.locator(`#${TAB_BADGE_ID[name]}`).textContent())?.trim() ?? "";
  }

  private searchLocator(): Locator {
    return this.page.locator("#q");
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

  async clear(): Promise<void> {
    await this.page.locator("#clearBtn").click();
  }

  async countLine(): Promise<string | null> {
    const line = this.page.locator("#countLine");
    const hidden = await line.evaluate((el) => (el as HTMLElement).hidden);
    if (hidden) return null;

    return (await line.textContent())?.trim() ?? null;
  }

  async emptyMessage(): Promise<string | null> {
    const empty = this.page.locator("#viewRoot .empty");
    if ((await empty.count()) === 0) return null;

    return collapse(await empty.first().innerText());
  }

  async rows(): Promise<string[]> {
    const view = await this.activeTab();

    return this.page.evaluate((v) => {
      function attrValues(selector: string, attrName: string): string[] {
        return Array.from(document.querySelectorAll(selector))
          .map((el) => el.getAttribute(attrName))
          .filter((x): x is string => x !== null);
      }
      if (v === "findings" || v === "packages") {
        return attrValues("#viewRoot .row[data-pkg], #viewRoot tbody tr[data-pkg]", "data-pkg");
      }
      if (v === "advisories") return attrValues("#viewRoot .adv [data-open]", "data-open");
      if (v === "radius") return attrValues("#viewRoot .card [data-open]", "data-open");

      return [];
    }, view);
  }

  /** The element that stands for a package in whatever the current view is: a Findings `.row`, an
   *  All-packages `<tr>`, or a `[data-open]` button in Advisories/Radius/the quiet-package note. */
  private pkgLocator(name: string): Locator {
    const v = attr(name);

    return this.page.locator(`[data-pkg="${v}"], [data-open="${v}"]`).first();
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
      // The click landed on a toggle-style row that was already open on this package and just
      // closed it; a second click opens it again (a `[data-open]` button never needs this, it
      // always opens, so this is a no-op there in practice).
      await this.clickPackage(name);
    }
  }

  async closeDetail(): Promise<void> {
    await this.page.locator("#closeDetail").click();
  }

  async detail(): Promise<DetailSnapshot> {
    const box = this.page.locator("#detail");
    const hidden = await box.evaluate((el) => (el as HTMLElement).hidden);
    if (hidden) return { open: false, name: null, text: "" };
    const name =
      (
        await box
          .locator("h2")
          .first()
          .textContent()
          .catch(() => null)
      )?.trim() ?? null;
    const text = collapse(await box.innerText());

    return { open: true, name, text };
  }

  async rowFocusable(name: string): Promise<boolean> {
    return this.pkgLocator(name).evaluate((el) => (el as HTMLElement).tabIndex >= 0);
  }

  async rowSelected(name: string): Promise<boolean> {
    return this.pkgLocator(name).evaluate(
      (el) => el.getAttribute("aria-current") === "true" || el.getAttribute("aria-selected") === "true",
    );
  }

  async focusRow(name: string): Promise<void> {
    await this.pkgLocator(name).focus();
  }

  async focusedRowName(): Promise<string | null> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      const carrier = active.closest("[data-pkg]");

      return carrier ? carrier.getAttribute("data-pkg") : null;
    });
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }

  async focusLinkInRow(name: string): Promise<void> {
    await this.pkgLocator(name).locator("a").first().focus();
  }

  private ledgerLocator(group: LedgerGroup, key: string): Locator {
    return this.page.locator(`.ledger [data-filter="${group}"][data-key="${attr(key)}"]`);
  }

  async ledgerButton(group: LedgerGroup, key: string): Promise<void> {
    await this.ledgerLocator(group, key).click();
  }

  async ledgerButtonPressed(group: LedgerGroup, key: string): Promise<boolean | null> {
    const loc = this.ledgerLocator(group, key);
    if ((await loc.count()) === 0) return null;

    return loc.evaluate((el) =>
      el.hasAttribute("aria-pressed") ? el.getAttribute("aria-pressed") === "true" : null,
    );
  }

  async priorityLedgerTooltip(): Promise<string | null> {
    return this.page.locator(".ledger .ledger-block").first().locator(".eyebrow").getAttribute("title");
  }

  private railLocator(group: RailGroup, key: string): Locator {
    return this.page.locator(`.rail [data-filter="${group}"][data-key="${attr(key)}"]`);
  }

  async railOption(group: RailGroup, key: string): Promise<void> {
    await this.railLocator(group, key).click();
  }

  async railOptionPressed(group: RailGroup, key: string): Promise<boolean | null> {
    const loc = this.railLocator(group, key);
    if ((await loc.count()) === 0) return null;

    return loc.evaluate((el) =>
      el.hasAttribute("aria-pressed") ? el.getAttribute("aria-pressed") === "true" : null,
    );
  }

  async sortBy(key: string): Promise<void> {
    await this.page.locator(`[data-sort="${attr(key)}"]`).click();
  }

  async sortState(): Promise<SortState | null> {
    return this.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll("#viewRoot th[aria-sort]"));
      for (const th of headers) {
        const sort = th.getAttribute("aria-sort");
        if (sort && sort !== "none") {
          const button = th.querySelector("[data-sort]");
          const key = button?.getAttribute("data-sort") ?? null;
          if (key) return { key, desc: sort === "descending" };
        }
      }

      return null;
    });
  }

  async radiusCard(parent: string): Promise<{ statedCount: number | null; listedCount: number } | null> {
    return this.page.evaluate((name) => {
      const cards = Array.from(document.querySelectorAll("#viewRoot .card"));
      const card = cards.find((c) => c.querySelector("h3")?.textContent === name);
      if (!card) return null;
      const eyebrow = card.querySelector(".eyebrow")?.textContent ?? "";
      const match = /(\d+)/.exec(eyebrow);
      const statedCount = match ? Number(match[1]) : null;
      const listedCount = card.querySelectorAll("[data-open]").length;

      return { statedCount, listedCount };
    }, parent);
  }

  async openGlossary(): Promise<void> {
    await this.page.locator("#legendBtn").click();
  }

  async closeGlossaryButton(): Promise<void> {
    await this.page.locator("#legendClose").click();
  }

  async isGlossaryOpen(): Promise<boolean> {
    return this.page.locator("#legend").evaluate((el) => (el as HTMLDialogElement).open);
  }

  async glossaryText(): Promise<string> {
    return collapse(await this.page.locator("#legend").innerText());
  }

  async glossaryPosition(): Promise<string> {
    return this.page.locator("#legend").evaluate((el) => getComputedStyle(el).position);
  }

  async theme(): Promise<"dark" | "light"> {
    return this.page.evaluate(() => {
      // Mirrors the CSS rule the page ships (DESIGN.md M11): an explicit "light" attribute wins,
      // an explicit "dark" attribute wins, and otherwise the OS preference decides — the attribute
      // can be entirely absent and the page still be visibly dark.
      const attribute = document.documentElement.getAttribute("data-theme");
      if (attribute === "light") return "light";
      if (attribute === "dark") return "dark";

      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });
  }

  async toggleTheme(): Promise<void> {
    await this.page.locator("#themeBtn").click();
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
    const button = this.page.locator("[data-copy]");
    if ((await button.count()) === 0) return null;

    return (await button.textContent())?.trim() ?? null;
  }

  async clickCopyButton(): Promise<void> {
    await this.page.locator("[data-copy]").click();
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

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Navigating from `file://a.html` to `file://a.html#frag` is a same-document, in-page hash change
 * in Chromium — it never re-runs the page's inline boot script, so a test that already loaded the
 * same fixture and then calls `gotoWithHash` for a different fragment would silently observe stale
 * state instead of a real `readHash()` run. Bouncing through `about:blank` first guarantees every
 * `goto`/`gotoWithHash` call is a genuine fresh load, regardless of where the page was before.
 */
async function freshNavigate(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}
