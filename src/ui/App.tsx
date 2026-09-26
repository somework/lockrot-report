import "../styles/tokens.css";
import "../styles/base.css";
import type { RefObject } from "preact";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { population } from "../domain/filters";
import type { Model } from "../model/types";
import type { Action, State } from "../state/types";
import { ReportContext, useReport } from "./context";
import { Detail } from "./detail/Detail";
import { Footer } from "./Footer";
import { Glossary } from "./Glossary";
import { Header } from "./Header";
import { decideKey, findRow, keyInputFrom, prevents, rowAt, rowPosition, type KeyDecision } from "./keyboard";
import { Ledger } from "./ledger/Ledger";
import { NewerSchemaBanner } from "./NewerSchemaBanner";
import { Rail } from "./rail/Rail";
import { anchorShift, measureRow, type RowAnchor } from "./rowAnchor";
import { usePrintDocument } from "./print/usePrintDocument";
import { pickCursor } from "./rowCursor";
import { SearchBar } from "./search/SearchBar";
import { tabId, Tabs } from "./Tabs";
import { useHashState } from "./useHashState";
import { useTheme } from "./useTheme";
import { useNarrow, useWide } from "./useWide";
import { CurrentView } from "./views/Views";
import { renderedPackages } from "./views/order";
import "./app.css";
import "../styles/print.css";

/** Where focus goes once the page re-renders: the row `j`/`k` just walked to, or the one Close or
 *  Escape just closed — by name and position, since a package can have two rows — or the search box
 *  a `/` closed the sheet for (PD-ROWS-12). */
type FocusRequest = { kind: "row"; pkg: string; index: number | null } | { kind: "search" } | null;

/** Which row the reader last acted on: the package, and which of its rows (its position). */
interface RowSpot {
  pkg: string;
  index: number | null;
}

/** The row to hand focus back to for `pkg`: the one the reader last acted on, when it was one of
 *  `pkg`'s rows; else `pkg`'s first. */
function rowRequestFor(pkg: string, last: RowSpot | null): FocusRequest {
  return { kind: "row", pkg, index: last?.pkg === pkg ? last.index : null };
}

/** How a row `j`/`k` walk to is brought into view: glided, unless the reader asked the system for
 *  less motion. Explicit, not the page's CSS `scroll-behavior`: that would also glide the instant
 *  `scrollBy` that keeps a reflowed row in place (PD-ROWS-10), which must land before paint. */
function rowScrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

/** Focuses a row and brings it into view with the least movement. `nearest`: a `j` that walks past
 *  the screen's edge moves the page by a row, not a screen, and a row already on screen does not
 *  move at all. `html`'s `scroll-padding-top` (ui/app.css) keeps it clear of the sticky header. */
function focusRow(row: HTMLElement): void {
  row.focus({ preventScroll: true });
  if (typeof row.scrollIntoView === "function")
    row.scrollIntoView({ block: "nearest", behavior: rowScrollBehavior() });
}

/**
 * Puts focus at the top of a detail sheet (PD-ROWS-12): its heading, or the missing-package panel's
 * Close. The row that opened the sheet sits under it, so a ring left there would be out of sight
 * (WCAG 2.4.11). Re-focused even when it already holds focus — `j` changes the package it names in
 * place — so a screen reader announces the package the sheet now shows.
 */
function focusSheet(sheet: HTMLElement | null): void {
  const target = sheet?.querySelector<HTMLElement>("[data-detail-focus]") ?? sheet?.querySelector("button");
  if (target === null || target === undefined) return;
  if (document.activeElement === target) target.blur();
  target.focus({ preventScroll: true });
}

/** Focus sits somewhere a sheet covers: not on the page itself, not in the sheet. */
function focusCovered(sheet: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || active === document.documentElement) return false;

  return sheet === null || !sheet.contains(active);
}

