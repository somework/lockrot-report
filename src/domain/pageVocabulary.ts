/**
 * The words the page keeps, keyed by ids (SPEC §7.9.9). No number of the model is among them, and
 * an id the page does not know prints as written. A table that lockrot records under
 * `contract/en/` equals its recording (`PageVocabularyTest`).
 */

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

const ZERO_VERDICT_WHEN: Words = { allowlisted: "allowlisted", no_metadata: "no metadata" };

export const zeroVerdictWhen = (id: string): string => wordFor(ZERO_VERDICT_WHEN, id);

const SKIPPED_CHECKS: Words = {
  repository_activity: "its repository activity",
  repository_archived: "its archived flag",
  release_metadata: "its release metadata",
  advisories: "its advisories",
  release_branch: "its release branch",
};

export const skippedCheckWord = (id: string): string => wordFor(SKIPPED_CHECKS, id);

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

export function feedAnswerWord({ answer, records, reason }: FeedAnswer): string {
  switch (answer) {
    case "answered":
      return records === 0 || records === null ? "none on record" : `${records} on record`;
    case "failed":
      return "lookup failed";
    case "not_asked":
      return reason === null ? "not asked" : `not asked (${causeWord(reason, "")})`;
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

const HEADLINE_REASONS: Words = { archived: "archived", marked: "marked", branch_snapshot: "snapshot" };

export const headlineReasonWord = (id: string): string => wordFor(HEADLINE_REASONS, id);

const ADDS_BASIS: Words = {
  released_before_ga: "it was released before your target PHP's major",
  branch_not_releasing: "that line no longer releases while a higher line does",
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
