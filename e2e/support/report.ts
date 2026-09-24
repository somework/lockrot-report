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

  ledgerButton(group: LedgerGroup, key: string): Promise<void>;
  /** null when the button carries no pressed-state at all for assistive tech (M17, legacy). */
  ledgerButtonPressed(group: LedgerGroup, key: string): Promise<boolean | null>;
  /** The tooltip on "Priority of the N flagged packages" (M29). */
  priorityLedgerTooltip(): Promise<string | null>;

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

  pressSlash(): Promise<void>;
  pressQuestion(): Promise<void>;
  pressEscape(): Promise<void>;
  pressJ(): Promise<void>;
  pressK(): Promise<void>;
}

export function createReportPage(page: Page): Promise<ReportPage> {
  return Promise.resolve(new NewReportPage(page));
}
