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
  /** A single click on the row/card/button that represents this package, whatever the page's
   *  native toggle semantics are for it (a Findings/Packages row toggles; a `data-open` button
   *  always opens). */
  clickPackage(name: string): Promise<void>;
  /** Ensures the detail pane ends up open on this package, regardless of toggle semantics. */
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
  /** Whether the row for this package can receive keyboard focus at all (M6). */
  rowFocusable(name: string): Promise<boolean>;
  /** Whether the row is marked as the current selection for assistive tech (M6). */
  rowSelected(name: string): Promise<boolean>;
  /** Moves keyboard focus onto the row/card for this package, without clicking it. */
  focusRow(name: string): Promise<void>;
  /** The package name of whichever row/card currently holds keyboard focus, or null. */
  focusedRowName(): Promise<string | null>;
  /** Presses Enter on whatever currently holds focus. */
  pressEnter(): Promise<void>;
  /** Moves keyboard focus onto the first outbound link inside a package's row (e.g. a signal-id
   *  link or the Packagist link) without clicking it, so a spec can then press Enter on it (M5). */
  focusLinkInRow(name: string): Promise<void>;
  /** The accessible name (e.g. "S2") of every signal-id link inside a Findings row, in document
   *  order — a Findings row carries no other link, so this doubles as "how many signal lines this
   *  row draws" (PD-ROWS-1, DESIGN.md §5: exactly one, the row's own key fact). */
  rowSignalIds(name: string): Promise<string[]>;
  /** The row's "+N more signal(s), open the package" note, or null when the row shows none — one
   *  signal, or none at all (PD-ROWS-1). */
  rowMoreSignalsText(name: string): Promise<string | null>;
  /** The row's age scale (`role="img"`) accessible name, or null when the row draws no scale at
   *  all (PD-ROWS-2, DESIGN.md §5). */
  rowAgeScaleLabel(name: string): Promise<string | null>;
  /** The row's age scale's own `title` — the same text as `rowAgeScaleLabel`, on hover rather than
   *  only for assistive tech (PD-ROWS-3, DESIGN.md §5: the scale's two threshold ticks otherwise
   *  show a reader nothing to hover). Null on the same terms as `rowAgeScaleLabel`. */
  rowAgeScaleTitle(name: string): Promise<string | null>;
  /** The once-per-list caption naming the run's own age thresholds (PD-ROWS-3, DESIGN.md §5),
   *  e.g. "age scale: warn 3 y high 5 y" (a11y review: the tick between each pair is a CSS-drawn
   *  bar, not a text glyph, so it contributes nothing to this string) — or null when the current tab
   *  draws no age scale at all, and the caption is not rendered. */
  ageScaleLegendText(): Promise<string | null>;
  /** The same caption's own accessible name (a11y review, PD-ROWS-3): the `role="img"`/`aria-label`
   *  pairing a row's own age scale already uses, spelling the unit out in full ("age scale: warn at
   *  N years, high at N years") rather than the short "y" form `ageScaleLegendText` reads, and with
   *  no tick glyph in it at all for the same reason `rowAgeScaleLabel` carries none either. Null on
   *  the same terms as `ageScaleLegendText`. */
  ageScaleLegendAccessibleName(): Promise<string | null>;
  /** Whether the row's "+N more…" note is currently on screen (PD-ROWS-1, DESIGN.md §5: print
   *  hides it once every signal already prints). */
  rowMoreSignalsVisible(name: string): Promise<boolean>;
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
  /** Whether the once-per-list legend's own tick (`.age-scale-legend-tick`, `AgeScaleLegend`) paints
   *  a colour distinct from the page background in forced-colors mode — the same failure
   *  `ageScaleForcedColorsVisible` already proves fixed for a row's own ticks, missed here because
   *  the legend draws its tick from a different rule (`views.css`) that carried no forced-colors
   *  override of its own. Null when the current tab draws no legend at all (`ageScaleLegendText`'s
   *  own null case). */
  ageScaleLegendTickForcedColorsVisible(): Promise<boolean | null>;

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
  /** The tooltip on "Priority of the N flagged packages" (M29). */
  priorityLedgerTooltip(): Promise<string | null>;
  /** Whether the priority-counts line — the wide band above the ledger, or the phone fold's
   *  `<summary>` at a narrow width, whichever the viewport currently renders (App.tsx#LedgerSlot,
   *  SummaryBand.tsx) — contains this exact wording. The line spans several sibling elements (one
   *  per priority), so no single element carries the whole sentence as its own text; the caller
   *  passes the wording it expects rather than this reading it back. */
  hasSummaryLine(text: string): Promise<boolean>;
  /** Whether the phone fold's own `<summary>` (App.tsx#LedgerSlot) carries a visible, non-empty
   *  priority bar of its own (PD-SUMMARY-5, DESIGN.md §5) — `false` on a wide screen, where the
   *  fold does not render at all, the same as `false` for a clean report with nothing to bar. */
  hasSummaryPriorityBar(): Promise<boolean>;

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

  /** Clicks a Packages-table column header once (toggles direction on a repeat click). */
  sortBy(key: string): Promise<void>;
  sortState(): Promise<SortState | null>;

  /**
   * The Blast radius card for one direct requirement: the count it states ("N flagged packages
   * underneath") against how many rows it actually lists — M24/M25's exact disagreement. Null when
   * no such card is rendered.
   */
  radiusCard(parent: string): Promise<{ statedCount: number | null; listedCount: number } | null>;

  openGlossary(): Promise<void>;
  closeGlossaryButton(): Promise<void>;
  isGlossaryOpen(): Promise<boolean>;
  glossaryText(): Promise<string>;
  /** The CSS `position` the glossary computes to — `fixed` for an always-in-view overlay, whatever
   *  the browser's UA stylesheet gives a non-modal `<dialog>` otherwise (M28). */
  glossaryPosition(): Promise<string>;

  /** Clicks a verdict pill (the word, in its row) — PD-GLOSSARY-4/5. On a Findings row this must
   *  open the pill's popover without also opening or closing the row's own detail. */
  clickVerdictPill(pkg: string, verdict: string): Promise<void>;
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

  /** Whether the page currently prevents the document from scrolling (M13's stuck state). */
  isScrollLocked(): Promise<boolean>;
  /** The embedded bundle's top-level keys, from `#lockrot-data` — contract item 7 in history.md. */
  bundleKeys(): Promise<string[]>;

  /** Whether the tab bar (the clearest piece of "app chrome", present on every fixture) is
   *  visible under the current media — used to check that print styling hides interactive chrome. */
  isNavigationVisible(): Promise<boolean>;

  /** The verdict-distribution bar's first segment (Ledger.tsx's `role=img, name="Verdict
   *  distribution"`): its computed background colour, and the computed `print-color-adjust` (or
   *  its `-webkit-` form) that keeps that colour once an actual print applies Chromium's
   *  ink-saving default — a plain screenshot never exercises that default, so the property itself
   *  is what a print test can assert on (print.css). */
  ledgerSegmentPrintStyle(): Promise<{ backgroundColor: string; printColorAdjust: string }>;
  /** The same pair, read off one Findings row's own verdict pill (its border colour carries the
   *  pill's tone, styles/base.css `.pill`). */
  pillPrintStyle(pkg: string, verdict: string): Promise<{ borderColor: string; printColorAdjust: string }>;

  pressSlash(): Promise<void>;
  pressQuestion(): Promise<void>;
  pressEscape(): Promise<void>;
  pressJ(): Promise<void>;
  pressK(): Promise<void>;
}

export function createReportPage(page: Page): Promise<ReportPage> {
  return Promise.resolve(new NewReportPage(page));
}
