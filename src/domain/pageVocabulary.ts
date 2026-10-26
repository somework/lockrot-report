/**
 * The words the page keeps, keyed by ids (SPEC §7.9.9). No number of the model is among them, and
 * an id the page does not know prints as written. A table that lockrot records under
 * `contract/en/` equals its recording (`PageVocabularyTest`).
 */

import type { MoveCheck } from "../model/report";
import { plain, type Rich } from "./rich";

type Words = Readonly<Record<string, string>>;

export function wordFor(table: Words, id: string): string {
  const word = Object.hasOwn(table, id) ? table[id] : undefined;
  return word ?? id;
}

const readAsWords = (id: string, separator: string): string => id.replaceAll(separator, " ");

const GRADE_ADJECTIVES: Words = { critical: "critical", high: "serious", medium: "moderate", low: "minor" };

export function grade(id: string): string {
  return wordFor(GRADE_ADJECTIVES, id);
}

export const ACTIVITY_WORDS = {
  forge: { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" },
  event: { push: "push", commit: "commit" },
} as const;

export const forgeWord = (id: string): string => wordFor(ACTIVITY_WORDS.forge, id);
export const eventWord = (id: string): string => wordFor(ACTIVITY_WORDS.event, id);

const FIX_LABELS: Words = {
  update: "composer update",
  upgrade: "upgrade",
  "raise-php": "php floor raise",
  unknown: "fix unknown",
  blocked: "blocked",
  none: "no fix",
};

export const fixLabel = (id: string): string => wordFor(FIX_LABELS, id);

const SIGNAL_NAMES: Words = {
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
  S11: "PHP cap",
};

export const signalName = (id: string): string => wordFor(SIGNAL_NAMES, id);

const ALLOWLIST_BY: Words = {
  builtin: "lockrot's built-in list",
  project: "your ignore list",
  type: "its package type's entry",
};

const ALLOWLIST_BY_IN_WHY: Words = { ...ALLOWLIST_BY, builtin: "lockrot's list", type: "its package type" };

export const allowlistBy = (id: string): string => wordFor(ALLOWLIST_BY, id);
export const allowlistByInWhy = (id: string): string => wordFor(ALLOWLIST_BY_IN_WHY, id);

const ALLOWLIST_REASONS: Words = {
  "php-fig-interfaces": "a PHP-FIG interface package, complete by design",
  "php-fig-utilities": "a PHP-FIG utility package, complete by design",
  "symfony-polyfills": "a Symfony polyfill for functions of a newer PHP version",
  "symfony-extension-polyfills": "a Symfony polyfill for a PHP extension, released with Symfony",
  "symfony-packs": "a Symfony pack, which only lists dependencies",
  "getallheaders-polyfill": "a single-function getallheaders() polyfill, complete",
  "random-compat-empty": "an intentionally empty random_compat release (PHP 7 has random_bytes())",
  "type-metapackage": "a metapackage, which only lists dependencies",
  "type-symfony-pack": "a Symfony pack, which only lists dependencies",
};

/** The page's text of an allowlist reason id, or `null` for an id it does not know: the entry's own `reason` stands then. */
export const allowlistReason = (id: string): string | null =>
  Object.hasOwn(ALLOWLIST_REASONS, id) ? (ALLOWLIST_REASONS[id] ?? null) : null;

export interface ZeroVerdictMark {
  readonly word: string;
  readonly mark: "soft" | "ring-dot" | "hatch";
}

const ZERO_VERDICT_MARKS: Readonly<Record<string, ZeroVerdictMark>> = {
  ok: { word: "ok", mark: "soft" },
  finished: { word: "finished", mark: "ring-dot" },
  unknown: { word: "not judged", mark: "hatch" },
};

/** The page's word and waffle mark for a score-0 verdict, by the verdict's name; null for a graded
 *  verdict or one the page does not know, which is filled and named as written. */
export const zeroVerdictMark = (verdict: string): ZeroVerdictMark | null =>
  Object.hasOwn(ZERO_VERDICT_MARKS, verdict) ? (ZERO_VERDICT_MARKS[verdict] ?? null) : null;

const SKIPPED_CHECKS: Words = {
  repository_activity: "its repository activity",
  repository_archived: "its archived flag",
  release_metadata: "its release metadata",
  advisories: "its advisories",
  release_branch: "its release branch",
  release_dates: "release dates",
  releases: "releases",
};

export const skippedCheckWord = (id: string): string => wordFor(SKIPPED_CHECKS, id);

/** A check id with words of its own; any other prints as written in a code element. */
export const isKnownCheck = (id: string): boolean => Object.hasOwn(SKIPPED_CHECKS, id);

/** `check.reason` → reason words (SPEC §7.9.21), in the table's order, the order of the way-out items.
 *  The words are lockrot's `MoveCheck::REASON_WORDS`, so the page and `next_step.text` agree. */
export const CHECK_REASON_WORDS: readonly (readonly [reason: string, words: string])[] = [
  ["baseline_refused", "Composer refuses the lock itself"],
  ["unloaded_name", "a package it needs could not be loaded"],
  ["offline", "a package it needs is not in Composer's cache"],
  ["install_time_budget", "the install-time budget ran out"],
  ["not_from_composer_repository", "no Composer repository serves it"],
  ["no_composer_json", "the project has no composer.json"],
  ["composer_json_invalid", "Composer cannot load composer.json"],
  ["no_release_read", "no release of the row was read"],
  ["pass_cap", "Composer refused each move before it"],
  ["solver_error", "Composer's solver failed on it"],
  ["advisory_lookup_incomplete", "the advisory lookup did not cover a package it installs"],
];

/** A reason's words; an unknown reason as written, in a code element (SPEC §7.9.21). */
export function checkReasonRich(reason: string): Rich {
  const words = CHECK_REASON_WORDS.find(([id]) => id === reason)?.[1];
  return words === undefined ? [{ code: reason }] : [words];
}

export const CAUSE_WORDS: Words = {
  above_listed_releases: "installed above every listed release",
  accepted_by_config: "accepted by your accept-unchecked list",
  allowlisted: "allowlisted",
  anonymous_budget: "anonymous request budget spent",
  branch_snapshot: "a branch snapshot has no release branch",
  composer_too_old: "Composer older than 2.4",
  fetch_failed: "request failed",
  host_not_supported: "host not supported",
  install_time_budget: "install-time budget spent",
  installed_unlisted: "its installed release is not among the releases read",
  lookup_failed: "lookup failed",
  no_branch_row: "no release on its branch",
  no_composer_json: "the run read no composer.json",
  no_feed: "no repository publishes advisories",
  no_repository: "no repository found",
  no_stable_release: "no stable release",
  no_token: "no token",
  no_versions: "no version left to read",
  not_found: "not in the repository",
  not_from_composer_repository: "not from a Composer repository",
  offline: "offline",
  rate_limit: "rate limited",
  releases_unknown: "releases not read",
  repository_not_found: "repository not found",
  shared_commit: "dated only by a commit its tags share",
  through_other_package: "its installed release does not require the package itself",
  unavailable: "metadata unavailable",
  undated: "no date",
  undated_releases: "undated releases",
  unparseable_version: "version not readable",
  unreached: "lockrot found no path to it from composer.json",
};

/** A cause or a check reason in words. A finding of unknown origin has no "Composer repository" to blame. */
export function causeWord(id: string, originKind: string): string {
  if (id === "not_from_composer_repository" && originKind === "unknown") return "origin unknown";
  return Object.hasOwn(CAUSE_WORDS, id) ? wordFor(CAUSE_WORDS, id) : readAsWords(id, "_");
}

const LOOKUP_WORDS: Words = {
  complete: "lookup complete",
  partial: "lookup partial",
  not_run: "not checked",
};

export function lookupWord(check: string, uncheckedReason: string | null, originKind = ""): string {
  const word = wordFor(LOOKUP_WORDS, check);
  return uncheckedReason === null ? word : `${word} (${causeWord(uncheckedReason, originKind)})`;
}

export interface FeedAnswer {
  answer: string;
  records: number | null;
  reason: string | null;
}

export function feedAnswerWord({ answer, records, reason }: FeedAnswer, originKind = ""): string {
  switch (answer) {
    case "answered":
      return records === 0 || records === null ? "none on record" : `${records} on record`;
    case "failed":
      return "lookup failed";
    case "not_asked":
      return reason === null ? "not asked" : `not asked (${causeWord(reason, originKind)})`;
    case "no_feed":
      return "publishes no advisories";
    case "transport":
      return "network error";
    case "invalid_response":
      return "unreadable answer";
    default:
      return answer;
  }
}

const METADATA_STATUS: Words = {
  not_from_composer_repository: "it is not installed from a Composer repository",
  unavailable: "its repository could not be read",
  not_found: "its repository does not list it",
};

export function metadataStatusWord(status: string, originKind: string): string {
  if (status === "not_from_composer_repository" && originKind === "unknown") return "its origin is unknown";
  return wordFor(METADATA_STATUS, status);
}

const ORIGIN_KINDS: Words = {
  packagist: "Packagist",
  composer: "a Composer repository",
  path: "a local path",
  vcs: "a VCS repository",
  artifact: "an artifact",
  package: "an inline package in composer.json",
  unknown: "unknown",
};

export const originKindWord = (kind: string): string => wordFor(ORIGIN_KINDS, kind);

const PROVENANCE_STATUS: Words = {
  read: "read",
  not_from_composer_repository: "not from a Composer repository",
  unavailable: "its repository could not be read",
  not_found: "its repository does not list it",
  not_read: "not read",
};

const ACTIVITY_STATUS: Words = { read: "read", not_found: "repository not found", not_read: "not read" };

/** Provenance's metadata and activity status, a closed id in words. */
export const metadataProvenanceWord = (status: string): string => wordFor(PROVENANCE_STATUS, status);
export const activityProvenanceWord = (status: string): string => wordFor(ACTIVITY_STATUS, status);

const HEADLINE_REASONS: Words = { archived: "archived", marked: "marked", branch_snapshot: "snapshot" };

export const headlineReasonWord = (id: string): string => wordFor(HEADLINE_REASONS, id);

const ADDS_BASIS: Words = {
  released_before_ga: "it was released before your target PHP's major",
  branch_not_releasing: "that line no longer releases while a higher line does",
  stops_below_newest_php: "it stops below the newest PHP",
};

export const addsBasisWord = (id: string): string =>
  Object.hasOwn(ADDS_BASIS, id) ? wordFor(ADDS_BASIS, id) : readAsWords(id, "_");

export const HALVING_WORDS = {
  reason: {
    transitive: "its maintenance counts half: not required directly",
    unreached: "its maintenance counts half: lockrot found no path to it",
    dev: "its whole score counts half: packages-dev",
  },
  other: "divided by {divide_by}: {reason}",
} as const;

export function halvingWord(reason: string, divideBy: number): string {
  return Object.hasOwn(HALVING_WORDS.reason, reason)
    ? wordFor(HALVING_WORDS.reason, reason)
    : HALVING_WORDS.other.replace("{divide_by}", String(divideBy)).replace("{reason}", reason);
}

export const SORT_WORDS = {
  key: {
    verdict: "by grade",
    security: "findings with an advisory first, by what its advisories add to the score",
    score: "by the score",
    direct: "direct requirements first",
    package: "by name (bytes)",
  },
  dir: { order: "in the grade order", desc: "highest first", true_first: "first", asc: "A to Z" },
} as const;

export const AGE_WORDS = {
  reading: { installed: "installed", branch_release: "{branch}", release: "newest", push: "last {event}" },
  not_read: "{reading} not read ({reason words})",
  below: "below {kind}-warn-years {warn}",
  past: "past {kind}-{level}-years {years}",
  dated_by: "dated by {package}",
} as const;

const SHARE_GLYPHS: Words = { "1/4": "¼", "1/2": "½", "1/3": "⅓", "3/4": "¾", "2/3": "⅔", "1/8": "⅛" };

export function shareGlyph({ num, den }: { num: number; den: number }): string {
  return wordFor(SHARE_GLYPHS, `${num}/${den}`);
}

export const ruleWhyWord = (id: string): string =>
  id === "correlated-evidence" ? "correlated evidence" : readAsWords(id, "-");

/** `7.2.0` prints as `7.2`, and a floor with a real patch (`7.1.3`, `7.1.1`) as it is. */
export function phpFloorWord(projectPhpLowest: string | null): string | null {
  return projectPhpLowest?.replace(/\.0$/, "") ?? null;
}

const ZERO_VERDICT_REASONS: Words = { allowlisted: "accepted by an allowlist", no_metadata: "no metadata" };

/** Why a score of 0 earns a verdict; `null` for `otherwise`, which says nothing. */
export function zeroVerdictReason(when: string): string | null {
  if (when === "otherwise") return null;
  return Object.hasOwn(ZERO_VERDICT_REASONS, when)
    ? wordFor(ZERO_VERDICT_REASONS, when)
    : readAsWords(when, "_");
}

/** The fixed words of the "How the score works" panel (SPEC §7.9.12). `{slot}` takes a value of `run.score_model`. */
export const PANEL_WORDS = {
  title: "How the score works · score model {id}",
  bands: "Bands: {ruler}",
  bandsCaption: "from {ratio_from} up, each band starts at {ratio} × the one below",
  zero: "score 0: {zero}",
  weights: "Weights: {weights}",
  afterLead: "after the lead, {share}: {shares}",
  anchor: "the previous release's bands: {bands}",
  corroboration: "with corroboration at most {limits}",
  advisories: "Advisories: {points}",
  counts_as: "{id} {points} (counts as {counts_as})",
  noReachableFix: "when no reachable fix: {points}",
  factor: "× {factor}",
  doubled: "doubled",
  fixes: "Fixes: {fixes}",
  floorsBelow: "{verdict} from {floor}",
  none: "—",
  sortJoin: ", then ",
} as const;

/**
 * A rule's label, its caption and the example that follows the caption, keyed by rule id. A
 * `{slot}` is a parameter or an `illustration` value of the rule; a template with an unfilled slot
 * is left out, never printed with the slot.
 */
export const RULE_WORDS: Readonly<Record<string, { label: string; caption: string; example?: string }>> = {
  counted: {
    label: "counted",
    caption:
      "accepted facts are shown, never counted; an ignore[] entry's {accept_group} word also accepts the words below it",
  },
  "lead-first": { label: "lead in full", caption: "the strongest maintenance fact counts in full" },
  "corroborating-share": {
    label: "{share} for the rest",
    caption: "correlated evidence",
    example: "{lead} {weight} + {flag} {points}",
  },
  "advisory-points": { label: "advisory points", caption: "{basis}" },
  "no-reachable-fix-multiplier": {
    label: "× {factor}",
    caption: "no reachable fix",
    example: "{severity} {before} → {after}, {band_before} → {band_after}",
  },
  "security-max": {
    label: "highest-scoring advisory",
    caption: "one number per part",
    example: "a second advisory adds nothing unless it scores more; ties by {tie_break}",
  },
  "divide-reach": {
    label: "÷ {by} reach",
    caption: "maintenance of a {when} package",
    example: "{flag} {before} → {after}",
  },
  "security-exempt-from-reach": {
    label: "not for security",
    caption: "reach never halves security",
    example: "a {reach} {severity} stays {total}",
  },
  sum: {
    label: "sum",
    caption: "parts add",
    example:
      "{maintenance} + {security} = {total}, {band}; {low_maintenance} + {low_security} = {low_total}, {low_band}",
  },
  "divide-dev": {
    label: "÷ {by} dev",
    caption: "packages-dev halves the whole score",
    example: "{before} → {after}",
  },
  "floor-once": { label: "floor once", caption: "", example: "{exact} → {total}" },
  "band-floors": {
    label: "band floors",
    caption: "from {ratio_from} up each floor is {ratio} × the one below",
    example: "{floors}",
  },
  "zero-verdicts": { label: "zero verdicts", caption: "score 0 says why", example: "{zero}" },
  sort: { label: "sort", caption: "{sort}" },
  "gate-bounded-new": {
    label: "gate",
    caption: "with a baseline: min(score, {cap_multiplier} × new)",
    example: "score {score}, new {new} → {gate}",
  },
  "baseline-cover": {
    label: "cover",
    caption: "a recorded flag covers itself and every flag after it in the {order}",
  },
};

/** What an unknown rule id shows beside itself: the arithmetic its `kind` and parameters imply. */
export const RULE_KIND_WORDS: Readonly<Record<string, string>> = {
  share: "× {share}",
  multiply: "× {factor}",
  divide: "÷ {by} ({when})",
  combine: "{op}",
  band: "floors × {ratio} from {ratio_from}",
  gate: "min(score, {cap_multiplier} × new)",
  cover: "covers {covers}",
  floor: "floor",
  max: "max",
};

/** How a severity's points are read (`severities[].basis.points`), for the caption of the advisory-points rule. */
export const SEVERITY_BASIS_WORDS: Readonly<Record<string, string>> = {
  band_floor: "{ids} at their band floor",
  counts_as: "{id} counts as {counts_as}",
  share: "{id} {share} of {of}",
};

export const RULE_NOT_FOR_SECURITY_DEV = "packages-dev still halves it";

/** What each flag claims, for the glossary; a config key it names takes the run's value there. */
const FLAG_CLAIMS: Words = {
  abandoned:
    "The package's Composer repository marks it abandoned, or its repository is archived on its host.",
  silent: "No release for release-high-years and no push for push-high-years.",
  pinned: "The installed version is a branch snapshot, or the package has no tagged release at all.",
  "left-behind":
    "No stable release on the installed release branch for release-warn-years, while a higher branch keeps releasing.",
  "old-promise":
    "The installed release predates the target PHP's major, and its require.php admits the target only because it has no upper bound.",
  stale: "No release for release-warn-years, or no push for push-warn-years, short of silent.",
  capped: "It stops below the newest PHP.",
  vulnerable: "A counted security advisory affects the installed version.",
};

export const flagClaim = (id: string): string =>
  Object.hasOwn(FLAG_CLAIMS, id) ? wordFor(FLAG_CLAIMS, id) : "A flag this page does not know.";

/** The skip link: to the rows of a tab that lists packages, else to the tab's content. */
export const skipLinkLabel = (lists: boolean): string => (lists ? "Skip to the list" : "Skip to the content");

/** `next_step.kind` in the schema's `x-known-values` order (`#/definitions/move/properties/kind`),
 *  each with the short words the move cards and the Findings row use for it. */
export const MOVE_KIND_WORDS: readonly (readonly [kind: string, words: string])[] = [
  ["replace", "replace"],
  ["find-alternative", "find an alternative"],
  ["tag", "move to a tag"],
  ["require", "require"],
  ["update", "composer update"],
  ["raise-php", "raise PHP"],
  ["test", "test"],
  ["blocked", "blocked"],
  ["no-tag", "no tag"],
  ["no-move", "no move"],
  ["no-fix", "no fix"],
  ["no-single-fix", "see advisories"],
];

/** The way-out words for a finding with no move, by the `kind` of its `gate.by[]` entry, in that
 *  field's `x-known-values` order. `unchecked` adds the words of the check that did not run. */
export const GATE_KIND_WORDS: readonly (readonly [kind: string, words: string])[] = [
  ["grade", "no move for its grade"],
  ["flag", "no move for its flag"],
  ["vulnerable", "no move for its advisories"],
  ["unchecked", "unchecked"],
];

/** §7.9.16's words for a check that did not run, by the signal an `unchecked` gate value names. A
 *  signal without words of its own reads "{signal name} not checked". */
/** §7.9.16's words for the advisory check that did not run. */
export const ADVISORY_NOT_RUN = "the advisory check did not run";

const UNCHECKED_SIGNAL_WORDS: Readonly<Record<string, string>> = { S9: ADVISORY_NOT_RUN };

export const uncheckedWords = (signal: string, name: string): string =>
  Object.hasOwn(UNCHECKED_SIGNAL_WORDS, signal)
    ? (UNCHECKED_SIGNAL_WORDS[signal] ?? signal)
    : `${name} not checked`;

/** The short words of a check that stopped a move (SPEC §7.9.21): "Composer refuses the move" or
 *  "not checked: {reason words}"; null for a resolving check or none. */
export function stoppedCheckWords(check: MoveCheck): string | null {
  if (check === null) return null;
  if (check.result === "refused") return "Composer refuses the move";
  if (check.result === "not_checked") return `not checked: ${plain(checkReasonRich(check.reason ?? ""))}`;
  return null;
}