interface ShortcutDeps {
  model: Model;
  state: State;
  dispatch: (action: Action) => void;
  search: RefObject<HTMLInputElement>;
  glossaryOpen: boolean;
  /** Opens with no term to highlight — the "?" shortcut, unlike a verdict pill's "In the glossary",
   *  never names one (PD-GLOSSARY-7, DESIGN.md §5). Also clears whatever term a previous open left
   *  behind, the same reset `Header`'s own glossary button already gets through this callback. */
  openGlossary: () => void;
  setGlossaryOpen: (open: boolean) => void;
  focusRequest: { current: FocusRequest };
  lastRow: { current: RowSpot | null };
  /** The detail is a sheet over the whole page. */
  sheet: boolean;
  /** The list's Tab stop (`rowCursor.ts`). */
  cursor: string | null;
  /** Phone widths, where Blast radius starts its one-each rows folded. */
  narrow: boolean;
}

/** Carries out what keyboard.ts decided. */
function applyKey(decision: KeyDecision, deps: ShortcutDeps): void {
  const { dispatch, search, openGlossary, setGlossaryOpen, focusRequest, lastRow } = deps;
  switch (decision.type) {
    case "openRow":
      dispatch({ type: "select", pkg: decision.pkg });
      break;
    case "move":
      // Focus follows the package `j`/`k` open, as it stays on a row that was clicked: the ring is
      // on the row whose package is now open, so the Enter that follows opens that same row, never
      // the one clicked before the walk (PD-ROWS-11, M5). Under a sheet it goes to the sheet.
      focusRequest.current = { kind: "row", pkg: decision.pkg, index: decision.index };
      dispatch({ type: "select", pkg: decision.pkg });
      break;
    case "closeDetail":
      // Null when Escape was typed in the search box: the detail closes, the caret stays.
      focusRequest.current =
        decision.restore === null ? null : rowRequestFor(decision.restore, lastRow.current);
      dispatch({ type: "select", pkg: null });
      break;
    case "focusSearch":
      if (decision.closeDetail) {
        // The box is under the sheet: close the sheet, then focus the box once it is out (PD-ROWS-12).
        focusRequest.current = { kind: "search" };
        dispatch({ type: "select", pkg: null });
      } else {
        search.current?.focus();
      }
      break;
    case "blurSearch":
      leaveSearch(deps);
      break;
    case "openGlossary":
      openGlossary();
      break;
    case "closeGlossary":
      setGlossaryOpen(false);
      break;
    case "ignore":
      break;
  }
}

/**
 * Escape from the search box, with nothing open: focus goes to the list's Tab stop, the row the
 * reader last acted on, rather than to the page itself — from where Tab started again at the top of
 * the page and `j` had no row to go on from (PD-ROWS-12). A tab with no rows just blurs the box.
 */
function leaveSearch({ search, cursor, lastRow }: ShortcutDeps): void {
  const last = lastRow.current;
  const row = cursor === null ? null : rowAt(document, cursor, last?.pkg === cursor ? last.index : null);
  if (row === null) {
    search.current?.blur();
    return;
  }
  focusRow(row);
}

/**
 * Wraps `dispatch` so every `select` measures the row it is about first — the row it opens, or the
 * open one it closes — and returns, with it, the call that scrolls the page by however far that
 * row moved once the new layout is in (PD-ROWS-10, `rowAnchor.ts`). A click, Enter, `j`/`k`, Close
 * and Escape all go through here; the boot state and a `hashchange` restore never do.
 */
function useRowAnchor(
  dispatch: (action: Action) => void,
  openPkg: string | null,
): [(action: Action) => void, () => void] {
  const anchor = useRef<RowAnchor | null>(null);
  const open = useRef(openPkg);
  open.current = openPkg;
  const anchored = useCallback(
    (action: Action) => {
      if (action.type === "select") anchor.current = measureRow(document, action.pkg ?? open.current);
      dispatch(action);
    },
    [dispatch],
  );
  const keepInPlace = useCallback(() => {
    const shift = anchorShift(document, anchor.current);
    anchor.current = null;
    if (shift !== 0) window.scrollBy(0, shift);
  }, []);

  return [anchored, keepInPlace];
}

