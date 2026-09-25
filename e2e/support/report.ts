/**
 * The page-object contract the e2e specs are written against. `new.ts` implements this interface
 * over the Preact rewrite, using accessible locators only (role, label, text) — that file is the
 * accessibility contract the UI has to meet, not a convenience wrapper.
 *
 * A spec imports only from here (types) and from `pages.ts` (fixtures); it never reaches into
 * `new.ts` directly and never queries the page with a raw selector. Anything a spec needs to know
 * about the rendered page goes through a method on this interface.
 */
import type { Page } from "@playwright/test";
import type { FixtureName } from "./pages";
import { NewReportPage } from "./new";

export const VIEWS = ["findings", "advisories", "packages", "radius", "run"] as const;
export type ViewName = (typeof VIEWS)[number];

/** Filter groups only the ledger legend can set (`report.js:254,266,287`; rail excludes them, M17). */
export const LEDGER_GROUPS = ["prio", "verdict", "sev"] as const;
export type LedgerGroup = (typeof LEDGER_GROUPS)[number];

/** Filter groups the rail offers (`report.js:344-392`). */
export const RAIL_GROUPS = ["scope", "signal", "fix", "since"] as const;
export type RailGroup = (typeof RAIL_GROUPS)[number];

export interface DetailSnapshot {
  /** False when no package is open, or the open `pkg` names a finding the report does not have. */
  open: boolean;
  /** The package name the detail pane is titled with, or null when it is closed. */
  name: string | null;
  /**
   * Every visible word in the open detail pane, whitespace-collapsed. Specs assert on substrings
   * of this rather than on a locator per section, because the facts it groups (why this priority,
   * the baseline note, the signal list, the lock entry, ...) sit under headings that are free to
   * change as long as the words stay.
   */
  text: string;
}

export interface SortState {
  key: string;
  desc: boolean;
}

/**
 * The whole surface a spec can act on or read. Every method's inputs and outputs describe the page
 * only in accessible terms: a `ViewName`, a filter group's key, a package name, never a CSS class
 * or an id.
 */
export interface ReportPage {
  /** Loads one fixture bundle's built page, hash-less. */
  goto(fixture: FixtureName): Promise<void>;
  /** Loads the page with a given `#...` fragment already in the URL, exactly as a shared link would. */
  gotoWithHash(fixture: FixtureName, hash: string): Promise<void>;
  reload(): Promise<void>;
  /** The current address bar, `file://...`, query string and fragment included. */
  url(): string;
  /** `location.hash`, leading `#` included (empty string when there is none). */
  hash(): Promise<string>;
  /** Sets `location.hash` the way pasting a link and pressing Enter would — fires `hashchange`. */
  setLocationHash(fragment: string): Promise<void>;

  tab(name: ViewName): Promise<void>;
  /** The view whose tab is marked selected, or null if none is (an unrecognised `view=`, M14). */
  activeTab(): Promise<ViewName | null>;
  /** The tab's badge text, e.g. `"7"` or `""` when the badge is empty (M21's Run-tab case). */
  tabCount(name: ViewName): Promise<string>;

  search(text: string): Promise<void>;
  searchValue(): Promise<string>;
  focusSearch(): Promise<void>;
  isSearchFocused(): Promise<boolean>;
  /** Resets the search box and every filter group; leaves the tab and open package alone. */
  clear(): Promise<void>;
  /** The "N of M ..." status line, or null when the current view does not show one (Run). */
  countLine(): Promise<string | null>;
  /** The empty-state message, or null when the current view has rows to show. */
  emptyMessage(): Promise<string | null>;

