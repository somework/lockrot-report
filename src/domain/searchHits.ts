/**
 * Where free text found a package (PD-SEARCH-1, DESIGN.md §5). The search box keeps legacy's
 * semantics — every word must appear somewhere in the package name, version, verdict or evidence
 * (`query.ts#matchesFinding`) — but a word found only in the evidence left a row on the list with
 * nothing on it that said why: "hoa/" listed wallabag/rulerz, whose evidence names the hoa/*
 * packages it pulls in. This module says which part each word was found in, so the status line can
 * split the count ("14 by name, 2 mention it") and such a row can quote the words around the hit.
 * It never decides *whether* a package matches; that stays `matchesFinding`'s job alone.
 */

import type { Finding } from "../model/types";
import { plural } from "./format";
import { freeTextTerms, searchFields, type SearchField, type Term } from "./query";

/** How far, in characters, an excerpt reaches either side of the hit before it is cut — enough for
 *  "pulls in 14 flagged packages: hoa/compiler (abandoned)", short enough for a row's one quiet line. */
export const EXCERPT_REACH = 32;

/** The evidence joins its facts with "; " (`model/normalize.ts#buildEvidence`); an excerpt never
 *  runs across one, so it quotes one fact, not the tail of the one before. */
const FACT_SEPARATOR = "; ";

