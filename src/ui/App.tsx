import "../styles/tokens.css";
import "../styles/base.css";
import type { RefObject } from "preact";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { fitFilters2, population2, renderedPackages2 } from "../domain/list";
import { skipLinkLabel } from "../domain/pageVocabulary";
import type { Model } from "../model/types";
import type { Action, State } from "../state/types";
import { ReportContext, useReport } from "./context";
import { Detail2 } from "./report/Detail";
import { FindingsStrip } from "./report/FindingsView";
import { Footer } from "./Footer";
import { Glossary, type GlossaryAt } from "./Glossary";
import { Header } from "./Header";
import { decideKey, findRow, keyInputFrom, prevents, rowAt, rowPosition, type KeyDecision } from "./keyboard";
import { NewerSchemaBanner } from "./NewerSchemaBanner";
import { Rail } from "./rail/Rail";
import { anchorShift, measureRow, roomBelow, type RowAnchor } from "./rowAnchor";
import { usePrintDocument } from "./print/usePrintDocument";
import { pickCursor } from "./rowCursor";
import { SearchBar } from "./search/SearchBar";
import { tabId, Tabs } from "./Tabs";
import { useHashState } from "./useHashState";
import { useShell } from "./useShell";
import { useTheme } from "./useTheme";
import { useNarrow, useRailRoom, useWide } from "./useWide";
import { CurrentView } from "./views/Views";
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
  /** The "?" key's open, with no term to highlight (PD-GLOSSARY-7): the "Keys and search" section
   *  unfolded and in view, where the search box's hint points. */
  openGlossaryKeys: () => void;
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
  const { dispatch, search, openGlossaryKeys, setGlossaryOpen, focusRequest, lastRow } = deps;
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
    case "focusRow": {
      const row = rowAt(document, decision.pkg, decision.index);
      if (row !== null) {
        focusRow(row);
        lastRow.current = { pkg: decision.pkg, index: decision.index };
      }
      break;
    }
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
      openGlossaryKeys();
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
    const root = document.documentElement;
    root.style.removeProperty("--anchor-room");
    const shift = anchorShift(document, anchor.current);
    anchor.current = null;
    if (shift === 0) return;
    const room = roomBelow(shift, window.scrollY, root.scrollHeight - window.innerHeight);
    if (room > 0) root.style.setProperty("--anchor-room", `${Math.ceil(room)}px`);
    window.scrollBy(0, shift);
  }, []);

  return [anchored, keepInPlace];
}

/** Laid out, and wholly between the sticky header and the viewport's bottom edge. */
function inFullView(row: HTMLElement): boolean {
  const box = row.getBoundingClientRect();
  const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  return box.height > 0 && box.top >= header && box.bottom <= window.innerHeight;
}

/** One document keydown listener that reads the latest page state through a ref. A layout effect,
 *  so a key pressed as soon as the page has loaded already reaches it. */
