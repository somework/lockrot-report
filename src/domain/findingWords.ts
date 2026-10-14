/** Words and clauses that a report-2 finding's answer (SPEC §7.9.13) and its Why lines (§7.9.8) share. */

import type {
  CheckMissing,
  CheckSkipped,
  Finding,
  Modifier,
  Run,
  S1,
  S2,
  S3,
  S4,
  S5,
  S6,
  S8,
  S9,
  S9row,
  SecurityVulnerable,
  Severity,
  SignalId,
} from "../model/report2";
import { pluralNoun } from "./format";
import { vocabTable } from "./vocab";

// TODO: REPORT-C1 - read these rows from the page vocabulary tables of SPEC §7.9.9 once they merge.
const GRADE_ADJECTIVES = vocabTable<Record<string, string>>({
  critical: "critical",
  high: "serious",
  medium: "moderate",
  low: "minor",
});
const FORGE_WORDS = vocabTable<Record<string, string>>({
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
});
const FIX_LABELS = vocabTable<Record<string, string>>({
  update: "composer update",
  upgrade: "upgrade",
  "raise-php": "php floor raise",
  unknown: "fix unknown",
  blocked: "blocked",
  none: "no fix",
});
const SIGNAL_NAMES = vocabTable<Record<string, string>>({
  S1: "marked abandoned",
  S2: "release age",
  S3: "archived repository",
  S4: "repository activity",
  S5: "PHP promise",
  S6: "pinned version",
  S7: "pulled-in packages",
  S8: "release branch",
  S9: "advisories",
  S10: "unchecked",
});
const ALLOWLIST_BY_WORDS = vocabTable<Record<string, string>>({
  builtin: "lockrot's built-in list",
  project: "your ignore list",
  type: "its package type's entry",
});
const ALLOWLIST_BY_SHORT = vocabTable<Record<string, string>>({
  builtin: "lockrot's list",
  project: "your ignore list",
  type: "its package type",
});
const ALLOWLIST_REASON_WORDS = vocabTable<Record<string, string>>({
  "php-fig-interfaces": "a PHP-FIG interface package, complete by design",
  "php-fig-utilities": "a PHP-FIG utility package, complete by design",
  "symfony-polyfills": "a Symfony polyfill for functions of a newer PHP version",
  "symfony-extension-polyfills": "a Symfony polyfill for a PHP extension, released with Symfony",
  "symfony-packs": "a Symfony pack, which only lists dependencies",
  "getallheaders-polyfill": "a single-function getallheaders() polyfill, complete",
  "random-compat-empty": "an intentionally empty random_compat release (PHP 7 has random_bytes())",
  "type-metapackage": "a metapackage, which only lists dependencies",
  "type-symfony-pack": "a Symfony pack, which only lists dependencies",
});
const SKIPPED_CHECK_WORDS = vocabTable<Record<string, string>>({
  repository_activity: "its repository activity",
  repository_archived: "its archived flag",
  release_metadata: "its release metadata",
  advisories: "its advisories",
  release_branch: "its release branch",
});
const CHECK_REASON_WORDS = vocabTable<Record<string, string>>({
  undated_releases: "undated releases",
  allowlisted: "allowlisted",
  no_token: "no token",
  anonymous_budget: "anonymous request budget spent",
  install_time_budget: "install-time budget spent",
  offline: "offline",
  rate_limit: "rate limited",
  fetch_failed: "request failed",
  no_repository: "no repository found",
  host_not_supported: "host not supported",
  repository_not_found: "repository not found",
  not_from_composer_repository: "not from a Composer repository",
  unavailable: "metadata unavailable",
  not_found: "not in the repository",
  releases_unknown: "releases not read",
  composer_too_old: "Composer older than 2.4",
  lookup_failed: "lookup failed",
  no_feed: "no repository publishes advisories",
  unparseable_version: "version not readable",
  branch_snapshot: "a branch snapshot has no release branch",
  accepted_by_config: "accepted by your accept-unchecked list",
});
const METADATA_WORDS = vocabTable<Record<string, string>>({
  not_from_composer_repository: "it is not installed from a Composer repository",
  unavailable: "its repository could not be read",
  not_found: "its repository does not list it",
});
const RERUN_HALVING_WORDS = vocabTable<Record<string, string>>({
  transitive: "its maintenance counts half: not required directly",
  unreached: "its maintenance counts half: lockrot found no path to it",
  dev: "its whole score counts half: packages-dev",
});
const ADDS_BASIS_WORDS = vocabTable<Record<string, string>>({
  released_before_ga: "it was released before your target PHP's major",
  branch_not_releasing: "that line no longer releases while a higher line does",
});
const SHARE_GLYPHS = vocabTable<Record<string, string>>({
  "1/4": "¼",
  "1/2": "½",
  "1/3": "⅓",
  "3/4": "¾",
  "2/3": "⅔",
  "1/8": "⅛",
});
const RULE_WHY_WORDS = vocabTable<Record<string, string>>({ "correlated-evidence": "correlated evidence" });

