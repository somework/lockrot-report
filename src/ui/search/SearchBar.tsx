import type { Ref } from "preact";
import { useReport } from "../context";
import { applyFilters, population } from "../../domain/filters";
import { allAdvisories, fixShapeOf } from "../../domain/advisories";
import { matchesAdvisory, parseQuery } from "../../domain/query";
import { radiusCards } from "../../domain/radius";
import { countPhrase, plural } from "../../domain/format";
import type { Advisory, Model } from "../../model/types";
import type { Filters, State } from "../../state/types";
import "./search.css";

/** Verbatim from legacy's search box (`report.html:79`). */
const PLACEHOLDER = "Filter: guzzle, verdict:left-behind, severity:critical, cve:CVE-2022-31090";

/**
 * Whether an advisory clears the rail's own `sev`/`fix` selections. `filters.ts`'s `passesRail`
 * only ever answers this at *finding* granularity (does the finding have at least one matching
 * advisory) — correct for narrowing the finding lists, but not enough to count Advisories-tab rows,
 * where a finding can pass the rail on one advisory while carrying several that individually do
 * not. Legacy's `advisoryMatches` makes the same two checks at the row level (`report.js:507,509`);
 * this is that half of it, kept local since no other component needs a per-advisory rail check.
 */
function passesAdvisoryRail(filters: Filters, advisory: Advisory): boolean {
  if (filters.sev.length > 0 && !filters.sev.includes(advisory.severity)) return false;
  if (filters.fix.length > 0 && !filters.fix.includes(fixShapeOf(advisory))) return false;
  return true;
}

/**
 * "N of M …", read off the same domain functions the four filterable views use to decide what they
 * list — `applyFilters` for Findings/Packages, `allAdvisories` plus `matchesAdvisory` (and the
 * advisory-level rail check above) for Advisories, `radiusCards` for Blast radius — so this line
 * can never disagree with the rows underneath it (this task's brief). `null` on the Run tab, which
 * has nothing to count; legacy leaves `countLine` empty there too (`report.js:855,879`).
 *
 * Ported from legacy `render()`'s count-line assembly (`report.js:874-878`), with the M21 fix:
 * `countPhrase` singularises at exactly one, where legacy always said "1 of 1 flagged packages".
 */
function countLine(model: Model, state: State): string | null {
  if (state.view === "findings") {
    return countPhrase(
      applyFilters(model, state, "findings").length,
      population(model, "findings").length,
      "flagged package",
      "flagged packages",
    );
  }

  if (state.view === "packages") {
    return countPhrase(
      applyFilters(model, state, "packages").length,
      population(model, "packages").length,
      "package",
      "packages",
    );
  }

  if (state.view === "advisories") {
    const terms = parseQuery(state.q);
    const kept = new Set(applyFilters(model, state, "advisories").map((f) => f.package));
    const rows = allAdvisories(model).filter(
      ({ advisory, finding }) =>
        kept.has(finding.package) &&
        passesAdvisoryRail(state.filters, advisory) &&
        matchesAdvisory(advisory, finding, terms),
    );
    return countPhrase(rows.length, allAdvisories(model).length, "advisory", "advisories");
  }

  if (state.view === "radius") {
    const cards = radiusCards(model, applyFilters(model, state, "radius"));
    return countPhrase(
      cards.length,
      model.report.exposure.length,
      "direct requirement",
      "direct requirements",
    );
  }

  return null;
}

/** Selected filter keys plus a non-blank query — the same "active" sum legacy's `render()` totals
 *  (`report.js:871-873`), except a whitespace-only query no longer counts (DESIGN.md §4's fix for
 *  critic.md M22: `state.q` was counted on its raw, untrimmed value). */
function activeFilterCount(state: State): number {
  const filterKeys = Object.values(state.filters).reduce((n, keys) => n + keys.length, 0);
  return filterKeys + (state.q.trim() === "" ? 0 : 1);
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
  const filterable = population(model, state.view).length > 0;
  const line = countLine(model, state);
  const active = activeFilterCount(state);

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
      {filterable && (
        <p className="hint">
          <span className="hint-keys">
            <kbd>/</kbd> to search · <kbd>j</kbd> <kbd>k</kbd> to move · <kbd>Enter</kbd> to open ·{" "}
            <kbd>Esc</kbd> to close · <kbd>?</kbd> for the glossary.{" "}
          </span>
          The tab, the filters and the open package are in the address, so the address bar is a link to what
          you are looking at. Keys: <code>verdict:</code> <code>priority:</code> <code>signal:</code>{" "}
          <code>severity:</code> <code>cve:</code> <code>direct:</code> <code>dev:</code>
        </p>
      )}
      {line !== null && (
        <p className="count-line" role="status" aria-live="polite">
          {line}
          {active > 0 && <span className="active-filters"> {plural(active, "filter", "filters")} on</span>}
        </p>
      )}
    </>
  );
}
