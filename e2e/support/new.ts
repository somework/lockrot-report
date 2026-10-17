/**
 * The `ReportPage` contract implemented over the Preact rewrite, using only accessible locators
 * (`getByRole`/`getByLabel`/`getByText`) — no class names, no ids, no `data-*` attributes. Every
 * locator choice below is a decision about what role and accessible name a piece of the page must
 * expose, documented at the point it is made. A locator this file cannot find is a bug in the UI,
 * not a licence to fall back to a CSS selector here — fix the markup, not this file.
 */
import type { Locator, Page } from "@playwright/test";
import type { DetailSnapshot, RailGroup, ReportPage, RowGeometry, SortState, ViewName } from "./report";
import { pageUrl, report2Url, type FixtureName } from "./pages";
import { decodePng } from "./png";

/** The tab's accessible name (`role=tab`). A badge count appended after the label is fine — every
 *  match below is substring, not exact — but the label text itself has to be this. */
const VIEW_LABEL: Readonly<Record<ViewName, string>> = {
  overview: "Overview",
  findings: "Findings",
  advisories: "Advisories",
  packages: "All packages",
  radius: "Blast radius",
  run: "Run data",
};

/** Rail button accessible names, one map per group, matching the words the legacy rail already
 *  shows a sighted user (`report.js:334-390`) — a rewrite changing the wording changes this map. */
