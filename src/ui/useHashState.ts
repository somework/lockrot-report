import { useEffect, useReducer, useRef } from "preact/hooks";
import { HashSync, parseHash } from "../state/hash";
import { reducer } from "../state/reducer";
import { INITIAL_STATE, type Action, type State } from "../state/types";

/** What this report can list: drops what an address asks for that it has no rows for. */
export type StateFit = (state: State) => State;

const AS_IS: StateFit = (state) => state;

/**
 * The state the page opens in: the address, and nothing else. A `pkg=` in it opens that package on
 * load at every width; without one no package is open, so on a wide screen the Findings list takes
 * the full width until the reader opens a row (PD-ROWS-9). The legacy page opened the first flagged
 * package by itself on a wide screen (report.js:1133); this page does not.
 */
export function bootState(hash: string, fit: StateFit = AS_IS): State {
  return fit(parseHash(hash, INITIAL_STATE));
}

/**
 * The state a link pasted into an open page asks for (DESIGN.md §4: the legacy page ignored
 * `hashchange`). The address carries no sort order and no open Blast radius rows, so those keep
 * what the reader chose; everything the address does carry replaces what was there instead of adding
 * to it.
 */
export function stateFromHashChange(hash: string, current: State, fit: StateFit = AS_IS): State {
  return fit(
    parseHash(hash, {
      ...INITIAL_STATE,
      sort: current.sort,
      sortDesc: current.sortDesc,
      disclosure: current.disclosure,
    }),
  );
}

/**
 * Page state, owned by one reducer and mirrored into the address bar after every change. Writing
 * uses `history.replaceState`, which never fires `hashchange`, so the page does not hear its own
 * writes; one `HashSync` per page carries the latch that stops writing for good in a frame that
 * forbids it (state/hash.ts).
 */
export function useHashState(fit: StateFit = AS_IS): [State, (action: Action) => void] {
  const [state, dispatch] = useReducer(reducer, window.location.hash, (hash) => bootState(hash, fit));
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const sync = useRef<HashSync | null>(null);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    sync.current ??= new HashSync();
    sync.current.writeHash(state, window);
  }, [state]);

  useEffect(() => {
    const onHashChange = () => {
      dispatch({
        type: "restore",
        state: stateFromHashChange(window.location.hash, latest.current, fitRef.current),
      });
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return [state, dispatch];
}
