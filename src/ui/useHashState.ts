import { useEffect, useReducer, useRef } from "preact/hooks";
import { population } from "../domain/filters";
import type { Model } from "../model/types";
import { HashSync, parseHash } from "../state/hash";
import { reducer } from "../state/reducer";
import { INITIAL_STATE, type Action, type State } from "../state/types";
import { renderedPackages } from "./views/order";

/**
 * The package the page opens by itself on a wide screen, so the detail column is not empty at
 * first sight: the first row the Findings tab draws, or the first flagged finding when the address
 * filters every row away (legacy report.js:1133 always took the first flagged finding).
 */
export function bootPick(model: Model, state: State): string | null {
  return renderedPackages(model, state, "findings")[0] ?? population(model, "findings")[0]?.package ?? null;
}

/**
 * The state the page opens in, in the legacy boot order (critic.md R4, M16): the address first, the
 * layout second, the automatic pick last and only when the address named no package. The pick goes
 * through `autoSelect`, which marks it as the page's own so it never reaches the address bar.
 */
export function bootState(model: Model, hash: string, wide: boolean): State {
  const restored = parseHash(hash, INITIAL_STATE);
  if (restored.pkg !== null || !wide) return restored;
  const pick = bootPick(model, restored);

  return pick === null ? restored : reducer(restored, { type: "autoSelect", pkg: pick });
}

/**
 * The state a link pasted into an open page asks for (DESIGN.md §4: the legacy page ignored
 * `hashchange`). The address carries no sort order, so the table keeps the one the reader chose;
 * everything the address does carry replaces what was there instead of adding to it.
 */
export function stateFromHashChange(hash: string, current: State): State {
  return parseHash(hash, { ...INITIAL_STATE, sort: current.sort, sortDesc: current.sortDesc });
}

/**
 * Page state, owned by one reducer and mirrored into the address bar after every change. Writing
 * uses `history.replaceState`, which never fires `hashchange`, so the page does not hear its own
 * writes; one `HashSync` per page carries the latch that stops writing for good in a frame that
 * forbids it (state/hash.ts).
 */
export function useHashState(model: Model, wide: boolean): [State, (action: Action) => void] {
  const [state, dispatch] = useReducer(reducer, window.location.hash, (hash: string) =>
    bootState(model, hash, wide),
  );
  const sync = useRef<HashSync | null>(null);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    sync.current ??= new HashSync();
    sync.current.writeHash(state, window);
  }, [state]);

  useEffect(() => {
    const onHashChange = () => {
      dispatch({ type: "restore", state: stateFromHashChange(window.location.hash, latest.current) });
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return [state, dispatch];
}
