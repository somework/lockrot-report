import { Fragment, type Ref, type RefObject } from "preact";
import { useReport } from "../context";
import { applyFilters, hiddenByFilters, population } from "../../domain/filters";
import { allAdvisories, passesAdvisoryRail } from "../../domain/advisories";
import { matchesAdvisory, parseQuery } from "../../domain/query";
import { radiusCountPhrase, radiusLayout } from "../../domain/radius";
import { countPhrase, plural } from "../../domain/format";
import { searchSplit, searchSplitPhrase } from "../../domain/searchHits";
import { NoWrap } from "../common/common";
import { ActiveFilters } from "./ActiveFilters";
import { advisoryGroupsFor } from "../views/order";
import type { Finding, Model } from "../../model/types";
import type { State } from "../../state/types";
import "./search.css";

/** Verbatim from legacy's search box (`report.html:79`). */
const PLACEHOLDER = "Filter: guzzle, verdict:left-behind, severity:critical, cve:CVE-2022-31090";

/**
 * "N of M …", read off the same domain functions the four filterable views use to decide what they
 * list — `applyFilters` for Findings/Packages, `allAdvisories` plus `matchesAdvisory` (and the
 * advisory-level rail check above) for Advisories, `radiusLayout` for Blast radius — so this line
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
    // No advisory in the document at all: the tab's own sentence says so (PD-LEDGER-1), and a
    // "0 of 0 advisories" above it would only undercut it.
    const total = allAdvisories(model).length;
    if (total === 0) return null;
    return countPhrase(rows.length, total, "advisory", "advisories");
  }

  if (state.view === "radius") {
    // Every requirement the tab names: a ranked row, a row in the "flagged themselves" tail, a
    // name in the "only through rows above" tail — against `exposure`'s own count — and, when
    // `exposure` leaves flagged direct requirements out, the ones the footnote names.
    const layout = radiusLayout(model, applyFilters(model, state, "radius"), population(model, "radius"));
    return radiusCountPhrase(layout);
  }

  return null;
}

/**
 * The packages a tab lists, each once, in list order — what the status line's search split counts
 * (PD-SEARCH-1). The Advisories tab lists a package once per advisory; Blast radius lists pulled
 * packages under direct requirements, not the findings free text matched, so it has no split.
 */
function listedPackages(model: Model, state: State): readonly Finding[] | null {
  if (state.view === "findings" || state.view === "packages") return applyFilters(model, state, state.view);
  if (state.view !== "advisories") return null;
  const seen = new Set<string>();
  const listed: Finding[] = [];
  for (const group of advisoryGroupsFor(model, state)) {
    for (const { finding } of group.advisories) {
      if (seen.has(finding.package)) continue;
      seen.add(finding.package);
      listed.push(finding);
    }
  }
  return listed;
}

/** The status line's "14 on the row, 2 mention “hoa/” (a, b)" — null when free text found every
 *  listed package on its own row, or there is no free text (PD-SEARCH-1).
 *
 * No literal " · " separator of its own (PD-SEARCH-1 polish item 1): that text used to open this
 * span, so at 320/390 — where `.count-line`'s flex-wrap drops the whole span to a line of its own —
 * a lone "· 14 on the row …" opened the line, and at 1440 it sat right after the row's own 12px flex
 * `gap`, doubling up on the same separation. A single leading space instead (the same convention
 * `.active-filters` already uses) keeps a screen reader from running the line before it straight
 * into this one, without ever being the one visible character to open a wrapped line. */
function SearchSplitNote({ model, state }: { model: Model; state: State }) {
  const listed = listedPackages(model, state);
  if (listed === null) return null;
  const unit = state.view === "advisories" ? { one: "package", many: "packages" } : null;
  const phrase = searchSplitPhrase(searchSplit(listed, state.q), unit);
  if (phrase === null) return null;
  return (
    <span className="match-split">
      {" "}
      {phrase.text}
      {phrase.names.length > 0 && (
        // a11y review (PD-SEARCH-1 polish item 6): `.count-line` is a live region that re-announces
        // its whole text on every keystroke — up to three package names read out loud each time was
        // more than the line's own short counts needed. The names stay on screen (still what a
        // sighted reader wants beside the counts) but `aria-hidden` takes them out of what gets
        // announced; the counts alone are.
        <span aria-hidden="true">
          {" ("}
          {phrase.names.map((name, i) => (
            <Fragment key={name}>
              {i > 0 && ", "}
              <NoWrap>{name}</NoWrap>
            </Fragment>
          ))}
          {")"}
        </span>
      )}
    </span>
  );
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
  // a11y review: `DetailHeader`'s own "Hidden by the current filters." note has no live region of
  // its own, so a reader typing a search term never heard that the package they had open just left
  // the list — only this line's own count is announced. It shares `domain/filters.ts#hiddenByFilters`
  // with that note rather than duplicating the check, so the two can never disagree about when it
  // applies.
  const openPkgHidden = state.pkg !== null && hiddenByFilters(model, state, state.pkg);

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
          <SearchSplitNote model={model} state={state} />
          {/* Same fix as `SearchSplitNote`'s own comment above: a leading space, not a literal
              " · ", so this span never opens a wrapped line with a lone separator glyph. */}
          {openPkgHidden && (
            <span className="hidden-pkg-note"> {state.pkg} is hidden by the current filters</span>
          )}
        </p>
      )}
      {filterable && <ActiveFilters inputRef={inputRef as RefObject<HTMLInputElement>} />}
    </>
  );
}
