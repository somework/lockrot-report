/** The Run tab of a report-2 (SPEC §7.9.16) as words, from `run` and root fields only. */

import type { Report2, Run } from "../model/report";
import { day, plural, pluralNoun } from "./format";
import { causeWord, checkReasonRich, feedAnswerWord, wordFor } from "./pageVocabulary";
import type { Piece, Rich } from "./rich";

export const RUN_WORDS = {
  tab: "Run data",
  facts: "This run",
  baseline: "Baseline",
  stale: "Entries for packages that left the lock",
  scoreLink: "How the score works ›",
  rules: (n: number): string => `The ${n} rules`,
  fixes: "Fixes, easiest first",
  lookup: "Advisory lookup",
  phpWindow: "PHP window",
  notes: "What this run could not see",
  acceptedUnchecked: "Accepted unchecked checks",
  gate: "Gate",
  thresholds: "Thresholds in force",
  noteDocs: "docs",
} as const;

const SCOPE_WORDS = {
  "composer-repositories": "packages from a Composer repository only (advisory-lookup)",
};

const SCOPE_SOURCE_WORDS = {
  default: "default",
  config: "set in extra.lockrot.advisory-lookup",
};

export interface AdvisoryLookupText {
  scope: string;
  asked: string;
  repositories: string[];
  other: string | null;
}

export function advisoryLookup({ advisory_lookup: lookup }: Run): AdvisoryLookupText {
  const repositories = lookup.repositories.map((repository) => {
    const answer = feedAnswerWord({
      answer: repository.outcome,
      records: repository.records,
      reason: repository.reason,
    });
    const outcome = repository.outcome === "answered" ? `answered · ${answer}` : answer;
    const parts = [
      `${repository.registry ?? repository.composer_repository}: ${outcome}`,
      ...(repository.packages_with_records === null
        ? []
        : [`${plural(repository.packages_with_records, "package", "packages")} with records`]),
      ...(repository.message === null ? [] : [repository.message]),
    ];
    return parts.join(" · ");
  });
  const others = lookup.other_repositories;
  return {
    scope: `Scope: ${wordFor(SCOPE_WORDS, lookup.scope)} · ${wordFor(SCOPE_SOURCE_WORDS, lookup.scope_source)}`,
    asked: `${plural(lookup.packages_asked, "package", "packages")} asked · ${lookup.packages_not_asked} not asked`,
    repositories,
    other:
      others === 0
        ? null
        : `${plural(others, "other repository", "other repositories")} ${pluralNoun(others, "publishes", "publish")} no advisories`,
  };
}

const MODE_WORDS = {
  check: "check",
  generate_baseline: "generate baseline",
};

/** `activity_cache_age_hours` as lockrot rounded it; null when no answer came from the cache. */
function activityCache({
  activity_cache_age_hours: hours,
  activity_cache_oldest_at: oldest,
}: Report2): string {
  if (hours === null || oldest === null) return "no cached answer read";
  return `from lockrot's cache, up to ${String(hours)} h old (oldest ${day(oldest)})`;
}

export function runFacts(report: Report2): { key: string; value: string | Rich }[] {
  const { run } = report;
  const moveCheck = moveCheckFact(report);
  return [
    { key: "mode", value: wordFor(MODE_WORDS, run.mode) },
    { key: "lock file", value: run.lock_file ?? "—" },
    { key: "require-dev", value: run.include_dev ? "checked" : "not checked" },
    { key: "repository activity", value: activityCache(report) },
    ...(moveCheck === null ? [] : [{ key: "moves", value: moveCheck }]),
  ];
}

/** `run.move_check` in the words of lockrot's text footer (`RunFooter::moveCheck`), or null when the
 *  run checked no move. */
export function moveCheckFact({ run }: Report2): Rich | null {
  const check = run.move_check;
  if (check === null) return null;
  switch (check.baseline) {
    case "resolves": {
      const lock = `checked with the solver of Composer${check.composer === null ? "" : ` ${check.composer}`} against the lock`;
      const names = check.blocking_disabled_by.flatMap((name, i): Piece[] => [
        ...(i > 0 ? [" and "] : []),
        { code: name },
      ]);
      // `ignores_extensions` is always true: the solve ignores ext-* requirements (§5.6).
      return names.length === 0
        ? [`${lock} · ext-* requirements not checked`]
        : [`${lock}, with advisory blocking turned off by `, ...names, " · ext-* requirements not checked"];
    }
    case "refused":
      return ["not checked, because Composer's solver refuses the lock itself"];
    default:
      return ["not checked (", ...checkReasonRich(check.reason ?? ""), ")"];
  }
}

export function baselineFacts({ baseline }: Report2): { head: string; stale: readonly string[] } | null {
  if (baseline === null) return null;
  const { path, known, worsened, stale } = baseline;
  return {
    head: `${path}: ${known} known · ${baseline.new} new · ${worsened} worsened · ${stale.length} stale`,
    stale,
  };
}

export interface NoteRow {
  text: string;
  docs: string | null;
}

export function noteRows({ note_details: notes }: Report2): NoteRow[] {
  return notes.map((note) => {
    const asked =
      note.code === "not_from_composer_repository" && "advisories_asked" in note.data
        ? ` · ${note.data.advisories_asked ? "advisories asked" : "advisories not asked"}`
        : "";
    return { text: `${note.text}${asked}`, docs: note.docs_url };
  });
}

/** The Run tab's note lines (golden `run_notes`). */
export const runNotes = (report: Report2): string[] => noteRows(report).map(({ text }) => text);

export function acceptedUnchecked(report: Report2): { head: string; rows: string[] } | null {
  const count = report.packages_unchecked_accepted;
  if (count === 0) return null;
  const rows = report.findings.flatMap((finding) =>
    finding.unchecked_accepted.map(({ check, reason, accepted_by: by }) =>
      [
        finding.package,
        check,
        causeWord(reason, finding.origin.kind),
        `${by.scope} ${by.value}`,
        by.reason,
        ...(by.expires === null ? [] : [`until ${day(by.expires)}`]),
      ].join(" · "),
    ),
  );
  return {
    head: `${plural(count, "package", "packages")} with a check your accept-unchecked list accepted`,
    rows,
  };
}

export function thresholdRows({ thresholds }: Run): { key: string; value: string }[] {
  if (thresholds === null) return [];
  return Object.entries(thresholds).map(([key, years]) => ({ key, value: plural(years, "year", "years") }));
}
