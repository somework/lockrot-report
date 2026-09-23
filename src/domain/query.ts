/**
 * The search box's grammar and the predicates it drives — ported from `LockrotLib.parseQuery`
 * (`legacy/lib.js:199-211`) and the free-text/query portion of `matches()`/`advisoryMatches()`
 * (`legacy/report.js:205-240,504-516`).
 *
 * Legacy bucketed a parsed query into one object (`{text:[], verdict:[], ...}`); this port instead
 * returns a flat list of `Term`s, one per token, so a caller that only cares about one field (a
 * rail control, a test) can filter the list itself instead of reaching into seven different array
 * properties. `field: null` is legacy's `terms.text` — a bare word with no `key:` prefix.
 *
 * `matchesFinding`/`matchesAdvisory` only replicate the *query-string* part of legacy's
 * predicates (the numbered steps 1-7 of `matches()`, and the severity/cve steps of
 * `advisoryMatches()`). The rail's own button selections (`state.sev`, `state.fix`,
 * `state.prio`, …) are a separate concern that needs `State`, not `Term[]`, and live in
 * `filters.ts` instead.
 */

import type { Advisory, Finding } from "../model/types";

export interface Term {
  readonly field: string | null;
  readonly value: string;
}

/** Recognised `key:value` field names (case-insensitive on the key), verbatim from `lib.js:203`. */
const FIELD_PATTERN = /^(verdict|priority|signal|severity|cve|direct|dev):(.+)$/i;

/** The only three spellings `direct:`/`dev:` accept as "yes" (`lib.js:206`); anything else is "no",
 *  never "unasked" — only the complete absence of the key leaves the field unasked. */
const TRUTHY_VALUES = new Set(["yes", "true", "1"]);

/** `signal`/`cve` values are identifiers and get upper-cased; the rest are words and stay lower. */
const UPPERCASE_FIELDS = new Set(["signal", "cve"]);

/**
 * The search box, read as terms (`lib.js:199-211`). A whitespace-only or empty string yields no
 * terms at all — it is not an active filter and, per DESIGN.md §4, is never written to the
 * fragment either.
 *
 * `direct:`/`dev:` overwrite semantics are preserved by leaving repeats in the list in order:
 * whoever reads a `direct`/`dev` term back must take the *last* one that occurs, which is what
 * `matchesFinding` below does. Every other recognised field widens instead: repeating
 * `verdict:silent verdict:abandoned` means either verdict, so both terms simply stay in the list.
 */
export function parseQuery(raw: string): Term[] {
  const trimmed = raw.trim();
  if (trimmed === "") return [];

  const terms: Term[] = [];
  for (const part of trimmed.split(/\s+/)) {
    if (part === "") continue;

    const match = FIELD_PATTERN.exec(part);
    if (match === null) {
      terms.push({ field: null, value: part.toLowerCase() });
      continue;
    }

    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      // The pattern's two capturing groups are both mandatory, so this never actually happens;
      // `noUncheckedIndexedAccess` just can't see that from the regex literal alone.
      terms.push({ field: null, value: part.toLowerCase() });
      continue;
    }

    const field = key.toLowerCase();
    const value = rawValue.toLowerCase();
    if (field === "direct" || field === "dev") {
      terms.push({ field, value: TRUTHY_VALUES.has(value) ? "true" : "false" });
      continue;
    }
    terms.push({ field, value: UPPERCASE_FIELDS.has(field) ? value.toUpperCase() : value });
  }
  return terms;
}

function valuesOf(terms: readonly Term[], field: string | null): readonly string[] {
  return terms.filter((term) => term.field === field).map((term) => term.value);
}

/** The last `direct`/`dev` term's value, or `null` when the query never mentioned the field at
 *  all — "unasked" and "asked and answered no" are different states (`lib.js:200`). */
function lastBooleanTerm(terms: readonly Term[], field: "direct" | "dev"): boolean | null {
  let result: boolean | null = null;
  for (const term of terms) {
    if (term.field === field) result = term.value === "true";
  }
  return result;
}