  /** Package names for the current view's rendered rows/cards, in document order. Duplicates are
   *  possible (e.g. one Advisories row per advisory, several under the same package). */
  rows(): Promise<string[]>;
  /** A single click on the row/card/button that represents this package. Every list's row opens
   *  its package and never closes it (PD-ROWS-7); a `data-open` button always opens. */
  clickPackage(name: string): Promise<void>;
  /** Ensures the detail pane ends up open on this package. */
  openPackage(name: string): Promise<void>;
  closeDetail(): Promise<void>;
  detail(): Promise<DetailSnapshot>;
  /** The detail header's own "Clear filters" control (PD-DETAIL-4, DESIGN.md §5) — shown only
   *  while the open package is hidden from its own tab by the search box or a rail filter, and
   *  distinct from the search bar's "Clear". */
  clearFiltersFromDetail(): Promise<void>;
  /** Whether the detail panel's own Close button currently holds keyboard focus — where "Clear
   *  filters" (PD-DETAIL-4, DESIGN.md §5) moves focus to, since it unmounts itself on the same
   *  click. */
  isFocusOnDetailClose(): Promise<boolean>;
  /** Whether the open detail's own sticky header (the package name, its pills, the Close button) is
   *  fully clear of the page's fixed header band — `false` when any part of it renders behind the
   *  header instead of below it (PD-DETAIL-5, DESIGN.md §5: `.shell-detail.is-side`'s own sticky
   *  offset can be squeezed short of its intended `top` by a row that ends before the panel's full
   *  travel does, dragging its header up behind the fixed one). Null when no detail is open, or it
   *  is a full-screen sheet rather than a side column — the fixed header sits above the sheet's own
   *  `z-index` there, so this question does not apply. */
  detailHeaderClearsTopbar(): Promise<boolean | null>;
  /** Whether the row for this package can receive keyboard focus at all (M6): by `j`/`k`, a
   *  click or script — not necessarily by Tab, which reaches one row only (PD-ROWS-11). */
  rowFocusable(name: string): Promise<boolean>;
  /** Whether Tab can reach this row: true for exactly one row of the list (PD-ROWS-11). */
  rowInTabOrder(name: string): Promise<boolean>;
  /** Every element Tab can reach inside the current view's rows, as the name of the row it sits in
   *  (the row itself and each link of it), in document order (PD-ROWS-11). */
  listTabStops(): Promise<string[]>;
  /** Whether keyboard focus is anywhere inside the open detail. */
  isFocusInDetail(): Promise<boolean>;
  /** Whether the row is marked as the current selection for assistive tech (M6). */
  rowSelected(name: string): Promise<boolean>;
  /** Moves keyboard focus onto the row/card for this package, without clicking it. */
  focusRow(name: string): Promise<void>;
  /** The package name of whichever row/card currently holds keyboard focus, or null. */
  focusedRowName(): Promise<string | null>;
  /** The position of the focused row among the current view's rows, or null when no row holds
   *  focus — tells two rows of the same package apart (PD-ROWS-12). */
  focusedRowIndex(): Promise<number | null>;
  /** The positions, among the current view's rows, of the rows Tab can reach (PD-ROWS-11/12). */
  tabStopRowIndexes(): Promise<number[]>;
  /** Whether whatever holds keyboard focus is hidden under something drawn over it (WCAG 2.4.11):
   *  the element at its centre is neither it nor inside it. Null when nothing on the page holds
   *  focus (PD-ROWS-12). */
  isFocusObscured(): Promise<boolean | null>;
  /** Presses Enter on whatever currently holds focus. */
  pressEnter(): Promise<void>;
  /** Presses Tab, or Shift+Tab with `back`. */
  pressTab(back?: boolean): Promise<void>;
  /** Types text into whatever holds focus, one key at a time, as a reader would. */
  typeKeys(text: string): Promise<void>;
  /** Moves keyboard focus onto the first outbound link inside a package's row (e.g. a signal-id
   *  link or the Packagist link) without clicking it, so a spec can then press Enter on it (M5). */
  focusLinkInRow(name: string): Promise<void>;
  /** The accessible name (e.g. "S2") of every signal-id link inside a Findings row, in document
   *  order — a Findings row carries no other link, so this doubles as "how many signal lines this
   *  row draws" (PD-ROWS-1, DESIGN.md §5: exactly one, the row's own key fact). */
  rowSignalIds(name: string): Promise<string[]>;
  /** The row's old "+N more signal(s), open the package" note, or null when the row shows none —
   *  which, since PD-ROWS-4 (DESIGN.md §5), is every row: the detail lists every signal. */
  rowMoreSignalsText(name: string): Promise<string | null>;
  /** The row's age scale (`role="img"`) accessible name, or null when the row draws no scale at
   *  all (PD-ROWS-2, DESIGN.md §5). */
  rowAgeScaleLabel(name: string): Promise<string | null>;
  /** The row's age scale's own `title` — the same text as `rowAgeScaleLabel`, on hover rather than
   *  only for assistive tech (PD-ROWS-3, DESIGN.md §5: the scale's two threshold ticks otherwise
   *  show a reader nothing to hover). Null on the same terms as `rowAgeScaleLabel`. */
  rowAgeScaleTitle(name: string): Promise<string | null>;
  /** The Findings list's age axis captions in its column head (PD-ROWS-4, DESIGN.md §5), e.g.
   *  "Years since release 0 3y 5y 10y+", or null when the tab draws no axis. */
  ageAxisText(): Promise<string | null>;
  /** The same axis' accessible name, the thresholds spelled out in full. */
  ageAxisAccessibleName(): Promise<string | null>;
  /** Whether the row's age scale's track, threshold ticks and dot each paint a colour distinct
   *  from the page background — the forced-colors a11y fix (PD-ROWS-2, DESIGN.md §5): before it,
   *  all three computed to the same Canvas colour as the page and the scale effectively vanished. */
  ageScaleForcedColorsVisible(name: string): Promise<{ track: boolean; tick: boolean; dot: boolean }>;
  /** Whether the age scale's warn threshold tick is still the topmost element at its own centre
   *  point in forced-colors mode — the second a11y review on PD-ROWS-2 (DESIGN.md §5): the dot's
   *  opaque `background: Canvas` used to paint over a tick sitting at nearly the same position,
   *  which `ageScaleForcedColorsVisible`'s own colour check couldn't catch, since the tick's colour
   *  was never wrong, only its paint order under the dot was. */
  ageScaleWarnTickSurvivesDot(name: string): Promise<boolean>;
  /** The same check for the scale's other tick (`ageScaleWarnTickSurvivesDot`'s own comment): a dot
   *  sitting between the two ticks (rather than on either one) can paint over both at once, not just
   *  the nearer one — a regression review found PD-ROWS-3's own shared maximum bunching the two
   *  ticks close enough together, in the default colour scheme, that a mid-zone dot's opaque fill
   *  covered them both, not only in forced-colors mode. */
  ageScaleHighTickSurvivesDot(name: string): Promise<boolean>;

