import { useReport } from "../context";
import { parseQuery } from "../../domain/query";
import { searchHit, type SearchHit } from "../../domain/searchHits";
import type { Finding } from "../../model/types";
import "./search.css";

/** Where the search box's free text found `finding` (PD-SEARCH-1), or null with no free text. */
export function useSearchHit(finding: Finding): SearchHit | null {
  const { state } = useReport();
  return searchHit(finding, parseQuery(state.q));
}

/**
 * The quiet line a row carries when free text found its package only in the evidence, which no row
 * shows in full (PD-SEARCH-1): "matched in: pulls in 14 flagged packages: hoa/compiler (abandoned)…",
 * the hit in a `<mark>`. Plain JSX text, never markup built from the evidence. Nothing for a package
 * found by its name, version or verdict — the row already shows those — or when `shown` (the text
 * the row already prints) holds the word itself.
 */
export function MatchNote({ hit, shown = "" }: { hit: SearchHit | null; shown?: string }) {
  if (hit === null || hit.excerpt === null || hit.term === null) return null;
  if (shown.toLowerCase().includes(hit.term)) return null;
  const { before, hit: word, after, cutStart, cutEnd } = hit.excerpt;

  return (
    <span className="match-note">
      <span className="match-note-label">matched in:</span> {cutStart && "…"}
      {before}
      <mark>{word}</mark>
      {after}
      {cutEnd && "…"}
    </span>
  );
}