const RAIL_LABEL: Readonly<Record<RailGroup, Readonly<Record<string, string>>>> = {
  scope: { direct: "Direct", transitive: "Transitive", prod: "require", dev: "require-dev" },
  fix: {
    branch: "A release on this branch",
    move: "Moving to another branch",
    none: "No fix listed",
    unchecked: "Fix not checked",
  },
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

  async gotoReport2(caseName: string): Promise<void> {
    await freshNavigate(this.page, report2Url(caseName));
  }

  async gotoReport2WithHash(caseName: string, hash: string): Promise<void> {
    await freshNavigate(this.page, report2Url(caseName) + (hash.startsWith("#") ? hash : "#" + hash));
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

  /**
   * Rows/cards are expected to carry `role=row` (the Packages table), `role=option` (a selectable
   * Findings/Radius entry) or `role=listitem`, each with an accessible name that IS the package
   * name (version/tags are presentation, not folded into the name) — this is the concrete
   * assistive-tech contract `rows()` is written against, not a guess at what exists today. An
   * Advisories row is one advisory, not one package, so its name adds the severity and the CVE or
   * id after the package ("acme/http-client, critical, CVE-2026-31337"); its `data-pkg` still
   * carries the package alone, and is what this reads first.
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
      // The open package's sheet holds lists and a table of its own, which are not the view's rows.
      if (await el.evaluate((node) => node.closest('[data-surface="detail"]') !== null)) continue;
      const name =
        (await el.getAttribute("data-pkg")) ??
        (await el.getAttribute("aria-label")) ??
        (await el.textContent());
      if (name) names.push(name.trim());
    }

    return names;
  }

  private pkgLocator(name: string): Locator {
    return this.page
      .getByRole("row", { name, exact: true })
      .or(this.page.getByRole("option", { name, exact: true }))
      .or(this.page.getByRole("listitem", { name, exact: true }))
      .or(this.page.locator(`li.adv[data-pkg="${name.replace(/["\\]/g, "\\$&")}"]`))
      .first();
  }

  async clickPackage(name: string): Promise<void> {
    await this.pkgLocator(name).click();
  }

  async rowGeometry(name: string): Promise<RowGeometry> {
    return this.pkgLocator(name).evaluate((row) => {
      const rect = row.getBoundingClientRect();
      return {
        top: rect.top,
        inView: rect.top >= 0 && rect.bottom <= innerHeight,
        clearance: innerHeight - rect.bottom,
      };
    });
  }

  async centerRow(name: string): Promise<void> {
    await this.pkgLocator(name).evaluate((row) => {
      row.scrollIntoView({ block: "center" });
    });
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

  /** The open package's sheet: a complementary column when wide, a modal dialog below that. */
  private detailRegion(): Locator {
    return this.page.locator('[data-surface="detail"]');
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

  /** PD-DETAIL-5 (DESIGN.md §8): `.shell-detail.is-side`'s sticky containing block
   *  (`.shell`'s own grid row, `ui/app.css`) can end before the panel's full travel does, dragging
   *  its sticky `.detail-head` up above its intended `top` and behind the page's fixed `.topbar` —
   *  raw class selectors, not a role/name query, since the question here is exactly this
   *  implementation's own geometry (which element sits where on screen), the same reasoning
   *  `detail-scroll.spec.ts`'s own `scrollContainer` already gives for reaching into `.shell-detail`
   *  directly. Null wherever the question does not apply: no detail open, or it is a full-screen
   *  sheet (`.is-sheet`) rather than a column beside the list. */
  async detailHeaderClearsTopbar(): Promise<boolean | null> {
    const detail = this.page.locator(".shell-detail.is-side");
    if ((await detail.count()) === 0) return null;
    const head = detail.locator(".detail-head").first();
    if ((await head.count()) === 0) return null;

    const [headBox, topbarBox] = await Promise.all([
      head.boundingBox(),
      this.page.locator(".topbar").boundingBox(),
    ]);
    if (headBox === null || topbarBox === null) return null;

    return headBox.y >= topbarBox.y + topbarBox.height;
  }

  /** A `tabindex` of any value makes a row focusable; only 0 puts it in the Tab order. */
  async rowFocusable(name: string): Promise<boolean> {
    return this.pkgLocator(name).evaluate(
      (el) => el.hasAttribute("tabindex") || (el as HTMLElement).tabIndex >= 0,
    );
  }

  async rowInTabOrder(name: string): Promise<boolean> {
    return this.pkgLocator(name).evaluate((el) => (el as HTMLElement).tabIndex >= 0);
  }

  /** Reads `[data-pkg]` rows under the tabpanel directly: the question is which elements the
   *  browser's own Tab sequence holds, which no role query can answer. A `hidden` element (a
   *  Findings row's print-only signal lines) is skipped, as the browser skips it. */
  async listTabStops(): Promise<string[]> {
    return this.page.getByRole("tabpanel").evaluate((panel) => {
      const stops: string[] = [];
      for (const row of panel.querySelectorAll<HTMLElement>("[data-pkg]")) {
        const name = row.getAttribute("data-pkg") ?? "";
        if (row.tabIndex >= 0) stops.push(name);
        for (const inner of row.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]")) {
          if (inner.tabIndex >= 0 && inner.closest("[hidden]") === null) stops.push(name);
        }
      }
      return stops;
    });
  }

  async isFocusInDetail(): Promise<boolean> {
    const region = this.detailRegion();
    if ((await region.count()) === 0) return false;
    return region.first().evaluate((el) => el.contains(document.activeElement));
  }

  /** `aria-current`, as on every tab's rows (M6: the packages table marks the open row, unlike legacy; PD-ROWS-12). */
  async rowSelected(name: string): Promise<boolean> {
    return (await this.pkgLocator(name).getAttribute("aria-current")) === "true";
  }

  async focusRow(name: string): Promise<void> {
    await this.pkgLocator(name).focus();
  }

  async focusedRowIndex(): Promise<number | null> {
    return this.page.getByRole("tabpanel").evaluate((panel) => {
      const at = [...panel.querySelectorAll("[data-pkg]")].indexOf(document.activeElement as Element);
      return at < 0 ? null : at;
    });
  }

  async tabStopRowIndexes(): Promise<number[]> {
    return this.page
      .getByRole("tabpanel")
      .evaluate((panel) =>
        [...panel.querySelectorAll<HTMLElement>("[data-pkg]")].flatMap((row, at) =>
          row.tabIndex >= 0 ? [at] : [],
        ),
      );
  }

  async isFocusObscured(): Promise<boolean | null> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) return null;
      const box = active.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === null || !(hit === active || active.contains(hit));
    });
  }

  async focusedRowName(): Promise<string | null> {
    return this.page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      // A Findings row is a plain `<li>` and a Packages row a `<tr>`: their roles are implicit.
      const role = active.getAttribute("role") ?? { LI: "listitem", TR: "row" }[active.tagName];
      if (role === "row" || role === "option" || role === "listitem") {
        // The same name `rows()` reads: an Advisories row's accessible name adds its severity and
        // id ("spomky-labs/otphp, high, PKSA-…"), its `data-pkg` is the package alone.
        return (
          active.getAttribute("data-pkg") ?? active.getAttribute("aria-label") ?? active.textContent.trim()
        );
      }

      return null;
    });
  }

  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter");
  }

  async pressTab(back = false): Promise<void> {
    await this.page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }

  async typeKeys(text: string): Promise<void> {
    await this.page.keyboard.type(text);
  }

  async focusLinkInRow(name: string): Promise<void> {
    await this.pkgLocator(name).getByRole("link").first().focus();
  }

  /** The Findings list's age axis (`views/AgeScale.tsx#AgeAxis`, PD-ROWS-4, DESIGN.md §5): the one
   *  `role=img` in the column head, found by its accessible name's fixed leading words. Its visible
   *  captions, whitespace-collapsed, or null when the tab draws no axis. */
  async ageAxisText(): Promise<string | null> {
    const axis = this.page.getByRole("img", { name: /^age axis:/ });
    if ((await axis.count()) === 0) return null;
    return axis.first().evaluate((el) =>
      Array.from(el.querySelectorAll(".fhead-axis > *"))
        .map((part) => part.textContent.trim())
        .join(" "),
    );
  }

  async ageAxisAccessibleName(): Promise<string | null> {
    const axis = this.page.getByRole("img", { name: /^age axis:/ });
    return (await axis.count()) > 0 ? axis.first().getAttribute("aria-label") : null;
  }

  /** The age cell's decorative parts (`AgeScale.tsx#AgeCell`) carry no accessible role of their
   *  own — the whole cell is one `role=img` — so they're read by position from that element
   *  (`children[0]` the track; inside it the warn guide, the high guide and the bar), the same
   *  structural approach `ledgerSegmentPrintStyle` below uses, rather than by class. a11y review
   *  (PD-ROWS-2/4, DESIGN.md §5): forced-colors mode flattens every tone to the page's Canvas; each
   *  boolean is whether that part still paints something distinct from it — the track's hairline,
   *  the warn guide's line, the bar's fill, hatch or outline. The names keep the scale's first shape
   *  (`tick` the guide, `dot` the bar). */
  async ageScaleForcedColorsVisible(name: string): Promise<{ track: boolean; tick: boolean; dot: boolean }> {
    return this.pkgLocator(name)
      .getByRole("img")
      .first()
      .evaluate((scale) => {
        const track = scale.children[0];
        const guide = track?.children[0];
        const bar = track?.children[2];
        if (
          !(track instanceof HTMLElement) ||
          !(guide instanceof HTMLElement) ||
          !(bar instanceof HTMLElement)
        ) {
          throw new Error("age cell is missing a track, guide or bar");
        }
        const pageBg = getComputedStyle(document.body).backgroundColor;
        const trackColor = getComputedStyle(track, "::before").backgroundColor;
        const guideStyle = getComputedStyle(guide);
        const barStyle = getComputedStyle(bar);
        const distinct = (c: string) => c !== pageBg && c !== "rgba(0, 0, 0, 0)" && c !== "";
        // The bar's pattern carries the zone (ledger-rows.css): solid fill past `high`, a hatch
        // between the thresholds, an inset outline below `warn` — any one says it is drawn at all.
        const barVisible =
          distinct(barStyle.backgroundColor) ||
          barStyle.backgroundImage !== "none" ||
          barStyle.boxShadow !== "none";
        return {
          track: distinct(trackColor),
          tick: guideStyle.borderLeftStyle !== "none" && distinct(guideStyle.borderLeftColor),
          dot: barVisible,
        };
      });
  }

  /** `document.elementFromPoint` at the warn tick's own centre: `true` when the tick itself is the
   *  topmost element painted there. A colour check alone (`ageScaleForcedColorsVisible`) can't tell
   *  a tick that renders fine but sits under an opaquely-filled dot from one that's genuinely
   *  missing — this reads paint order instead. */
  async ageScaleWarnTickSurvivesDot(name: string): Promise<boolean> {
    return this.ageScaleTickSurvivesDot(name, 0);
  }

  async ageScaleHighTickSurvivesDot(name: string): Promise<boolean> {
    return this.ageScaleTickSurvivesDot(name, 1);
  }

  /** `tickIndex` 0 is the warn tick, 1 the high tick — the track's own child order
   *  (`views/AgeScale.tsx`: warn tick, high tick, dot). */
  private async ageScaleTickSurvivesDot(name: string, tickIndex: 0 | 1): Promise<boolean> {
    const scaleLocator = this.pkgLocator(name).getByRole("img").first();
    // `elementFromPoint` only ever sees the viewport, not the scrollable page — the row this scale
    // sits in is usually well below the fold in a 200+ package report.
    await scaleLocator.scrollIntoViewIfNeeded();
    return scaleLocator.evaluate((scale, index) => {
      const track = scale.children[0];
      const tick = track?.children[index];
      if (!(tick instanceof HTMLElement)) throw new Error("age scale is missing a threshold tick");
      const rect = tick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return document.elementFromPoint(cx, cy) === tick;
    }, tickIndex);
  }

  /** `.waffle` (`ledger/Waffle.tsx`): found by class, not an accessible query, since it is
   *  deliberately `aria-hidden` — the figure and chips beside it carry every number in words. */
  async summaryWaffle(): Promise<{ flagged: number; total: number } | null> {
    const waffle = this.page.locator(".waffle");
    if ((await waffle.count()) === 0 || !(await waffle.first().isVisible())) return null;
    return waffle.first().evaluate((el) => ({
      flagged: el.querySelectorAll(".waffle-cell:not(.waffle-rest)").length,
      total: el.querySelectorAll(".waffle-cell").length,
    }));
  }

  async summaryWaffleForcedColors(): Promise<{ flaggedDistinct: boolean; restOutlined: boolean }> {
    return this.page
      .locator(".waffle")
      .first()
      .evaluate((el) => {
        const flagged = el.querySelector(".waffle-cell:not(.waffle-rest)");
        const rest = el.querySelector(".waffle-rest");
        if (!(flagged instanceof HTMLElement) || !(rest instanceof HTMLElement)) {
          throw new Error("waffle needs a flagged and a quiet square for this check");
        }
        const pageBg = getComputedStyle(document.body).backgroundColor;
        const fill = getComputedStyle(flagged).backgroundColor;
        const restStyle = getComputedStyle(rest);
        return {
          flaggedDistinct: fill !== pageBg && fill !== "rgba(0, 0, 0, 0)",
          restOutlined: restStyle.outlineStyle === "solid" && restStyle.outlineColor !== pageBg,
        };
      });
  }

  /** The accessible name the gate fact's button always starts with (domain/gate.ts#gateFact) —
   *  fixed vocabulary, same convention as VIEW_LABEL/RAIL_LABEL above. */
  private gateFactButton(): Locator {
    return this.page.getByRole("button", { name: /^(no gate|gate:)/i });
  }

  /** The sentence the popover's own text always starts with (domain/gate.ts#gateFact) — the one
   *  fixed opening every `fail_on` produces; found by that text, not by the popover's
   *  plumbing (`popover="auto"`, an id relationship) which is Header.tsx's implementation detail,
   *  not this contract's. */
  private gateFactPopover(): Locator {
    return this.page.getByText(/^This run was told --fail-on=/);
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

  /** Scoped to the rail's own group: the open detail's chain names packages as buttons too
   *  (PD-DETAIL-6), and a page-wide name match found `vendor/direct` for the rail's "Direct". */
  private railLocator(group: RailGroup, key: string): Locator {
    return this.page
      .getByRole("group", { name: "Filters" })
      .getByRole("button", { name: railLabel(group, key) });
  }

  async railOption(group: RailGroup, key: string): Promise<void> {
    await this.railLocator(group, key).click();
  }

  async railRows(): Promise<{ group: string; label: string; count: number; pressed: boolean }[]> {
    const buttons = this.page.getByRole("group", { name: "Filters" }).getByRole("button");
    return buttons.evaluateAll((els) =>
      els.map((el) => {
        const count = el.querySelector(".c")?.textContent ?? "";
        const label = el.textContent.replace(count, "").replace(/\s+/g, " ").trim();
        const group = el.closest(".rail-group")?.getAttribute("aria-label") ?? "";
        return { group, label, count: Number(count), pressed: el.getAttribute("aria-pressed") === "true" };
      }),
    );
  }

  /** Toggles the rail row `railRows()` reported as `label`, in `group` when given ("critical" is a
   *  Grade row and a Severity row). By label, not position: PD-RAIL-2 leaves out a row that would
   *  list nothing, so selecting one row can move the others. */
  async toggleRailRow(label: string, group?: string): Promise<void> {
    const buttons = this.page.getByRole("group", { name: "Filters" }).getByRole("button");
    const index = await buttons.evaluateAll(
      (els, [wanted, inGroup]) =>
        els.findIndex((el) => {
          const count = el.querySelector(".c")?.textContent ?? "";
          const named = el.textContent.replace(count, "").replace(/\s+/g, " ").trim() === wanted;
          return (
            named && (inGroup === null || el.closest(".rail-group")?.getAttribute("aria-label") === inGroup)
          );
        }),
      [label, group ?? null] as const,
    );
    if (index < 0) throw new Error(`no rail row "${label}"`);
    await buttons.nth(index).click();
  }

  async listedPackageCount(): Promise<number> {
    return new Set(await this.renderedRowNames()).size;
  }

  async rowNameAt(index: number): Promise<string | null> {
    return (await this.renderedRowNames())[index] ?? null;
  }

  /**
   * The names `rows()` reads, in document order, collected in one page call: a per-row locator
   * round trip over wallabag's 271 packages, once per rail row, would take minutes. `getByRole`
   * (what `rows()` uses) skips what is not rendered or is hidden from the accessibility tree, so
   * this does too: folded Blast radius rows, the closed glossary and the print-only copy would
   * otherwise add rows the list never shows (CodeRabbit on #6).
   */
  private renderedRowNames(): Promise<string[]> {
    return this.page.evaluate(() => {
      const names: string[] = [];
      const implicit: Record<string, string> = { TR: "row", LI: "listitem" };
      for (const el of document.querySelectorAll<HTMLElement>(
        '[role="row"], [role="option"], [role="listitem"], tr, li',
      )) {
        if (el.getClientRects().length === 0) continue;
        if (el.closest('[hidden], [aria-hidden="true"], [inert]') !== null) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        const role = el.getAttribute("role") ?? implicit[el.tagName] ?? "";
        if (!["row", "option", "listitem"].includes(role)) continue;
        if (el.querySelector('[role="columnheader"], th')) continue;
        if (el.closest('[data-surface="detail"]') !== null) continue;
        const name = el.getAttribute("data-pkg") ?? el.getAttribute("aria-label") ?? el.textContent;
        if (name) names.push(name.trim());
      }
      return names;
    });
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

  async isScrollLocked(): Promise<boolean> {
    return this.page.evaluate(() => getComputedStyle(document.body).overflow === "hidden");
  }

  async tabsOverflow(): Promise<boolean> {
    return this.page.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  }

  /** The chevrons are `aria-hidden` pointer affordances (PD-TABS-1), so no role reaches them: the
   *  class is the only handle, and it stays inside this file. */
  private tabsChevron(side: "prev" | "next"): Locator {
    return this.page.locator(`.tabs-scroll-${side}`);
  }

  async tabsOverflowCue(): Promise<{ prev: boolean; next: boolean }> {
    const strip = await this.page.getByRole("tablist").boundingBox();
    if (strip === null) throw new Error("tab list not found");
    // The header's own surface, a few pixels into the strip's top-left padding: above every label
    // and clear of the chevrons, which sit on the row's vertical middle.
    const surface = decodePng(
      await this.page.screenshot({
        clip: { x: strip.x + 2, y: Math.round(strip.y + 3), width: 1, height: 1 },
      }),
    );
    const base = [surface.data.readUInt8(0), surface.data.readUInt8(1), surface.data.readUInt8(2)] as const;

    const painted = async (side: "prev" | "next"): Promise<boolean> => {
      const chevron = this.tabsChevron(side);
      if (!(await chevron.isVisible())) return false;
      const box = await chevron.boundingBox();
      if (box === null) return false;
      // One pixel row through the button's middle, where the chevron's stroke crosses it.
      const png = decodePng(
        await this.page.screenshot({
          clip: { x: box.x, y: Math.round(box.y + box.height / 2), width: Math.round(box.width), height: 1 },
        }),
      );
      let best = 0;
      for (let x = 0; x < png.width; x += 1) {
        const contrast = Math.max(
          Math.abs(png.data.readUInt8(x * 4) - base[0]),
          Math.abs(png.data.readUInt8(x * 4 + 1) - base[1]),
          Math.abs(png.data.readUInt8(x * 4 + 2) - base[2]),
        );
        best = Math.max(best, contrast);
      }
      return best > 90;
    };

    return { prev: await painted("prev"), next: await painted("next") };
  }

  async scrollTabs(side: "prev" | "next"): Promise<void> {
    const list = await this.page.getByRole("tablist").elementHandle();
    const before = await list.evaluate((el) => el.scrollLeft);
    await this.tabsChevron(side).click();
    // The chevron glides (unless reduced motion is asked for), and a frame or two can pass
    // mid-glide without the row moving: wait until it has moved and then held still for
    // `STILL_FRAMES` frames in a row, i.e. has come to rest.
    await list.evaluate(
      (el, start) =>
        new Promise<void>((resolve) => {
          const STILL_FRAMES = 8;
          let last = el.scrollLeft;
          let still = 0;
          const tick = () => {
            const now = el.scrollLeft;
            still = now === last && now !== start ? still + 1 : 0;
            last = now;
            if (still >= STILL_FRAMES) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      before,
    );
  }

  async tabInFullView(name: ViewName): Promise<boolean> {
    return this.tabLocator(name).evaluate((tab) => {
      const list = tab.closest('[role="tablist"]');
      if (list === null) return false;
      const box = list.getBoundingClientRect();
      const rect = tab.getBoundingClientRect();
      if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5) return false;
      // Not under a chevron: the label must be readable, not merely inside the scroller's box.
      const chevrons = [...document.querySelectorAll<HTMLElement>(".tabs-scroll")].filter(
        (el) => !el.hidden && el.getBoundingClientRect().width > 0,
      );
      return chevrons.every((el) => {
        const c = el.getBoundingClientRect();
        return c.right <= rect.left + 0.5 || c.left >= rect.right - 0.5;
      });
    });
  }

  async isFocusOnTabsChevron(): Promise<boolean> {
    return this.page.evaluate(() => document.activeElement?.classList.contains("tabs-scroll") ?? false);
  }

  async focusTab(name: ViewName): Promise<void> {
    await this.tabLocator(name).focus();
  }

  async focusedTab(): Promise<ViewName | null> {
    const text = await this.page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute("role") === "tab" ? el.textContent : null;
    });
    if (text === null) return null;
    return (Object.keys(VIEW_LABEL) as ViewName[]).find((view) => text.includes(VIEW_LABEL[view])) ?? null;
  }

  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
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

/** Same-document hash-only navigations never re-run a page's boot script, so every fresh load
 *  bounces through `about:blank` first. */
async function freshNavigate(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}