  ledgerButton(group: LedgerGroup, key: string): Promise<void>;
  /** null when the button carries no pressed-state at all for assistive tech (M17, legacy). */
  ledgerButtonPressed(group: LedgerGroup, key: string): Promise<boolean | null>;
  /** The button's `title` — "Show only …" unpressed, "Showing only … — click to clear this
   *  filter" pressed (PD-LEDGER-2, DESIGN.md §5). Null if the button carries no title at all. */
  ledgerButtonTitle(group: LedgerGroup, key: string): Promise<string | null>;
  /** The legend chip's own background/border, plus its swatch's background — the forced-colors
   *  a11y fix (PD-LEDGER-2, DESIGN.md §5): before it, a pressed chip and an unpressed one, and the
   *  swatch itself, all painted the same Canvas colour as the page. */
  legendButtonForcedColorsStyle(
    group: LedgerGroup,
    key: string,
  ): Promise<{ backgroundColor: string; borderColor: string; swatchBackgroundColor: string }>;
  /** The fraction of pixels *actually painted* across the chip's own label text — not the DOM's
   *  computed style — that differ from the label's own backplate colour (second a11y review,
   *  PD-LEDGER-2, DESIGN.md §5): a native `<button>`'s forced-colors paint can diverge from
   *  `getComputedStyle`, which `legendButtonForcedColorsStyle` alone could not have caught. Near
   *  zero means the label painted the same colour as what is behind it — invisible whatever its
   *  computed `color` says. */
  legendButtonPressedLabelDistinctPixelRatio(group: LedgerGroup, key: string): Promise<number>;
  /** The tooltip on the summary band's "Flagged packages" eyebrow (M29). */
  priorityLedgerTooltip(): Promise<string | null>;
  /** Whether this exact wording is visible on the page — a phone reader must see the summary
   *  band's lead (figure, "of N packages", chips) without opening any fold (App.tsx#LedgerSlot,
   *  ledger/Ledger.tsx). */
  hasSummaryLine(text: string): Promise<boolean>;
  /** The summary band's waffle (ledger/Waffle.tsx, PD-SUMMARY-6): how many of its squares are
   *  flagged and how many in all, or null when it is not drawn or not visible. */
  summaryWaffle(): Promise<{ flagged: number; total: number } | null>;
  /** The waffle's first flagged and first quiet square under the current media: their computed
   *  fill and outline, against the page's own background (forced colors must keep both visible). */
  summaryWaffleForcedColors(): Promise<{ flaggedDistinct: boolean; restOutlined: boolean }>;
  /** A verdict bar (`VerdictLedger.tsx`) under the current media: whether its first priority part
   *  keeps a fill, and whether its row draws a border distinct from its own background. */
  verdictBarForcedColors(verdict: string): Promise<{ partFilled: boolean; rowFramed: boolean }>;

