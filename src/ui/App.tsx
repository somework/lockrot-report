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
import { decideKey, findRow, keyInputFrom, prevents, type KeyDecision } from "./keyboard";
import { Ledger } from "./ledger/Ledger";
import { NewerSchemaBanner } from "./NewerSchemaBanner";
import { Rail } from "./rail/Rail";
import { SearchBar } from "./search/SearchBar";
import { tabId, Tabs } from "./Tabs";
import { useHashState } from "./useHashState";
import { useTheme } from "./useTheme";
import { useNarrow, useWide } from "./useWide";
import { CurrentView } from "./views/Views";
import { renderedPackages } from "./views/order";
import "./app.css";
import "../styles/print.css";

/** A row to focus (after closing its detail) or scroll to (after `j`/`k`) once the list re-renders. */
type RowRequest = { pkg: string; focus: boolean } | null;

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
  rowRequest: { current: RowRequest };
}

/** Carries out what keyboard.ts decided. */
function applyKey(decision: KeyDecision, deps: ShortcutDeps): void {
  const { dispatch, search, openGlossary, setGlossaryOpen, rowRequest } = deps;
  switch (decision.type) {
    case "toggleRow":
      dispatch({ type: "select", pkg: decision.pkg });
      break;
    case "move":
      rowRequest.current = { pkg: decision.pkg, focus: false };
      dispatch({ type: "select", pkg: decision.pkg });
      break;
    case "closeDetail":
      rowRequest.current = { pkg: decision.restore, focus: true };
      dispatch({ type: "select", pkg: null });
      break;
    case "focusSearch":
      search.current?.focus();
      break;
    case "blurSearch":
      search.current?.blur();
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
          rendered: () => renderedPackages(model, state, state.view),
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
function LedgerSlot({ narrow }: { narrow: boolean }) {
  return (
    <div className="ledger-band">
      <Ledger narrow={narrow} />
    </div>
  );
}

/** The rail beside the list, or on phone widths a "Filters" disclosure above it. */
function RailSlot({ narrow }: { narrow: boolean }) {
  const { state } = useReport();
  if (!narrow) {
    return (
      <div className="shell-rail">
        <Rail />
      </div>
    );
  }
  const { scope, signal, fix, since } = state.filters;
  const on = scope.length + signal.length + fix.length + since.length;

  return (
    <details className="rail-fold">
      <summary>Filters{on > 0 && <span className="muted"> · {on} on</span>}</summary>
      <Rail />
    </details>
  );
}

/** The page: state, address bar, layout, theme, keyboard (DESIGN.md §4, §5, §8). */
export function App({ model }: { model: Model }) {
  const wide = useWide();
  const narrow = useNarrow();
  const [state, dispatch] = useHashState(model, wide);
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
  const rowRequest = useRef<RowRequest>(null);
  const idBase = useId();
  useShortcuts({ model, state, dispatch, search, glossaryOpen, openGlossary, setGlossaryOpen, rowRequest });

  // A tab switch a reader clicked (or the quiet note's "See the advisories") used to leave the
  // page's scroll wherever it was on the tab just left — a Findings list scrolled down to
  // "hoa/compiler" handed the next tab's much shorter content the same scroll offset, landing mid
  // list with no sign why. `dispatchTracked` marks every `"view"` action this ref sees; the effect
  // below fires only for those, never for the boot pick or a `hashchange` restore (`useHashState`
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
  const dispatchTracked = useCallback(
    (action: Action) => {
      if (action.type === "view" && action.view !== currentView.current) tabChangedByReader.current = true;
      dispatch(action);
    },
    [dispatch],
  );

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
  // between would have it pulled back to the closed package's row.
  useLayoutEffect(() => {
    const request = rowRequest.current;
    rowRequest.current = null;
    const row = request === null ? null : findRow(document, request.pkg);
    if (request?.focus) row?.focus();
    else if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [state]);

  // Scroll is locked only while a sheet actually covers the page (DESIGN.md §5 M13).
  const sheet = state.pkg !== null && !wide;
  useEffect(() => {
    document.body.classList.toggle("detail-open", sheet);
    return () => {
      document.body.classList.remove("detail-open");
    };
  }, [sheet]);

  const closeDetail = useCallback(() => {
    if (state.pkg !== null) rowRequest.current = { pkg: state.pkg, focus: true };
    dispatch({ type: "select", pkg: null });
  }, [state.pkg, dispatch]);

  // `.shell-detail` is the one element that scrolls (DESIGN.md §8); it stays mounted across a
  // package switch, so without this its scroll position would carry over from the package the
  // reader just left instead of starting the new one at the top (PD-DETAIL-3).
  const detailScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailScrollRef.current?.scrollTo(0, 0);
  }, [state.pkg]);

  const now = useMemo(() => new Date(model.report.generatedAt), [model]);
  const value = useMemo(
    () => ({ model, state, dispatch: dispatchTracked, now, wide, openGlossary, openGlossaryFrom }),
    [model, state, dispatchTracked, now, wide, openGlossary, openGlossaryFrom],
  );
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

  return (
    <ReportContext.Provider value={value}>
      <NewerSchemaBanner />
      <Header theme={theme.effective} onToggleTheme={theme.toggle} onOpenGlossary={openGlossary}>
        <Tabs idBase={idBase} panelId={panelId} />
      </Header>
      {state.view !== "run" && <LedgerSlot narrow={narrow} />}
      <main className={shellClass}>
        {filterable && <RailSlot narrow={narrow} />}
        <div className="shell-main" id={panelId} role="tabpanel" aria-labelledby={tabId(idBase, state.view)}>
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
      </main>
      <Footer />
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
