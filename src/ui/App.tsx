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
import { SummaryBand, SummaryCounts } from "./ledger/SummaryBand";
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
  setGlossaryOpen: (open: boolean) => void;
  rowRequest: { current: RowRequest };
}

/** Carries out what keyboard.ts decided. */
function applyKey(decision: KeyDecision, deps: ShortcutDeps): void {
  const { dispatch, search, setGlossaryOpen, rowRequest } = deps;
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
      setGlossaryOpen(true);
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
 * Phone widths get the ledger as a one-line summary that unfolds (DESIGN.md §8). Both the wide
 * band and the folded `<summary>` show the same priority-counts line (`SummaryCounts`), so a
 * phone reader sees it without unfolding anything; the fold keeps the "Summary" eyebrow the
 * "Filters" disclosure beside it also carries.
 */
function LedgerSlot({ narrow }: { narrow: boolean }) {
  if (!narrow) {
    return (
      <div className="ledger-band">
        <SummaryBand />
        <Ledger />
      </div>
    );
  }

  return (
    <details className="ledger-fold">
      {/* One extra span around SummaryCounts: `.ledger-fold > summary` is a flex row with no
          wrap (app.css), and SummaryCounts renders several sibling spans (one per priority) —
          left bare, each would be its own flex item and the row could not wrap at all at 320px.
          Wrapped, it is one flex item whose own inline content wraps normally. */}
      <summary>
        <span className="eyebrow">Summary</span>{" "}
        <span>
          <SummaryCounts />
        </span>
      </summary>
      <Ledger />
    </details>
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
  const search = useRef<HTMLInputElement>(null);
  const rowRequest = useRef<RowRequest>(null);
  const idBase = useId();
  useShortcuts({ model, state, dispatch, search, glossaryOpen, setGlossaryOpen, rowRequest });

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
  const value = useMemo(() => ({ model, state, dispatch, now, wide }), [model, state, dispatch, now, wide]);
  const filterable = population(model, state.view).length > 0;
  const panelId = `${idBase}-panel`;

  return (
    <ReportContext.Provider value={value}>
      <NewerSchemaBanner />
      <Header
        theme={theme.effective}
        onToggleTheme={theme.toggle}
        onOpenGlossary={() => {
          setGlossaryOpen(true);
        }}
      >
        <Tabs idBase={idBase} panelId={panelId} />
      </Header>
      {state.view !== "run" && <LedgerSlot narrow={narrow} />}
      <main className={filterable ? "shell" : "shell no-rail"}>
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
        onClose={() => {
          setGlossaryOpen(false);
        }}
      />
    </ReportContext.Provider>
  );
}