  /** The header's gate-fact button (Header.tsx): "no gate" or "gate: <value>", or null when the
   *  document predates `run.fail_on` and the header shows neither. */
  gateFactLabel(): Promise<string | null>;
  /** Opens the gate fact's native popover by clicking its button. */
  openGateFact(): Promise<void>;
  /** Whether the gate fact's popover is currently shown. */
  isGateFactOpen(): Promise<boolean>;
  /** The gate fact's popover text, read the same way `pillPopoverText()` reads a verdict pill's. */
  gateFactPopoverText(): Promise<string>;

  railOption(group: RailGroup, key: string): Promise<void>;
  railOptionPressed(group: RailGroup, key: string): Promise<boolean | null>;
  /** Every rail button in order, as its label and the count it shows (PD-RAIL-1). */
  railRows(): Promise<{ label: string; count: number }[]>;
  /** Clicks the rail button at that position (the order `railRows()` gives), selecting or clearing it. */
  toggleRailRowAt(index: number): Promise<void>;
  /** How many different packages the current view's rows name — `rows()` without duplicates. */
  listedPackageCount(): Promise<number>;

  /** Clicks a Packages-table column header once (toggles direction on a repeat click). */
  sortBy(key: string): Promise<void>;
  sortState(): Promise<SortState | null>;

  /**
   * The Blast radius row for one direct requirement: the count its squares state ("N flagged
   * packages listed under it") against how many package rows it holds, open or folded — M24/M25's
   * exact disagreement. Null when no such row is rendered.
   */
  radiusCard(parent: string): Promise<{ statedCount: number | null; listedCount: number } | null>;

  openGlossary(): Promise<void>;
  closeGlossaryButton(): Promise<void>;
  isGlossaryOpen(): Promise<boolean>;
  glossaryText(): Promise<string>;
  /** The CSS `position` the glossary computes to — `fixed` for an always-in-view overlay, whatever
   *  the browser's UA stylesheet gives a non-modal `<dialog>` otherwise (M28). */
  glossaryPosition(): Promise<string>;

  /** Clicks the verdict pill in the open package's own detail header — PD-GLOSSARY-4/5. Opens
   *  `pkg` first if it is not already the open one, then must open the pill's popover without also
   *  closing the detail. */
  clickVerdictPill(pkg: string, verdict: string): Promise<void>;
  /** Clicks a Findings row's own verdict pill — a walk found readers took it for the row's own
   *  target, not a definition trigger (PD-GLOSSARY-4/5, DESIGN.md §5). Must behave exactly like a
   *  click anywhere else on the row: open the package if it is closed, close it again if it is the
   *  one already open — never a popover, since the row's own pill carries none. */
  clickPillInFindingsRow(pkg: string, verdict: string): Promise<void>;
  /** Whether some pill's popover is currently showing (`:popover-open`), wherever it was opened. */
  isPillPopoverOpen(): Promise<boolean>;
  /** Every visible word in the open pill popover, whitespace-collapsed. */
  pillPopoverText(): Promise<string>;
  /** Whether the open pill popover's own `::backdrop` paints anything (PD-GLOSSARY-4, DESIGN.md
   *  §5, visual review) — before this fix it dimmed nothing, so a fixed, centred popover on a short
   *  page could sit on the very row it opened from with no cue it was an overlay. */
  pillPopoverBackdropVisible(): Promise<boolean>;
  /** Clicks "In the glossary" inside an open pill popover. */
  openGlossaryFromPillPopover(): Promise<void>;
  /** Whichever element inside the open glossary dialog currently holds focus — its text, and
   *  whether it sits within the dialog's own visible (scrolled-into-view) area — the two facts
   *  "In the glossary" promises for the entry it names (PD-GLOSSARY-7, DESIGN.md §5). Null when the
   *  glossary is not open, or focus is not inside it. */
  glossaryFocusedEntry(): Promise<{ text: string | null; inView: boolean } | null>;
  /** Whether the verdict pill itself (not "In the glossary", which hides its own popover in the
   *  same click) is the currently focused element — the a11y review's regression: focus used to be
   *  left on the glossary's Close button, or `<body>`, once the glossary closed this way. */
  isPillFocused(pkg: string, verdict: string): Promise<boolean>;

