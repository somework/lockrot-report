/**
 * The single reducer that owns page state (DESIGN.md §4). Every interaction — tab switch, filter
 * toggle, search, sort, clear, package selection, and hash-restore at boot — goes through one of
 * these actions, so `writeHash()` only ever has to observe the result of a dispatch, never a raw
 * DOM mutation.
 *
 * Ported from `report.js`'s hand-written `state` object and its scattered mutation sites
 * (js-4.md §1, §2, §7a). The legacy code stores each filter group as a plain object of
 * `{ [key]: true | false }` and never deletes a toggled-off key (critic.md C3); this port instead
 * keeps only the *selected* keys, in selection order, per DESIGN's `Filters` type — functionally
 * equivalent (every legacy reader tests truthiness) but avoids ever-growing objects of stale
 * `false` entries.
 */
import type { Action, Filters, State } from "./types";
import { EMPTY_FILTERS } from "./types";

/** Add `key` to `group` if absent, keeping the existing order; remove it if present. */
function toggleFilterKey(filters: Filters, group: keyof Filters, key: string): Filters {
  const current = filters[group];
  const has = current.includes(key);
  const next = has ? current.filter((k) => k !== key) : [...current, key];
  return { ...filters, [group]: next };
}

/**
 * `select(pkg)` (js-4.md §2) is the one chokepoint that opens/closes the detail pane — row click,
 * keyboard, `data-open`, closing. The legacy page also had a boot-time auto-open that bypassed it
 * (its `pkgAuto` flag); this page never opens a package by itself (PD-ROWS-9), so every open
 * package is the reader's and always reaches the address bar.
 */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "view": {
      // A tab switch always force-closes the detail pane (js-4.md §7a.1); `data-goto` is the one
      // caller that wants the tab to change while the open detail survives (js-4.md §7a.4), hence
      // `keepDetail`.
      const keepDetail = action.keepDetail ?? false;
      return {
        ...state,
        view: action.view,
        pkg: keepDetail ? state.pkg : null,
      };
    }

    case "query":
      return { ...state, q: action.q };

    case "toggle":
      return { ...state, filters: toggleFilterKey(state.filters, action.group, action.key) };

    case "clear":
      // Clear resets the search box and every filter group, and nothing else (js-4.md §7a.10):
      // view, pkg, sort and sortDesc all survive a Clear click.
      return { ...state, q: "", filters: EMPTY_FILTERS };

    case "sort": {
      // Clicking the already-active column flips direction; a different column becomes the sort
      // key and always resets to ascending (js-4.md §7a.3).
      const sameKey = state.sort === action.key;
      return { ...state, sort: action.key, sortDesc: sameKey ? !state.sortDesc : false };
    }

    case "select":
      return { ...state, pkg: action.pkg };

    case "disclose":
      return { ...state, disclosure: { ...state.disclosure, [action.key]: action.open } };

    case "restore":
      return action.state;
  }
}
