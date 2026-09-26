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
import { decodePng, distinctPixelRatio } from "./png";

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
        return active.getAttribute("aria-label") ?? active.textContent.trim();
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

  async rowSignalIds(name: string): Promise<string[]> {
    const links = await this.pkgLocator(name).getByRole("link").all();
    return Promise.all(links.map((link) => link.innerText()));
  }

  async rowMoreSignalsText(name: string): Promise<string | null> {
    const note = this.pkgLocator(name).getByText(/more signals?, open the package/);
    return (await note.count()) > 0 ? (await note.first().innerText()).trim() : null;
  }

  async rowAgeScaleLabel(name: string): Promise<string | null> {
    const scale = this.pkgLocator(name).getByRole("img");
    return (await scale.count()) > 0 ? scale.first().getAttribute("aria-label") : null;
  }

  async rowAgeScaleTitle(name: string): Promise<string | null> {
    const scale = this.pkgLocator(name).getByRole("img");
    return (await scale.count()) > 0 ? scale.first().getAttribute("title") : null;
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

  /** Second a11y review (PD-LEDGER-2, DESIGN.md §5): `legendButtonForcedColorsStyle` only reads
   *  `getComputedStyle`, which a native `<button>`'s forced-colors paint can diverge from — this
   *  screenshots the chip's own label text node (a bare text node between the swatch and the count,
   *  found by `Range`, not by an element it has none of its own) and reads the actual pixels.
   *
   *  The `Range`'s own bounding box runs right up to the chip's rounded border on this fixture,
   *  which bleeds a sliver of the chip's own border colour into an uninset crop regardless of
   *  whether the label itself painted at all — measured against the actual bug (a broken build with
   *  `forced-color-adjust: none` removed): an uninset crop still read as ~7% distinct, above a
   *  careless threshold, while the same crop inset by 2px on every side read as exactly 0% distinct,
   *  against ~30-40% once the label legitimately paints. The inset is what makes this check mean
   *  anything. */
  async legendButtonPressedLabelDistinctPixelRatio(group: LedgerGroup, key: string): Promise<number> {
    const chip = this.ledgerLocator(group, key);
    const rect = await chip.evaluate((el) => {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
      throw new Error("legend chip has no bare label text node to screenshot");
    });

    const inset = 2;
    const buf = await this.page.screenshot({
      clip: {
        x: rect.x + inset,
        y: rect.y + inset,
        width: Math.max(1, rect.width - inset * 2),
        height: Math.max(1, rect.height - inset * 2),
      },
    });
    return distinctPixelRatio(decodePng(buf));
  }

  async priorityLedgerTooltip(): Promise<string | null> {
    return this.page
      .getByRole("group", { name: "Ledger" })
      .getByText("Flagged packages", { exact: true })
      .first()
      .getAttribute("title");
  }

  async hasSummaryLine(text: string): Promise<boolean> {
    // Visible, not just present: on a phone the band's supporting tier sits in a closed fold, and
    // this is the assertion that a reader sees the lead without opening anything.
    const line = this.page.getByText(text);
    return (await line.count()) > 0 && (await line.first().isVisible());
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

  /** A verdict bar's row frame and its first priority part under the current media (PD-SUMMARY-7):
   *  the part must keep a fill, and an unpressed row must not draw a frame of its own. */
  async verdictBarForcedColors(verdict: string): Promise<{ partFilled: boolean; rowFramed: boolean }> {
    return this.page
      .getByRole("group", { name: "Ledger" })
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(verdict)} \\d+$`) })
      .evaluate((el) => {
        const part = el.querySelector(".legend-seg");
        if (!(part instanceof HTMLElement)) throw new Error("verdict bar has no priority part");
        const pageBg = getComputedStyle(document.body).backgroundColor;
        const fill = getComputedStyle(part).backgroundColor;
        const row = getComputedStyle(el);
        return {
          partFilled: fill !== pageBg && fill !== "rgba(0, 0, 0, 0)",
          rowFramed: row.borderTopColor !== row.backgroundColor,
        };
      });
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

  /** The accessible name the gate fact's button always starts with (Header.tsx#gateFact) —
   *  fixed vocabulary, same convention as VIEW_LABEL/RAIL_LABEL above. */
  private gateFactButton(): Locator {
    return this.page.getByRole("button", { name: /^(no gate|gate:)/i });
  }

  /** The sentence the popover's own text always starts with (Header.tsx#gateFact) — one of the two
   *  fixed openings the run's `fail_on` can produce; found by that text, not by the popover's
   *  plumbing (`popover="auto"`, an id relationship) which is Header.tsx's implementation detail,
   *  not this contract's. */
  private gateFactPopover(): Locator {
    return this.page.getByText(/^(No gate on this run|This run was told to fail on)/);
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

  async railRows(): Promise<{ label: string; count: number; pressed: boolean }[]> {
    const buttons = this.page.getByRole("group", { name: "Filters" }).getByRole("button");
    return buttons.evaluateAll((els) =>
      els.map((el) => {
        const count = el.querySelector(".c")?.textContent ?? "";
        const label = el.textContent.replace(count, "").replace(/\s+/g, " ").trim();
        return { label, count: Number(count), pressed: el.getAttribute("aria-pressed") === "true" };
      }),
    );
  }

  async toggleRailRowAt(index: number): Promise<void> {
    await this.page.getByRole("group", { name: "Filters" }).getByRole("button").nth(index).click();
  }

  /** Toggles the rail row `railRows()` reported as `label`. By label, not position: PD-RAIL-2 leaves
   *  out a row that would list nothing, so selecting one row can move the others. */
  async toggleRailRow(label: string): Promise<void> {
    const buttons = this.page.getByRole("group", { name: "Filters" }).getByRole("button");
    const index = await buttons.evaluateAll(
      (els, wanted) =>
        els.findIndex((el) => {
          const count = el.querySelector(".c")?.textContent ?? "";
          return el.textContent.replace(count, "").replace(/\s+/g, " ").trim() === wanted;
        }),
      label,
    );
    if (index < 0) throw new Error(`no rail row "${label}"`);
    await buttons.nth(index).click();
  }

  async listedPackageCount(): Promise<number> {
    // The same candidates `rows()` reads, counted in one page call: a per-row locator round trip
    // over wallabag's 271 packages, once per rail row, would take minutes.
    return this.page.evaluate(() => {
      const names = new Set<string>();
      const implicit: Record<string, string> = { TR: "row", LI: "listitem" };
      for (const el of document.querySelectorAll(
        '[role="row"], [role="option"], [role="listitem"], tr, li',
      )) {
        const role = el.getAttribute("role") ?? implicit[el.tagName] ?? "";
        if (!["row", "option", "listitem"].includes(role)) continue;
        if (el.querySelector('[role="columnheader"], th')) continue;
        const name = el.getAttribute("data-pkg") ?? el.getAttribute("aria-label") ?? el.textContent;
        if (name) names.add(name.trim());
      }
      return names.size;
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

  /** A Blast radius row (PD-RADIUS-1): the list item named after the requirement. Its stated count
   *  is the squares' accessible name ("N flagged packages listed under it: …"); what it lists is the
   *  list items nested under it, open or folded — the M24/M25 contract is only that the two agree. */
  async radiusCard(parent: string): Promise<{ statedCount: number | null; listedCount: number } | null> {
    return this.page.evaluate((name) => {
      const row = Array.from(document.querySelectorAll("li[aria-label]")).find(
        (li) => li.getAttribute("aria-label") === name,
      );
      if (!row) return null;
      const label = row.querySelector('[role="img"]')?.getAttribute("aria-label") ?? "";
      const match = /^(\d+)\s+flagged/.exec(label);
      const statedCount = match ? Number(match[1]) : null;
      const listedCount = row.querySelectorAll("li[aria-label]").length;

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

  /** PD-GLOSSARY-4/5: the verdict pill with a popover is the open detail's own header, not a row's
   *  — a walk found a row's own pill read as the row's click target, and it is plain text there now
   *  (`views/FindingRow.tsx`), no `<button>` role at all. Opens `pkg` first (a no-op if it is
   *  already open), then clicks its header pill, whose accessible name is the verdict itself, same
   *  case-insensitive matching every role lookup here uses. */
  async clickVerdictPill(pkg: string, verdict: string): Promise<void> {
    await this.openPackage(pkg);
    await this.detailRegion().getByRole("button", { name: verdict, exact: true }).click();
  }

  /** The row's own pill carries no button role at all now (`views/FindingRow.tsx`), so it is found
   *  the same way `verdictPrintStyle` finds it: by its own visible word, `exact` so a short verdict
   *  does not also match a longer phrase that contains it. */
  async clickPillInFindingsRow(pkg: string, verdict: string): Promise<void> {
    await this.pkgLocator(pkg).getByText(verdict, { exact: true }).click();
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

  async isPillFocused(_pkg: string, verdict: string): Promise<boolean> {
    // `_pkg` documents intent only — the row itself carries no pill button to focus any more
    // (PD-GLOSSARY-4/5); the only pill this can mean is the open detail's own header's.
    return this.detailRegion()
      .getByRole("button", { name: verdict, exact: true })
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
    // Anchored: the header's own "Copy summary" (PD-PRINT-1) is a different button.
    const button = this.page.getByRole("button", { name: /^(copy|copied|select it and copy)$/i });
    if ((await button.count()) === 0) return null;

    return (await button.first().textContent())?.trim() ?? null;
  }

  async clickCopyButton(): Promise<void> {
    await this.page.getByRole("button", { name: /^copy$/i }).click();
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

  async ledgerSegmentPrintStyle(): Promise<{ backgroundColor: string; printColorAdjust: string }> {
    const bar = this.page.getByRole("group", { name: "Ledger" }).locator(".legend-btn-bar").first();
    return bar.evaluate((el) => {
      // The bar's first priority part (VerdictLedger.tsx): the element that actually paints a tone.
      const segment = el.querySelector(".legend-seg");
      if (!(segment instanceof HTMLElement)) throw new Error("the first verdict bar has no priority part");
      const style = getComputedStyle(segment);
      return {
        backgroundColor: style.backgroundColor,
        printColorAdjust:
          style.getPropertyValue("-webkit-print-color-adjust") ||
          style.getPropertyValue("print-color-adjust"),
      };
    });
  }

  async verdictPrintStyle(
    pkg: string,
    verdict: string,
  ): Promise<{ color: string; printColorAdjust: string }> {
    // Not `getByRole("button", ...)`: a row's own verdict is plain text (PD-GLOSSARY-4/5), and since
    // PD-ROWS-4 a coloured word rather than a bordered pill — its tone is its text colour. `exact`
    // keeps this from also matching a longer phrase that happens to contain the word.
    return this.pkgLocator(pkg)
      .getByText(verdict, { exact: true })
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          color: style.color,
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