  /** `"dark"` or `"light"` as the effective theme, read off computed styles, not an attribute that
   *  might be absent (M11: the attribute can be absent while the page is visibly dark). */
  theme(): Promise<"dark" | "light">;
  toggleTheme(): Promise<void>;
  /** The raw `localStorage["lockrot-theme"]` value, or null (storage key is part of the contract,
   *  DESIGN.md §5, and is asserted directly rather than through the theme() abstraction). */
  themeStorageValue(): Promise<string | null>;

  copyButtonLabel(): Promise<string | null>;
  clickCopyButton(): Promise<void>;

  /** Whether the tab row is wider than its own box, so part of it is scrolled out of sight. */
  tabsOverflow(): Promise<boolean>;
  /**
   * The tab row's overflow cue on each side (PD-TABS-1): whether that side's chevron is shown and
   * actually paints a mark distinct from the header's surface — read from real pixels, since a cue
   * can be present in the DOM and still vanish against its background (a walk found exactly that at
   * 390px with the older edge shadow). Both false where the row fits.
   */
  tabsOverflowCue(): Promise<{ prev: boolean; next: boolean }>;
  /** Clicks the tab row's chevron on that side and waits for the row to come to rest. */
  scrollTabs(side: "prev" | "next"): Promise<void>;
  /** Whether the whole tab — label and badge — is inside the row's visible box and clear of both
   *  chevrons. */
  tabInFullView(name: ViewName): Promise<boolean>;
  /** Whether keyboard focus sits on one of the tab row's chevrons (it never should: PD-TABS-1). */
  isFocusOnTabsChevron(): Promise<boolean>;
  /** Moves keyboard focus onto a tab without clicking it. */
  focusTab(name: ViewName): Promise<void>;
  /** The tab that holds keyboard focus, or null when focus is not on a tab. */
  focusedTab(): Promise<ViewName | null>;
  /** Presses one named key (`ArrowLeft`, `End`, …) on whatever holds focus. */
  pressKey(key: string): Promise<void>;
  /** Whether the page currently prevents the document from scrolling (M13's stuck state). */
  isScrollLocked(): Promise<boolean>;
  /** The embedded bundle's top-level keys, from `#lockrot-data` — contract item 7 in history.md. */
  bundleKeys(): Promise<string[]>;

  /** Whether the tab bar (the clearest piece of "app chrome", present on every fixture) is
   *  visible under the current media — used to check that print styling hides interactive chrome. */
  isNavigationVisible(): Promise<boolean>;

  /** The first flagged verdict's bar fill (ledger/VerdictLedger.tsx, a chip drawn as a bar): its
   *  computed background colour, and the computed `print-color-adjust` (or
   *  its `-webkit-` form) that keeps that colour once an actual print applies Chromium's
   *  ink-saving default — a plain screenshot never exercises that default, so the property itself
   *  is what a print test can assert on (print.css). */
  ledgerSegmentPrintStyle(): Promise<{ backgroundColor: string; printColorAdjust: string }>;
  /** The same pair, read off one Findings row's own verdict word (its text colour carries the
   *  verdict's tone, ledger-rows.css `.fc-verdict`). */
  verdictPrintStyle(pkg: string, verdict: string): Promise<{ color: string; printColorAdjust: string }>;

  pressSlash(): Promise<void>;
  pressQuestion(): Promise<void>;
  pressEscape(): Promise<void>;
  pressJ(): Promise<void>;
  pressK(): Promise<void>;
}

export function createReportPage(page: Page): Promise<ReportPage> {
  return Promise.resolve(new NewReportPage(page));
}