/** One document keydown listener that reads the latest page state through a ref. */
function useShortcuts(deps: ShortcutDeps) {
  const latest = useRef(deps);
  latest.current = deps;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      const { model, state } = current;
      const decision = decideKey(
        keyInputFrom(event, {
          search: current.search.current,
          dialogOpen: current.glossaryOpen,
          selected: state.pkg,
          rendered: () => renderedPackages(model, state, state.view, current.narrow),
          sheetOpen: current.sheet,
        }),
      );
      if (prevents(decision)) event.preventDefault();
      applyKey(decision, current);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

/**
 * The summary band (DESIGN.md §8): the lead — how many packages are flagged — at every width; on a
 * phone only the supporting tier under it folds (`Ledger`'s `narrow`), so a phone reader gets the
 * answer without a tap and the list still starts right under it.
 */
function LedgerSlot({ narrow, inert }: { narrow: boolean; inert: boolean }) {
  return (
    <div className="ledger-band" inert={inert}>
      <Ledger narrow={narrow} />
    </div>
  );
}

/** The rail beside the list, or on phone widths a "Filters" disclosure above it. */
function RailSlot({ narrow, inert }: { narrow: boolean; inert: boolean }) {
  const { state } = useReport();
  if (!narrow) {
    return (
      <div className="shell-rail" inert={inert}>
        <Rail />
      </div>
    );
  }
  const { scope, signal, fix, since } = state.filters;
  const on = scope.length + signal.length + fix.length + since.length;

  return (
    <details className="rail-fold" inert={inert}>
      <summary>Filters{on > 0 && <span className="muted"> · {on} on</span>}</summary>
      <Rail />
    </details>
  );
}

/** The page: state, address bar, layout, theme, keyboard (DESIGN.md §4, §5, §8). */
export function App({ model }: { model: Model }) {
  const wide = useWide();
  const narrow = useNarrow();
  const [state, rawDispatch] = useHashState();
  const [anchoredDispatch, keepRowInPlace] = useRowAnchor(rawDispatch, state.pkg);
  // Set by every package a reader opens (click, Enter, `j`/`k`), never by the boot address or a
  // `hashchange`: only a reader's own open moves focus into a sheet (PD-ROWS-12).
  const openedByReader = useRef(false);
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "select" && action.pkg !== null) openedByReader.current = true;
      anchoredDispatch(action);
    },
    [anchoredDispatch],
  );
  const theme = useTheme();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  // The verdict word "In the glossary" opens to, or null for the "?" shortcut and Header's own
  // button, which never name one (PD-GLOSSARY-7, DESIGN.md §5) — state, not a ref, since `Glossary`
  // reads it as a prop and needs the render it changes to see the new value.
  const [glossaryTerm, setGlossaryTerm] = useState<string | null>(null);
  // The element to return focus to once the glossary closes, read by `Glossary`'s own `useDialog`
  // in place of a freshly-read `document.activeElement` (a11y review: focus lost opening the
  // glossary from a pill popover). A ref, not state: setting it never needs its own render, only
  // to be in place before `glossaryOpen` flips true.
  const glossaryOpener = useRef<HTMLElement | null>(null);
  const openGlossary = useCallback(() => {
    glossaryOpener.current = null;
    setGlossaryTerm(null);
    setGlossaryOpen(true);
  }, []);
  const openGlossaryFrom = useCallback((returnTo: HTMLElement | null, term?: string) => {
    glossaryOpener.current = returnTo;
    setGlossaryTerm(term ?? null);
    setGlossaryOpen(true);
  }, []);
  const search = useRef<HTMLInputElement>(null);
  const focusRequest = useRef<FocusRequest>(null);
  const lastRow = useRef<RowSpot | null>(null);
  const idBase = useId();
  // `.shell-detail` is the one element that scrolls (DESIGN.md §8), and on a sheet the one place
  // focus can be (PD-ROWS-12).
  const detailScrollRef = useRef<HTMLDivElement>(null);
  // The detail is a sheet over the whole page below the wide layout (DESIGN.md §8): the header,
  // summary, rail, list and footer are all under it, and `inert` while it is.
  const sheet = state.pkg !== null && !wide;

  // The list's one Tab stop (PD-ROWS-11): the open package's row, else the one last opened — the
  // row Escape or Close just handed focus to — else the first. Written in the render body, like
  // `currentView` below: every change to it comes with a state change that renders anyway.
  const lastOpened = useRef<string | null>(state.pkg);
  if (state.pkg !== null) lastOpened.current = state.pkg;
  const cursor = useMemo(
    () => pickCursor(renderedPackages(model, state, state.view, narrow), state.pkg, lastOpened.current),
    [model, state, narrow],
  );

  useShortcuts({
    model,
    state,
    dispatch,
    search,
    glossaryOpen,
    openGlossary,
    setGlossaryOpen,
    focusRequest,
    lastRow,
    sheet,
    cursor,
    narrow,
  });

  // A tab switch a reader clicked (or the quiet note's "See the advisories") used to leave the
  // page's scroll wherever it was on the tab just left — a Findings list scrolled down to
  // "hoa/compiler" handed the next tab's much shorter content the same scroll offset, landing mid
  // list with no sign why. `dispatchTracked` marks every `"view"` action this ref sees; the effect
  // below fires only for those, never for the boot state or a `hashchange` restore (`useHashState`
  // reaches the reducer directly for both, through `restore`/the lazy initial state, and never
  // dispatches `"view"` at all), so a pasted link that restores a tab does not fight a reader's own
  // scroll position.
  const tabChangedByReader = useRef(false);
  // Tabs.tsx dispatches "view" even for the tab already selected (on purpose: it closes the open
  // detail), so the flag above must only latch when the view actually moves — comparing against a
  // ref, not `state.view` itself, keeps `dispatchTracked`'s identity tied to `dispatch` alone rather
  // than recreating it on every state change. Written directly in the render body: it is always
  // current before an event handler can fire, no effect needed. Missing this comparison left the
  // flag set after a same-tab click, so the *next* view change for any reason — including a
  // hashchange restore — scrolled to 0 regardless of who caused it (regression review).
  const currentView = useRef(state.view);
  currentView.current = state.view;
  const listFocused = useRef(false);
  const dispatchTracked = useCallback(
    (action: Action) => {
      if (action.type === "view" && action.view !== currentView.current) tabChangedByReader.current = true;
      if (action.type === "focus") listFocused.current = true;
      dispatch(action);
    },
    [dispatch],
  );

  // A "focus" action (the header's gate tally, a Run data count) lists a set it counted somewhere
  // else on the page, often a screen away from the list: the list's own top — the search box and
  // its "N of M" line — is brought under the sticky header so the reader sees what the press did.
  useEffect(() => {
    if (!listFocused.current) return;
    listFocused.current = false;
    const panel = document.getElementById(`${idBase}-panel`);
    if (typeof panel?.scrollIntoView === "function") panel.scrollIntoView({ block: "start" });
  }, [state]);

  useEffect(() => {
    if (!tabChangedByReader.current) return;
    tabChangedByReader.current = false;
    // The topbar (brand, run facts, tabs) is the page's first element and sticky from 760px up
    // (DESIGN.md §8), so it already sits at the top of the viewport the instant the page scrolls at
    // all; scrolling the window itself back to 0 is what puts the tab row and the new tab's own
    // first row directly under it, on every width.
    window.scrollTo(0, 0);
  }, [state.view]);

  // A layout effect, so the row is focused in the same task as the render that follows the key or
  // click. A plain effect waits for the next frame, and a reader (or a test) who moves focus in
  // between would have it pulled back to the closed package's row. The row the action was about is
  // put back where it was first (PD-ROWS-10), so the focus below never has to scroll to find it.
  useLayoutEffect(() => {
    keepRowInPlace();
    const request = focusRequest.current;
    focusRequest.current = null;
    const opened = openedByReader.current;
    openedByReader.current = false;
    // A clicked row holds focus: remember which of its package's rows it was.
    const active = document.activeElement;
    if (active instanceof HTMLElement && state.pkg !== null && active.getAttribute("data-pkg") === state.pkg)
      lastRow.current = { pkg: state.pkg, index: rowPosition(document, active) };

    if (request?.kind === "search") {
      search.current?.focus();
      return;
    }
    const row = request === null ? null : rowAt(document, request.pkg, request.index);
    if (row !== null && request !== null)
      lastRow.current = { pkg: request.pkg, index: rowPosition(document, row) };
    if (sheet) {
      // The row is under the sheet: focus goes to the sheet instead, on a reader's own open or
      // walk, or when it was left on something the sheet now covers (a resize below the wide
      // layout). Never over the glossary, which holds focus of its own.
      if (!glossaryOpen && (request !== null || opened || focusCovered(detailScrollRef.current)))
        focusSheet(detailScrollRef.current);
      return;
    }
    if (row !== null) focusRow(row);
  }, [state, sheet]);

  // A `#pkg=` link opens its package on load (PD-ROWS-9) — and now also brings its row into view:
  // the page used to open at the top with the open package's row thousands of pixels down, so Close
  // sent focus to a row off screen (PD-ROWS-10). Boot only: a link pasted into an open page leaves
  // the reader's scroll alone, as a restored tab does.
  useLayoutEffect(() => {
    const row = state.pkg === null ? null : findRow(document, state.pkg);
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
  }, []); // once, for the address the page booted with

  // Scroll is locked only while a sheet actually covers the page (DESIGN.md §5 M13).
  useEffect(() => {
    document.body.classList.toggle("detail-open", sheet);
    return () => {
      document.body.classList.remove("detail-open");
    };
  }, [sheet]);

  const closeDetail = useCallback(() => {
    if (state.pkg !== null) focusRequest.current = rowRequestFor(state.pkg, lastRow.current);
    dispatch({ type: "select", pkg: null });
  }, [state.pkg, dispatch]);

  // `.shell-detail` stays mounted across a package switch, so without this its scroll position would
  // carry over from the package the reader just left instead of starting the new one at the top
  // (PD-DETAIL-3).
  useEffect(() => {
    detailScrollRef.current?.scrollTo(0, 0);
  }, [state.pkg]);

  const now = useMemo(() => new Date(model.report.generatedAt), [model]);
  const value = useMemo(
    () => ({ model, state, dispatch: dispatchTracked, now, wide, cursor, openGlossary, openGlossaryFrom }),
    [model, state, dispatchTracked, now, wide, cursor, openGlossary, openGlossaryFrom],
  );
  // The printed report (print/PrintDocument.tsx): mounted into `printHost` only while the page prints.
  const printHost = useRef<HTMLDivElement>(null);
  usePrintDocument(printHost, value);
  const filterable = population(model, state.view).length > 0;
  const panelId = `${idBase}-panel`;
  // The detail's own grid column (`.shell`, ui/app.css) is static CSS and can't see that
  // `.shell-detail` below is unmounted while `state.pkg` is null — left alone, the wide layout kept
  // reserving that column's width with nothing in it, so the list column never grew to fill the
  // space a closed panel had freed (a walk found this on All packages and Blast radius at 1440).
  const detailOpen = state.pkg !== null;
  const shellClass = ["shell", !filterable && "no-rail", !detailOpen && "no-detail"]
    .filter(Boolean)
    .join(" ");

  // `<main>` holds the summary band too: it is the report's content, and outside every landmark it
  // was the one part of the page a screen reader's landmark list could not reach (axe `region`).
  return (
    <ReportContext.Provider value={value}>
      <NewerSchemaBanner inert={sheet} />
      <Header
        theme={theme.effective}
        onToggleTheme={theme.toggle}
        onOpenGlossary={openGlossary}
        inert={sheet}
      >
        <Tabs idBase={idBase} panelId={panelId} />
      </Header>
      {/* Empty on screen; print.css hides `<main>` while it holds the printed report. */}
      <div className="print-doc" ref={printHost} />
      <main>
        {state.view !== "run" && <LedgerSlot narrow={narrow} inert={sheet} />}
        <div className={shellClass}>
          {filterable && <RailSlot narrow={narrow} inert={sheet} />}
          <div
            className="shell-main"
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId(idBase, state.view)}
            inert={sheet}
          >
            {/* SearchBar hides its own box and hint when the tab has nothing to filter, and keeps the
                count line, which a clean report still shows. */}
            <SearchBar inputRef={search} />
            <CurrentView />
          </div>
          {state.pkg !== null && (
            <div ref={detailScrollRef} className={wide ? "shell-detail is-side" : "shell-detail is-sheet"}>
              <Detail onClose={closeDetail} />
            </div>
          )}
        </div>
      </main>
      <Footer inert={sheet} />
      <Glossary
        open={glossaryOpen}
        opener={glossaryOpener}
        highlightTerm={glossaryTerm}
        onClose={() => {
          setGlossaryOpen(false);
        }}
      />
    </ReportContext.Provider>
  );
}