function useShortcuts(deps: ShortcutDeps) {
  const latest = useRef(deps);
  latest.current = deps;

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      const { model, state } = current;
      const decision = decideKey(
        keyInputFrom(event, {
          search: current.search.current,
          dialogOpen: current.glossaryOpen,
          selected: state.pkg,
          rendered: () => renderedPackages2(model.report, state, state.view, current.narrow),
          sheetOpen: current.sheet,
          overview: state.view === "overview",
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

/** The rail beside the list, or a "Filters" disclosure above it: on narrow screens, and while an open
 *  package takes the width beside the list. */
function RailSlot({ folded, inert }: { folded: boolean; inert: boolean }) {
  const { state } = useReport();
  if (!folded) {
    return (
      <div className="shell-rail" inert={inert}>
        <Rail />
      </div>
    );
  }
  const { verdict, scope, signal, sev, fix, since, gate, flag, accepted } = state.filters;
  const on =
    verdict.length +
    scope.length +
    signal.length +
    sev.length +
    fix.length +
    since.length +
    gate.length +
    flag.length +
    accepted.length;

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
  const railRoom = useRailRoom();
  const fit = useCallback(
    (next: State): State => {
      const filters = fitFilters2(model.report, next.filters);
      // Overview lists no row, so it opens no package (PD-OVERVIEW-1).
      const pkg = next.view === "overview" ? null : next.pkg;
      return filters === next.filters && pkg === next.pkg ? next : { ...next, filters, pkg };
    },
    [model],
  );
  const [state, rawDispatch] = useHashState(fit);
  const [anchoredDispatch, keepRowInPlace] = useRowAnchor(rawDispatch, state.pkg);
  // Set by every package a reader opens (click, Enter, `j`/`k`), never by the boot address or a
  // `hashchange`: only a reader's own open moves focus into a sheet (PD-ROWS-12).
  const openedByReader = useRef(false);
  const dispatch = useCallback(
    (action: Action) => {
      if (action.type === "select" && action.pkg !== null) openedByReader.current = true;
      if (action.type === "focus" && action.pkg !== undefined) openedByReader.current = true;
      anchoredDispatch(action);
    },
    [anchoredDispatch],
  );
  const theme = useTheme();
  const [shell, pickShell] = useShell();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossaryAt, setGlossaryAt] = useState<GlossaryAt>("top");
  const openGlossary = useCallback(() => {
    setGlossaryAt("top");
    setGlossaryOpen(true);
  }, []);
  const openGlossaryKeys = useCallback(() => {
    setGlossaryAt("keys");
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
    () =>
      pickCursor(renderedPackages2(model.report, state, state.view, narrow), state.pkg, lastOpened.current),
    [model, state, narrow],
  );

  useShortcuts({
    model,
    state,
    dispatch,
    search,
    glossaryOpen,
    openGlossaryKeys,
    setGlossaryOpen,
    focusRequest,
    lastRow,
    sheet,
    cursor,
    narrow,
  });

  // Only a tab switch the reader dispatched scrolls to the top: the boot state and a `hashchange`
  // restore reach the reducer without a "view" action, so a pasted link keeps its scroll.
  const tabChangedByReader = useRef(false);
  // Tabs.tsx dispatches "view" for the open tab too, so the flag latches only when the view moves.
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

  // A "focus" action (an Overview chart mark, a Run data stat) lists a set counted a screen away:
  // the list's top, its search and "N of M" line, comes under the sticky header. The control
  // pressed has left the page with its tab, so focus goes to the new tab's panel, or to the row of
  // the package the link opened.
  useEffect(() => {
    if (!listFocused.current) return;
    listFocused.current = false;
    if (state.section !== null) return;
    const panel = document.getElementById(`${idBase}-panel`);
    if (typeof panel?.scrollIntoView === "function") panel.scrollIntoView({ block: "start" });
    const active = document.activeElement;
    if (active !== null && active !== document.body && document.contains(active)) return;
    const row = state.pkg === null ? null : findRow(document, state.pkg);
    if (row !== null && !sheet) focusRow(row);
    else panel?.focus({ preventScroll: true });
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

  // The `section` key opens Run data at that section, from a link, a pasted address or a
  // `hashchange` (SPEC §7.9.16). It does nothing when the run has no such section.
  useEffect(() => {
    if (state.view !== "run" || state.section === null) return;
    const heading = document.getElementById(state.section)?.querySelector<HTMLElement>("h3");
    if (heading == null) return;
    if (typeof heading.scrollIntoView === "function") heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
  }, [state.view, state.section]);

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

  // A `#pkg=` link opens its package on load (PD-ROWS-9) and brings its row into view, so Close hands
  // focus to a row on screen (PD-ROWS-10). A row already in full view under the header stays put, so
  // the strip above the list stays clear of the sticky header. Boot only: a link pasted into an open
  // page leaves the reader's scroll alone, as a restored tab does.
  useLayoutEffect(() => {
    const row = state.pkg === null ? null : findRow(document, state.pkg);
    if (typeof row?.scrollIntoView !== "function" || inFullView(row)) return;
    row.scrollIntoView({ block: "center" });
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

  const now = useMemo(() => new Date(model.report.generated_at), [model]);
  const value = useMemo(
    () => ({ model, state, dispatch: dispatchTracked, now, wide, cursor, openGlossary, shell, pickShell }),
    [model, state, dispatchTracked, now, wide, cursor, openGlossary, shell, pickShell],
  );
  // The printed report (print/PrintDocument.tsx): mounted into `printHost` only while the page prints.
  const printHost = useRef<HTMLDivElement>(null);
  usePrintDocument(printHost, value);
  const filterable = population2(model.report, state.view).length > 0;
  const panelId = `${idBase}-panel`;
  const detailOpen = state.pkg !== null;
  const railFolded = narrow || !railRoom || (detailOpen && wide);
  const shellClass = ["shell", filterable && !railFolded && "has-rail", detailOpen && wide && "has-detail"]
    .filter(Boolean)
    .join(" ");

  // `<main>` holds the summary band too: it is the report's content, and outside every landmark it
  // was the one part of the page a screen reader's landmark list could not reach (axe `region`).
  return (
    <ReportContext.Provider value={value}>
      {/* A link to the hash would route the page, so the skip moves focus itself: to the list's
          Tab stop row, else to the panel. */}
      <a
        className="skip-link"
        href={`#${panelId}`}
        inert={sheet}
        onClick={(event) => {
          event.preventDefault();
          const panel = document.getElementById(panelId);
          const row = panel?.querySelector<HTMLElement>('[data-pkg][tabindex="0"]');
          (row ?? panel)?.focus();
        }}
      >
        {skipLinkLabel(filterable)}
      </a>
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
        {state.view === "findings" && (
          <div className="ledger-band" inert={sheet}>
            <FindingsStrip />
          </div>
        )}
        <div className={shellClass}>
          {filterable && !railFolded && <RailSlot folded={false} inert={sheet} />}
          <div
            className="shell-main"
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId(idBase, state.view)}
            tabIndex={-1}
            inert={sheet}
          >
            {filterable && railFolded && <RailSlot folded inert={sheet} />}
            {/* SearchBar hides its own box and hint when the tab has nothing to filter, and keeps the
                count line, which a clean report still shows. Overview lists nothing to count. */}
            {state.view !== "overview" && <SearchBar inputRef={search} />}
            <CurrentView />
          </div>
          {state.pkg !== null && (
            <div ref={detailScrollRef} className={wide ? "shell-detail is-side" : "shell-detail is-sheet"}>
              <Detail2 onClose={closeDetail} />
            </div>
          )}
        </div>
      </main>
      <Footer inert={sheet} />
      <Glossary
        open={glossaryOpen}
        at={glossaryAt}
        onClose={() => {
          setGlossaryOpen(false);
        }}
      />
    </ReportContext.Provider>
  );
}