/**
 * A `severity:` term matches an advisory when it equals either the normalised bucket
 * (`Advisory.severity`) or the raw feed text, lower-cased. This is the fix for critic.md M1:
 * legacy compared a query term only against the *raw* `String(a.severity)`, so `severity:high`
 * never matched a feed's `"High"`, and `severity:unrated` never matched a `null` severity (whose
 * raw form is the literal string `"null"`). Matching the bucket too means `severity:moderate` and
 * `severity:medium` both find a "moderate"-labelled advisory (it normalises to the same bucket),
 * and `severity:unrated` finds every advisory with no feed severity at all.
 */
function matchesSeverityTerm(advisory: Advisory, terms: readonly string[]): boolean {
  const raw = (advisory.severityRaw ?? "").toLowerCase();
  return terms.some((term) => term === advisory.severity || term === raw);
}

/** A `cve:` term matches when it is a substring of the advisory's CVE id, or its own id when it
 *  has no CVE (`report.js:220-222`, `report.js:511-514`). Both sides are already upper-cased. */
function matchesCveTerm(advisory: Advisory, terms: readonly string[]): boolean {
  const id = (advisory.cve ?? advisory.id).toUpperCase();
  return terms.some((term) => id.includes(term));
}

/**
 * The query-string part of legacy's `matches(f, terms)` (`report.js:205-222`): free text, then
 * `verdict:`/`priority:`/`direct:`/`dev:`/`signal:`/`severity:`/`cve:`. The rail's own selections
 * (steps 8-14 of the original) are applied separately in `filters.ts`, which has `State` to read
 * them from.
 */
export function matchesFinding(f: Finding, terms: readonly Term[]): boolean {
  const text = valuesOf(terms, null);
  if (text.length > 0) {
    const haystack = `${f.package} ${f.version} ${f.verdict} ${f.evidence}`.toLowerCase();
    if (!text.every((term) => haystack.includes(term))) return false;
  }

  const verdicts = valuesOf(terms, "verdict");
  if (verdicts.length > 0 && !verdicts.includes(f.verdict)) return false;

  const priorities = valuesOf(terms, "priority");
  if (priorities.length > 0 && !priorities.includes(f.priority)) return false;

  const direct = lastBooleanTerm(terms, "direct");
  if (direct !== null && f.direct !== direct) return false;

  const dev = lastBooleanTerm(terms, "dev");
  if (dev !== null && f.dev !== dev) return false;

  const signals = valuesOf(terms, "signal");
  if (signals.length > 0) {
    const ids = f.signals.map((signal) => signal.id);
    if (!signals.every((id) => ids.includes(id))) return false;
  }

  const severities = valuesOf(terms, "severity");
  if (severities.length > 0 && !f.advisories.some((advisory) => matchesSeverityTerm(advisory, severities))) {
    return false;
  }

  const cves = valuesOf(terms, "cve");
  if (cves.length > 0 && !f.advisories.some((advisory) => matchesCveTerm(advisory, cves))) return false;

  return true;
}

/**
 * The query-string part of legacy's `advisoryMatches(a, terms)` (`report.js:504-514`): severity
 * and CVE, with the M1 fix described on `matchesSeverityTerm` above. `_finding` is accepted (not
 * read) so the signature matches what a caller iterating a finding's advisories already has in
 * hand, without forcing it to destructure just to call this; legacy's advisory-level predicate
 * never needed the owning finding either; the row-level rail selections (`state.sev`, `state.fix`)
 * are, again, `filters.ts`'s concern.
 */
export function matchesAdvisory(a: Advisory, _finding: Finding, terms: readonly Term[]): boolean {
  const severities = valuesOf(terms, "severity");
  if (severities.length > 0 && !matchesSeverityTerm(a, severities)) return false;

  const cves = valuesOf(terms, "cve");
  if (cves.length > 0 && !matchesCveTerm(a, cves)) return false;

  return true;
}
