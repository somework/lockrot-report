/**
 * The URL fragment: read once at boot, written after every state change. The format is a
 * documented user feature (DESIGN.md §4, `docs/ci.md`) and must not change — it is ported byte-for-
 * byte from `report.js`'s `writeHash`/`readHash` (js-4.md §3a/§3b), with three deliberate fixes
 * (DESIGN.md §5, M12/§4): a fragment piece that fails to decode is skipped instead of blanking the
 * whole page, an unknown `view=` is ignored instead of falling through to the Run tab, and the
 * fallback URL keeps `location.search` instead of dropping it.
 */
import type { FilterGroup, Filters, State } from "./types";
import { FILTER_GROUPS } from "./types";
import { VIEWS } from "../model/types";
import type { View } from "../model/types";

const FILTER_GROUP_SET = new Set<string>(FILTER_GROUPS);
const VIEW_SET = new Set<string>(VIEWS);

function isFilterGroup(key: string): key is FilterGroup {
  return FILTER_GROUP_SET.has(key);
}

/**
 * Builds the fragment for `state`, without a leading `#`. Order and encoding follow js-4.md §3a
 * steps 1-6 exactly: `view` (raw, unencoded), `q` (skipped when the trimmed value is empty — the
 * one deliberate difference from legacy's plain truthiness check), each of `FILTER_GROUPS` in that
 * fixed order, then `pkg`. The legacy page left out a `pkg` it had opened by itself; this page never
 * opens one by itself (PD-ROWS-9), so an open package is always written.
 */
export function serializeHash(state: State): string {
  const parts: string[] = [];

  if (state.view !== "findings") {
    parts.push("view=" + state.view);
  }

  if (state.q.trim() !== "") {
    parts.push("q=" + encodeURIComponent(state.q));
  }

  for (const group of FILTER_GROUPS) {
    const on = state.filters[group];
    if (on.length > 0) {
      parts.push(group + "=" + encodeURIComponent(on.join(",")));
    }
  }

  if (state.pkg) {
    parts.push("pkg=" + encodeURIComponent(state.pkg));
  }

  return parts.join("&");
}

/** Appends `key` to `group`'s list if it is not already there, keeping selection order. */
function addFilterKey(filters: Filters, group: FilterGroup, key: string): Filters {
  const current = filters[group];
  return current.includes(key) ? filters : { ...filters, [group]: [...current, key] };
}

/**
 * Rebuilds a `State` from a hash fragment (with or without its leading `#`), starting from `base`.
 * Ported from `readHash` (js-4.md §3b), piece by piece:
 * - a piece with no `=` is skipped silently;
 * - a piece whose value fails to `decodeURIComponent` is skipped whole (the DESIGN.md fix for
 *   legacy bug M12, which let one bad escape blank the entire page);
 * - `view` is applied only when it names a known view, otherwise ignored (the DESIGN.md fix — the
 *   legacy code assigned it verbatim and silently fell through to the Run tab's rendering);
 * - `q` and `pkg` are taken verbatim;
 * - a `FILTER_GROUPS` key adds its comma-separated, non-empty entries to that group, on top of
 *   whatever `base` already had, exactly like legacy's additive/idempotent merge;
 * - any other key, including one that looks like a filter group but is not in `FILTER_GROUPS`, is
 *   ignored.
 */
export function parseHash(fragment: string, base: State): State {
  const h = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (h === "") {
    return base;
  }

  let view: View = base.view;
  let q = base.q;
  let pkg = base.pkg;
  let filters: Filters = base.filters;

  for (const piece of h.split("&")) {
    const i = piece.indexOf("=");
    if (i < 0) {
      continue;
    }
    const key = piece.slice(0, i);
    let value: string;
    try {
      value = decodeURIComponent(piece.slice(i + 1));
    } catch {
      continue;
    }

    if (key === "view") {
      if (VIEW_SET.has(value)) {
        view = value as View;
      }
      continue;
    }
    if (key === "q") {
      q = value;
      continue;
    }
    if (key === "pkg") {
      // A package named in the hash round-trips straight back into the next `writeHash()`.
      pkg = value;
      continue;
    }
    if (isFilterGroup(key)) {
      for (const part of value.split(",")) {
        if (part !== "") {
          filters = addFilterKey(filters, key, part);
        }
      }
    }
    // Any other key — including an unrecognised group name — is ignored.
  }

  return { ...base, view, q, pkg, filters };
}

/** The minimal `window` surface `writeHash` needs; lets tests pass a fake instead of jsdom. */
export type HashWindow = Pick<Window, "history" | "location">;

/**
 * A `writeHash` bound to one permanent latch, mirroring `report.js`'s module-level `URL_STATE`
 * flag (js-4.md §3a): once a write throws — in practice a `SecurityError` from an opaque-origin
 * sandboxed frame, but the legacy code (and this port) disables on *any* thrown error — every
 * later call becomes a silent no-op for the rest of the page's life. Callers create exactly one
 * `HashSync` for the page and keep calling its `writeHash`; a fresh instance is only for tests that
 * need an unlatched start.
 */
export class HashSync {
  private disabled = false;

  /**
   * Writes `state`'s fragment via `history.replaceState` (never `pushState` — no in-page state
   * change ever creates a browser-history entry). Does nothing when the latch already tripped, or
   * when the computed fragment already matches the address bar (js-4.md §3a step 7, avoiding a
   * redundant identical history entry). When the fragment is empty the URL resets to the bare path
   * plus its existing query string — DESIGN.md §4's fix for legacy dropping `location.search`.
   */
  writeHash(state: State, win: HashWindow): void {
    if (this.disabled) {
      return;
    }
    const h = serializeHash(state);
    const current = win.location.hash.startsWith("#") ? win.location.hash.slice(1) : win.location.hash;
    if (h === current) {
      return;
    }
    try {
      const url = h ? "#" + h : win.location.pathname + win.location.search;
      win.history.replaceState(null, "", url);
    } catch {
      this.disabled = true;
    }
  }
}
