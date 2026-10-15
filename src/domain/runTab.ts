/** The Run tab of a report-2 (SPEC §7.9.16) as words, from `run` and root fields only. */

import type { Report2, Run } from "../model/report2";
import { day, plural, pluralNoun } from "./format";
import { causeWord, feedAnswerWord, wordFor } from "./pageVocabulary";

export const RUN_WORDS = {
  tab: "Run data",
  scoreLink: "How the score works ›",
  rules: (n: number): string => `The ${n} rules`,
  fixes: "Fixes, easiest first",
  lookup: "Advisory lookup",
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
    const parts = [
      `${repository.registry ?? repository.composer_repository}: ${answer}`,
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
