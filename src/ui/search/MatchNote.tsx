import { useReport } from "../context";
import { parseQuery } from "../../domain/query";
import { searchHit, type Excerpt, type SearchHit } from "../../domain/searchHits";
import type { Finding } from "../../model/types";
import "./search.css";

/** Where the search box's free text found `finding` (PD-SEARCH-1), or null with no free text. */
export function useSearchHit(finding: Finding): SearchHit | null {
  const { state } = useReport();
  return searchHit(finding, parseQuery(state.q));
}

/** The note's own words as one plain string, exactly what its JSX renders — used for the `title`
 *  (PD-SEARCH-1 polish item 5), since the wide Findings ledger clips the note itself to one line. */
function excerptText(excerpt: Excerpt): string {
  const { before, hit: word, after, cutStart, cutEnd } = excerpt;
  return `matched in: ${cutStart ? "…" : ""}${before}${word}${after}${cutEnd ? "…" : ""}`;
}

/**
 * The quiet line a row carries when free text found its package only in the evidence, which no row
 * shows in full (PD-SEARCH-1): "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
 * the hit in a `<mark>`. Plain JSX text, never markup built from the evidence. Nothing for a package
 * found by its name, version or verdict — the row already shows those — or when `shown` (the text
 * the row already prints) holds the word itself.
 *
 * `title` carries the same words again for a mouse reader to hover (PD-SEARCH-1 polish item 5): from
 * 990px the Findings ledger draws one row per line, and the note's own text still runs the row's
 * full width and clips to an ellipsis there (`ledger-rows.css`) rather than wrapping it to a second
 * line and growing every row under it. The note's own text nodes are unchanged, so what a screen
 * reader gets from the element itself is the same full excerpt either way — `title` only adds a
 * second, sighted way to read the part the ellipsis hides.
 */
export function MatchNote({ hit, shown = "" }: { hit: SearchHit | null; shown?: string }) {
  if (hit === null || hit.excerpt === null || hit.term === null) return null;
  if (shown.toLowerCase().includes(hit.term)) return null;
  const { before, hit: word, after, cutStart, cutEnd } = hit.excerpt;

  return (
    <span className="match-note" title={excerptText(hit.excerpt)}>
      <span className="match-note-label">matched in:</span> {cutStart && "…"}
      {before}
      <mark>{word}</mark>
      {after}
      {cutEnd && "…"}
    </span>
  );
}
