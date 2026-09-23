/**
 * The two places the page reads PHP-rendered text instead of a structured field. Both are isolated
 * here, tested on their own, and documented with exactly what lockrot wording each one depends on,
 * because either one silently stops working the day lockrot rephrases the text it was reading.
 * lockrot should expose a structured field for both cases instead of leaving the page to sniff
 * prose; until it does, this is the one place in the renderer that does it.
 */

import type { Finding, Signal } from "../model/types";

/**
 * Whether the finding's own evidence says lockrot found no fix for a security advisory — depends
 * on lockrot's `Finding.php` (`noFixClause()`) literally writing the phrase "no fix expected" into
 * evidence text. A structured `finding.hasUnfixableAdvisory` boolean would make this unnecessary.
 *
 * Legacy tested the whole `evidence` string (report.js:733), which includes the S7 signal's own
 * summary — "pulls in flagged packages" — appended as a trailing clause by `Finding::evidence()`
 * (contract.md §2.4). An S7 summary that happens to contain "no fix expected" would then trigger
 * this for a package with no security advisories of its own (critic.md M31). Stripping that known
 * suffix before testing is the fix: this reads only the finding's OWN evidence.
 */
export function hasNoFixExpected(finding: Finding): boolean {
  return /no fix expected/.test(ownEvidence(finding));
}

/**
 * `finding.evidence` is `ownEvidence()` with the S7 signal's `summary` appended as a final
 * `"; "`-joined part, when an S7 signal exists (contract.md §2.4). This strips that known suffix
 * back off so the rest of the module tests only what the finding says about itself.
 */
function ownEvidence(finding: Finding): string {
  const s7 = finding.signals.find((signal: Signal) => signal.id === "S7");
  if (!s7 || !s7.summary) return finding.evidence;

  const suffix = "; " + s7.summary;
  if (finding.evidence.endsWith(suffix)) return finding.evidence.slice(0, -suffix.length);
  // ownEvidence() falls back to `note ?? ''` when it has no parts of its own; evidence() may then
  // be just the S7 summary with nothing in front of it to join onto.
  if (finding.evidence === s7.summary) return "";
  return finding.evidence;
}

/**
 * Which documentation page a run note points readers at — depends on lockrot's own note wording
 * containing "token", "activity" or "repository" (legacy report.js:632). A structured note "kind"
 * on `ReportModel.notes` would make this unnecessary; until then this is a guess from prose.
 */
export function noteDocLink(note: string): string {
  return /token|activity|repository/.test(note)
    ? "https://lockrot.dev/internals/"
    : "https://lockrot.dev/configuration/";
}