/** Punctuation an excerpt's cut end would otherwise leave dangling before its ellipsis. */
const TRAILING_PUNCTUATION = /[\s,;:(]+$/;

/** The words around a hit in the evidence, as plain text: `before` and `after` are what to print
 *  either side of `hit`; `cutStart`/`cutEnd` say whether the fact goes on past them (an ellipsis). */
export interface Excerpt {
  readonly before: string;
  readonly hit: string;
  readonly after: string;
  readonly cutStart: boolean;
  readonly cutEnd: boolean;
}

/**
 * Where a matching package's free text was found. `field` is the least visible part any one word
 * needed: `name` when every word is in the package name, else `version`, `verdict`, or `evidence` —
 * the one part a row does not show. `term` and `excerpt` are set only for `evidence`: the first
 * word found nowhere else, and the words around its first occurrence.
 */
export interface SearchHit {
  readonly field: SearchField;
  readonly term: string | null;
  readonly excerpt: Excerpt | null;
}

const FIELD_ORDER: readonly SearchField[] = ["name", "version", "verdict", "evidence"];

/** The first part of `f`, in haystack order, that holds `term`; null when none does. */
function fieldOf(f: Finding, term: string): SearchField | null {
  for (const [field, value] of searchFields(f)) {
    if (value.toLowerCase().includes(term)) return field;
  }
  return null;
}

/** A cut start moves forward to the next word, so an excerpt never opens mid-word. */
function snapStart(text: string, from: number, limit: number): number {
  if (from <= 0) return 0;
  const space = text.indexOf(" ", from - 1);
  return space < 0 || space >= limit ? from : space + 1;
}

/** A cut end moves back to the last whole word, so an excerpt never ends mid-word. */
function snapEnd(text: string, to: number, limit: number): number {
  if (to >= text.length) return text.length;
  const space = text.lastIndexOf(" ", to);
  return space < limit ? to : space;
}

/**
 * The words around the first occurrence of `term` in `evidence`, within the one "; "-separated fact
 * that holds it and at most `reach` characters either side, cut at word boundaries. Null when the
 * evidence does not hold the term. Case-insensitive, as the search is; the excerpt keeps the
 * evidence's own case.
 */
export function evidenceExcerpt(
  evidence: string,
  term: string,
  reach: number = EXCERPT_REACH,
): Excerpt | null {
  if (term === "") return null;
  const lower = evidence.toLowerCase();
  // A lower-cased string can change length (a dotted capital I becomes two code units); an index
  // found in it then no longer points into the original, so the excerpt quotes the lower-cased text.
  const text = lower.length === evidence.length ? evidence : lower;
  const at = lower.indexOf(term.toLowerCase());
  if (at < 0) return null;
  const end = at + term.length;

  const sepBefore = text.lastIndexOf(FACT_SEPARATOR, at - FACT_SEPARATOR.length);
  const factStart = at >= FACT_SEPARATOR.length && sepBefore >= 0 ? sepBefore + FACT_SEPARATOR.length : 0;
  const sepAfter = text.indexOf(FACT_SEPARATOR, end);
  const factEnd = sepAfter < 0 ? text.length : sepAfter;

  const cutStart = at - factStart > reach;
  const cutEnd = factEnd - end > reach;
  const from = cutStart ? snapStart(text, at - reach, at) : factStart;
  const to = cutEnd ? snapEnd(text, end + reach, end) : factEnd;

  const after = text.slice(end, to);
  return {
    before: text.slice(from, at),
    hit: text.slice(at, end),
    after: cutEnd ? after.replace(TRAILING_PUNCTUATION, "") : after,
    cutStart,
    cutEnd,
  };
}

/**
 * Where free text found `f`, or null when the query has no free text or `f` does not hold every
 * word (a package that is not on the list has nothing to explain).
 */
export function searchHit(f: Finding, terms: readonly Term[]): SearchHit | null {
  const words = freeTextTerms(terms);
  if (words.length === 0) return null;

  let worst = 0;
  let evidenceTerm: string | null = null;
  for (const word of words) {
    const field = fieldOf(f, word);
    if (field === null) return null;
    const rank = FIELD_ORDER.indexOf(field);
    if (rank > worst) worst = rank;
    if (field === "evidence" && evidenceTerm === null) evidenceTerm = word;
  }

  const field = FIELD_ORDER[worst] ?? "name";
  if (evidenceTerm === null) return { field, term: null, excerpt: null };
  return { field, term: evidenceTerm, excerpt: evidenceExcerpt(f.evidence, evidenceTerm) };
}

/** How the packages on a list were found by free text: how many by each part, and which packages
 *  only mention a word in their evidence, in list order. */
export interface SearchSplit {
  readonly query: string;
  readonly words: number;
  readonly total: number;
  readonly byName: number;
  readonly byVersion: number;
  readonly byVerdict: number;
  readonly mentions: readonly string[];
}

/**
 * The split of `findings` (the packages a list shows, each once) by where free text found them.
 * Null when the query has no free text. A package listed twice (a tab with a row per advisory)
 * should be passed once.
 */
export function searchSplit(findings: readonly Finding[], terms: readonly Term[]): SearchSplit | null {
  const words = freeTextTerms(terms);
  if (words.length === 0) return null;

  let byName = 0;
  let byVersion = 0;
  let byVerdict = 0;
  const mentions: string[] = [];
  let total = 0;
  for (const finding of findings) {
    const hit = searchHit(finding, terms);
    if (hit === null) continue;
    total += 1;
    if (hit.field === "name") byName += 1;
    else if (hit.field === "version") byVersion += 1;
    else if (hit.field === "verdict") byVerdict += 1;
    else mentions.push(finding.package);
  }
  return { query: words.join(" "), words: words.length, total, byName, byVersion, byVerdict, mentions };
}

/** At most this many "mention" packages are named in the status line; more are only counted. */
export const MENTIONS_NAMED = 3;

/**
 * The status line's split, as words: `16 match "hoa/": 14 by name, 2 mention it` plus the
 * packages to name after it (at most `MENTIONS_NAMED`; none past that, the count alone). Null when
 * there is nothing to explain — every package was found by its name, or none was found at all — so
 * the line reads as it always did for a search that finds what it names. `unit` names what is
 * counted when the list's own rows are not packages (the Advisories tab: "3 packages match …").
 */
export function searchSplitPhrase(
  split: SearchSplit | null,
  unit: { readonly one: string; readonly many: string } | null = null,
): { readonly text: string; readonly names: readonly string[] } | null {
  if (split === null || split.total === 0 || split.byName === split.total) return null;

  const counted = unit === null ? `${split.total}` : plural(split.total, unit.one, unit.many);
  const verb = split.total === 1 ? "matches" : "match";
  const parts: string[] = [];
  if (split.byName > 0) parts.push(`${split.byName} by name`);
  if (split.byVersion > 0) parts.push(`${split.byVersion} by version`);
  if (split.byVerdict > 0) parts.push(`${split.byVerdict} by verdict`);
  const n = split.mentions.length;
  if (n > 0) {
    const pronoun = split.words === 1 ? "it" : "them";
    parts.push(`${n} ${n === 1 ? "mentions" : "mention"} ${pronoun}`);
  }

  return {
    text: `${counted} ${verb} “${split.query}”: ${parts.join(", ")}`,
    names: n <= MENTIONS_NAMED ? split.mentions : [],
  };
}