/** The reach of every list of names a sentence prints before "and {n} more". */
const NAMES_SHOWN = 3;
/** The alternatives of a php constraint printed in full; a longer one prints its first and last. */
const PHP_ALTERNATIVES_SHOWN = 4;

const spaced = (id: string, separator: string): string => id.split(separator).join(" ");

export const gradeAdjective = (grade: string): string => GRADE_ADJECTIVES[grade] ?? grade;
export const forgeWord = (forge: string): string => FORGE_WORDS[forge] ?? forge;
export const fixLabel = (kind: string): string => FIX_LABELS[kind] ?? kind;
export const signalName = (id: string): string => SIGNAL_NAMES[id] ?? id;
export const allowlistByWords = (by: string): string => ALLOWLIST_BY_WORDS[by] ?? by;
export const allowlistByShort = (by: string): string => ALLOWLIST_BY_SHORT[by] ?? by;
export const addsBasisWords = (basis: string): string => ADDS_BASIS_WORDS[basis] ?? spaced(basis, "_");
export const ruleWhyWords = (why: string): string => RULE_WHY_WORDS[why] ?? spaced(why, "-");
export const shareGlyph = ({ num, den }: { num: number; den: number }): string =>
  SHARE_GLYPHS[`${num}/${den}`] ?? `${num}/${den}`;

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
export const isAre = (n: number): string => pluralNoun(n, "is", "are");

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** At most three names, then "and {n} more". */
export function namesCapped(names: readonly string[]): string {
  if (names.length <= NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, NAMES_SHOWN).join(", ")} and ${names.length - NAMES_SHOWN} more`;
}

export const oneDecimal = (years: number | null): string => (years === null ? "" : years.toFixed(1));

/** A published years value as a relation; a published 0 is under three weeks. */
export const ago = (years: number | null): string =>
  years === 0 ? "less than three weeks ago" : `${oneDecimal(years)} years ago`;

/** `run.project_php_lowest` as a sentence prints it: a trailing `.0` patch is dropped. */
export function phpDisplay(version: string | null): string {
  const parts = (version ?? "").split(".");
  return parts.length === 3 && parts[2] === "0" ? parts.slice(0, 2).join(".") : (version ?? "");
}

/** A php constraint as written, or "{first} … {last} ({n} alternatives)" when it has many. */
export function phpShown(constraint: string | null): string {
  const alternatives = (constraint ?? "")
    .trim()
    .split(/\s*\|\|?\s*/)
    .filter(Boolean);
  if (alternatives.length <= PHP_ALTERNATIVES_SHOWN) return constraint ?? "";
  return `${alternatives[0]} … ${alternatives[alternatives.length - 1]} (${alternatives.length} alternatives)`;
}

interface SignalData {
  S1: S1;
  S2: S2;
  S3: S3;
  S4: S4;
  S5: S5;
  S6: S6;
  S8: S8;
  S9: S9;
}

export function signalData<I extends keyof SignalData>(finding: Finding, id: I): SignalData[I] | null {
  const signal = finding.signals.find((s) => s.id === id);
  return signal ? (signal.data as SignalData[I]) : null;
}

export const advisoryRows = (finding: Finding): S9row[] => signalData(finding, "S9")?.advisories ?? [];

/** An advisory as every sentence names it: its S9 row's cve, else its id. */
export function advisoryName(finding: Finding, id: string): string {
  return advisoryRows(finding).find((row) => row.id === id)?.cve ?? id;
}

export function countsAs(run: Run, severity: Severity): Severity | null {
  return run.score_model.severities.find((s) => s.id === severity)?.counts_as ?? null;
}

const unknownOrigin = (finding: Finding): boolean => finding.origin.kind === "unknown";

export function checkReasonWords(finding: Finding, reason: string | null): string {
  if (reason === "not_from_composer_repository" && unknownOrigin(finding)) return "origin unknown";
  return reason === null ? "" : (CHECK_REASON_WORDS[reason] ?? spaced(reason, "_"));
}

export function metadataWords(finding: Finding): string {
  const status = finding.metadata.status;
  if (status === "not_from_composer_repository" && unknownOrigin(finding)) return "its origin is unknown";
  return METADATA_WORDS[status] ?? status;
}

/** One check entry's reason as a sentence words it; an accepted check carries the project's own reason. */
function entryReasonWords(finding: Finding, entry: CheckMissing | CheckSkipped): string {
  if (entry.reason === "accepted_by_config") {
    const accepted = finding.unchecked_accepted.find((u) => u.check === entry.check);
    if (accepted) {
      return `${entryReasonWords(finding, accepted)}; ${CHECK_REASON_WORDS.accepted_by_config}: ${accepted.accepted_by.reason}`;
    }
  }
  const words = checkReasonWords(finding, entry.reason);
  const host = finding.activity.host;
  return entry.reason === "host_not_supported" && host ? `${words}: lockrot cannot ask ${host}` : words;
}

function idsReasonWords(
  finding: Finding,
  entries: readonly (CheckMissing | CheckSkipped)[],
  id: SignalId,
): string {
  const words: string[] = [];
  for (const entry of entries) {
    if (!entry.blocks.includes(id)) continue;
    const w = entryReasonWords(finding, entry);
    if (!words.includes(w)) words.push(w);
  }
  return words.join(", ");
}

/** Ids grouped by the reason words of the entries that block them, groups in first-seen order. */
function byReason(
  finding: Finding,
  entries: readonly (CheckMissing | CheckSkipped)[],
  ids: readonly SignalId[],
): { ids: SignalId[]; words: string }[] {
  const groups: { ids: SignalId[]; words: string }[] = [];
  for (const id of ids) {
    const words = idsReasonWords(finding, entries, id);
    const group = groups.find((g) => g.words === words);
    if (group) group.ids.push(id);
    else groups.push({ ids: [id], words });
  }
  return groups;
}

const checkNames = (ids: readonly string[]): string => joinList(ids.map((id) => `${signalName(id)} (${id})`));

/** "release age (S2) not checked (undated releases); release branch (S8) incomplete (undated releases)", or null. */
export function checksMissingBody(finding: Finding, run: Run): string | null {
  if (finding.checks_missing.length === 0) return null;
  const order = (id: SignalId): number => {
    const at = run.signal_ids.indexOf(id);
    return at === -1 ? run.signal_ids.length : at;
  };
  const ids = [...new Set(finding.checks_missing.flatMap((c) => c.blocks))].sort(
    (a, b) => order(a) - order(b),
  );
  const fired = new Set(finding.signals.map((s) => s.id));
  const parts = [
    { ids: ids.filter((id) => !fired.has(id)), state: "not checked" },
    { ids: ids.filter((id) => fired.has(id)), state: "incomplete" },
  ].flatMap(({ ids: group, state }) =>
    byReason(finding, finding.checks_missing, group).map((g) => `${checkNames(g.ids)} ${state} (${g.words})`),
  );
  return parts.join("; ");
}

/**
 * The checks lockrot chose not to run, grouped by reason: "its repository activity (allowlisted)". A snapshot's
 * release branch is left out, and the release metadata too when another sentence already says it was not read.
 */
export function checksSkippedBody(
  finding: Finding,
  { metadataSaid = false, acceptedOnly = false }: { metadataSaid?: boolean; acceptedOnly?: boolean },
): string | null {
  const groups: { words: string; checks: string[] }[] = [];
  for (const entry of finding.checks_skipped) {
    const accepted = entry.reason === "accepted_by_config";
    if (entry.reason === "branch_snapshot") continue;
    if (metadataSaid && entry.check === "release_metadata" && !accepted) continue;
    if (acceptedOnly && !accepted) continue;
    const words = entryReasonWords(finding, entry);
    const check = SKIPPED_CHECK_WORDS[entry.check] ?? spaced(entry.check, "_");
    const group = groups.find((g) => g.words === words);
    if (group) group.checks.push(check);
    else groups.push({ words, checks: [check] });
  }
  if (groups.length === 0) return null;
  return groups.map((g) => `${g.checks.join(" and ")} (${g.words})`).join("; ");
}

/** The checks the `release_metadata` gap blocks, named as the Checks strip names them, and how many. */
export function unjudgedChecks(finding: Finding): { names: string; count: number } {
  const ids = [
    ...new Set(
      [...finding.checks_skipped, ...finding.checks_missing]
        .filter((c) => c.check === "release_metadata")
        .flatMap((c) => c.blocks),
    ),
  ];
  return ids.length === 0
    ? { names: "its release checks", count: 1 }
    : { names: checkNames(ids), count: ids.length };
}

/** No release metadata was read and no maintenance term counts. */
export function maintenanceNotJudged(finding: Finding): boolean {
  const score = finding.score;
  const status = "parts" in score ? score.parts.maintenance.status : null;
  return !finding.maintenance_judged && status !== "counted";
}

/** " (its maintenance counts half: not required directly)" for the halvings a rerun applied, or "". */
export function rerunHalving(modifiers: readonly Modifier[]): string {
  const words = modifiers
    .filter((m) => m.before !== m.after)
    .map((m) => RERUN_HALVING_WORDS[m.reason] ?? `divided by ${m.divide_by}: ${m.reason}`);
  return words.length > 0 ? ` (${words.join("; ")})` : "";
}

export const printedModifiers = (modifiers: readonly Modifier[]): Modifier[] =>
  modifiers.filter((m) => m.before !== m.after);

/** The words of the entry that allowlists the package: the vocabulary's for lockrot's own reasons. */
export function allowlistReasonWords(allowlist: NonNullable<Finding["allowlist"]>): string {
  const vocabulary = allowlist.reason_id === null ? undefined : ALLOWLIST_REASON_WORDS[allowlist.reason_id];
  if (allowlist.reason_by === "lockrot" && vocabulary) return vocabulary;
  return allowlist.reason || "no reason given";
}

/** What `security.partial` clears: its flags by id, then "{k} of its {n} advisories". */
export function partialClears(finding: Finding, partial: NonNullable<SecurityVulnerable["partial"]>): string {
  const of = "parts" in finding.score ? finding.score.parts.security.of : 0;
  const flags = partial.clears.filter((c) => c.kind === "flag").map((c) => c.id);
  const advisories = partial.clears.filter((c) => c.kind === "advisory").length;
  return [...flags, `${advisories} of its ${of} advisories`].join(" and ");
}

export const acceptsWholePackage = (finding: Finding): boolean =>
  finding.allowlist !== null && finding.allowlist.flag_ids === null;
