import type { Ref, RefObject } from "preact";
import { useReport } from "../context";
import { activeFilters } from "../../domain/filters";
import { applyFilters2, hiddenByFilters2, population2 } from "../../domain/list";
import type { Report2 } from "../../model/report";
import { radiusCountPhrase } from "../../domain/radius";
import { radiusLayout2 } from "../../domain/radius2";
import { advisoryPairs2 } from "../../domain/advisories";
import { countPhrase, plural } from "../../domain/format";
import { ActiveFilters } from "./ActiveFilters";
import { EMPTY_FILTERS, type State } from "../../state/types";
import "./search.css";

// Fits the field at 320px, the narrowest width the page supports (DESIGN.md §6); `?` lists every key.
const PLACEHOLDER = "flag:stale score:>=16";

/**
 * "N of M …", read off the same domain functions each tab uses to decide what it lists, so this line
 * can never disagree with the rows underneath it. `null` on the Run tab, which has nothing to count.
 */
function countLine(report: Report2, state: State): string | null {
  if (state.view === "findings") {
    return countPhrase(
      applyFilters2(report, state, "findings").length,
      population2(report, "findings").length,
      "flagged package",
      "flagged packages",
    );
  }
  if (state.view === "packages") {
    return countPhrase(
      applyFilters2(report, state, "packages").length,
      population2(report, "packages").length,
      "package",
      "packages",
    );
  }
  if (state.view === "advisories") {
    const shown = advisoryPairs2(applyFilters2(report, state, "advisories"), state.filters).length;
    const all = advisoryPairs2(population2(report, "advisories"), EMPTY_FILTERS).length;
    // No advisory in the document at all: the tab's own sentence says so (PD-LEDGER-1).
    if (all === 0) return null;
    return countPhrase(shown, all, "advisory", "advisories");
  }
  if (state.view === "radius")
    return radiusCountPhrase(
      radiusLayout2(report, applyFilters2(report, state, "radius"), population2(report, "radius")),
    );
  return null;
}

/** Selected filter keys plus a non-blank query — the same "active" sum legacy's `render()` totals
 *  (`report.js:871-873`), except a whitespace-only query no longer counts (DESIGN.md §4's fix for
 *  critic.md M22: `state.q` was counted on its raw, untrimmed value). */
function activeFilterCount(state: State): number {
  return activeFilters(state.filters).length + (state.q.trim() === "" ? 0 : 1);
}

/**
 * The search box, its keyboard hint and the count line beneath it. Ported from legacy's
 * `<div class="searchbar">`/`.hint`/`#countLine` (`report.html:78-87`) and the parts of `render()`
 * that fill them in (`report.js:871-888`).
 *
 * The search box and hint hide together once the current tab has nothing to filter (`filterable`,
 * mirroring `report.js:885-888`) — but the count line does not: critic.md M20 is explicit that even
 * a clean report with zero flagged packages still shows "0 of 0 flagged packages" while the search
 * box beside it is hidden, and this keeps that split rather than collapsing it to one flag.
 */
export function SearchBar({ inputRef }: { inputRef: Ref<HTMLInputElement> }) {
  const { model, state, dispatch } = useReport();
  const { report } = model;
  const filterable = population2(report, state.view).length > 0;
  const line = countLine(report, state);
  const active = activeFilterCount(state);
  // a11y review: the detail sheet's own "hidden by the current filters" note has no live region, so
  // this line says it too. Both read `list.ts#hiddenByFilters2`, so they never disagree.
  const openPkgHidden = state.pkg !== null && hiddenByFilters2(report, state, state.pkg);

  return (
    <>
      {filterable && (
        <div className="searchbar">
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            aria-label="Filter packages"
            placeholder={PLACEHOLDER}
            value={state.q}
            onInput={(event) => {
              dispatch({ type: "query", q: event.currentTarget.value });
            }}
          />
          <button
            type="button"
            className="icon-btn"
            disabled={active === 0}
            onClick={() => {
              dispatch({ type: "clear" });
            }}
          >
            Clear
          </button>
        </div>
      )}
      {/* PD-GLOSSARY-1: the full keys-and-syntax paragraph moved into the glossary's "Keys and
          search" section, which opens where the reader already is instead of every findings list
          carrying its own copy. What stays here is the one thing a reader would otherwise have no
          way to discover: that pressing ? gets them the rest. One line reads the same at 320px,
          where the old paragraph pushed the list down a full screen (DESIGN.md §8), and at 1440px,
          where it no longer competes with the search box for attention. */}
      {filterable && (
        <p className="hint">
          Press <kbd>?</kbd> for keys and search syntax.
        </p>
      )}
      {line !== null && (
        <p className="count-line" role="status" aria-live="polite">
          {line}
          {/* PD-RAIL-4: where the chips line below draws each filter, "2 filters on" beside the
              count would say the same thing twice; it stays in the live region for a screen reader,
              which hears a change here and not in the chips. */}
          {active > 0 && (
            <span className={filterable ? "vh" : "active-filters"}>
              {" "}
              {plural(active, "filter", "filters")} on
            </span>
          )}
          {/* A leading space, not a literal " · ", so this span never opens a wrapped line with a
              lone separator glyph. */}
          {openPkgHidden && (
            <span className="hidden-pkg-note"> {state.pkg} is hidden by the current filters</span>
          )}
        </p>
      )}
      {filterable && <ActiveFilters inputRef={inputRef as RefObject<HTMLInputElement>} />}
    </>
  );
}
