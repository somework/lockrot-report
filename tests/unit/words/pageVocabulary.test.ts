import { describe, expect, test } from "vitest";

import {
  ACTIVITY_WORDS,
  AGE_WORDS,
  addsBasisWord,
  allowlistBy,
  allowlistByInWhy,
  allowlistReason,
  CAUSE_WORDS,
  HALVING_WORDS,
  SORT_WORDS,
  causeWord,
  feedAnswerWord,
  fixLabel,
  forgeWord,
  grade,
  halvingWord,
  headlineReasonWord,
  lookupWord,
  metadataStatusWord,
  phpFloorWord,
  ruleWhyWord,
  shareGlyph,
  signalName,
  skippedCheckWord,
  wordFor,
  zeroVerdictWhen,
} from "../../../src/domain/pageVocabulary";
import { readContractJson } from "./recorded";

describe("every table with a recorded twin equals it", () => {
  test("cause words equal en/reason-words.json", () => {
    expect(CAUSE_WORDS).toEqual((readContractJson("en", "reason-words.json") as { words: unknown }).words);
  });

  test("activity words equal en/activity-words.json", () => {
    expect(ACTIVITY_WORDS).toEqual(readContractJson("en", "activity-words.json"));
  });

  test("age words equal en/age-words.json", () => {
    expect(AGE_WORDS).toEqual(readContractJson("en", "age-words.json"));
  });

  test("halving words equal en/halving-words.json", () => {
    expect(HALVING_WORDS).toEqual(readContractJson("en", "halving-words.json"));
  });

  test("sort words equal en/sort-words.json", () => {
    expect(SORT_WORDS).toEqual(readContractJson("en", "sort-words.json"));
  });

  test.each(
    (
      readContractJson("en", "php-versions.json") as {
        rows: { project_php_lowest: string | null; printed: string | null }[];
      }
    ).rows,
  )("the php floor $project_php_lowest prints as $printed", ({ project_php_lowest, printed }) => {
    expect(phpFloorWord(project_php_lowest)).toBe(printed);
  });
});

describe("an id the page does not know prints as written", () => {
  test("wordFor falls back to the id, and never reads the prototype", () => {
    expect(wordFor({ a: "A" }, "a")).toBe("A");
    expect(wordFor({ a: "A" }, "b")).toBe("b");
    expect(wordFor({ a: "A" }, "constructor")).toBe("constructor");
  });

  test("a forge and a fix kind", () => {
    expect([forgeWord("github"), forgeWord("forgejo")]).toEqual(["GitHub", "forgejo"]);
    expect([fixLabel("raise-php"), fixLabel("teleport")]).toEqual(["php floor raise", "teleport"]);
  });

  test("a cause word with an underscore reads as a space", () => {
    expect([causeWord("offline", "packagist"), causeWord("a_new_cause", "packagist")]).toEqual([
      "offline",
      "a new cause",
    ]);
  });

  test("a grade has an adjective for the answer, and an unknown grade is as written", () => {
    expect(["critical", "high", "medium", "low", "ok"].map(grade)).toEqual([
      "critical",
      "serious",
      "moderate",
      "minor",
      "ok",
    ]);
  });
});

describe("the words of SPEC 7.9.9", () => {
  test("a package of unknown origin is not 'not from a Composer repository'", () => {
    expect(causeWord("not_from_composer_repository", "vcs")).toBe("not from a Composer repository");
    expect(causeWord("not_from_composer_repository", "unknown")).toBe("origin unknown");
  });

  test("the signal names", () => {
    expect(["S1", "S5", "S10", "S11"].map(signalName)).toEqual([
      "marked abandoned",
      "PHP promise",
      "unchecked",
      "S11",
    ]);
  });

  test("the lookup word names its unchecked reason", () => {
    expect(lookupWord("complete", null)).toBe("lookup complete");
    expect(lookupWord("partial", "install_time_budget")).toBe("lookup partial (install-time budget spent)");
    expect(lookupWord("not_run", "offline")).toBe("not checked (offline)");
  });

  test("an advisory feed answers in words", () => {
    expect([
      feedAnswerWord({ answer: "answered", records: 1, reason: null }),
      feedAnswerWord({ answer: "answered", records: 0, reason: null }),
      feedAnswerWord({ answer: "failed", records: null, reason: "lookup_failed" }),
      feedAnswerWord({ answer: "not_asked", records: null, reason: "not_from_composer_repository" }),
      feedAnswerWord({ answer: "not_asked", records: null, reason: null }),
    ]).toEqual([
      "1 on record",
      "none on record",
      "lookup failed",
      "not asked (not from a Composer repository)",
      "not asked",
    ]);
  });

  test("why a package has no metadata", () => {
    expect([
      metadataStatusWord("not_from_composer_repository", "path"),
      metadataStatusWord("not_from_composer_repository", "unknown"),
      metadataStatusWord("unavailable", "packagist"),
      metadataStatusWord("not_found", "packagist"),
    ]).toEqual([
      "it is not installed from a Composer repository",
      "its origin is unknown",
      "its repository could not be read",
      "its repository does not list it",
    ]);
  });

  test("a share is a glyph, or a fraction", () => {
    expect(
      [
        { num: 1, den: 4 },
        { num: 1, den: 2 },
        { num: 1, den: 3 },
        { num: 3, den: 4 },
        { num: 2, den: 3 },
        { num: 1, den: 8 },
        { num: 5, den: 7 },
      ].map(shareGlyph),
    ).toEqual(["¼", "½", "⅓", "¾", "⅔", "⅛", "5/7"]);
  });

  test("a halving is worded by its reason, and an unknown reason by its divisor", () => {
    expect(halvingWord("dev", 2)).toBe("its whole score counts half: packages-dev");
    expect(halvingWord("odd", 3)).toBe("divided by 3: odd");
  });
});

describe("the small tables", () => {
  test("who accepted a flag, in full and in the Why", () => {
    expect(["builtin", "project", "type"].map(allowlistBy)).toEqual([
      "lockrot's built-in list",
      "your ignore list",
      "its package type's entry",
    ]);
    expect(["builtin", "project", "type"].map(allowlistByInWhy)).toEqual([
      "lockrot's list",
      "your ignore list",
      "its package type",
    ]);
  });

  test("an allowlist reason the page does not know is left to the entry", () => {
    expect(allowlistReason("symfony-packs")).toBe("a Symfony pack, which only lists dependencies");
    expect(allowlistReason("something-new")).toBeNull();
  });

  test("a zero verdict, a skipped check and a headline reason", () => {
    expect(["allowlisted", "no_metadata", "otherwise"].map(zeroVerdictWhen)).toEqual([
      "allowlisted",
      "no metadata",
      "otherwise",
    ]);
    expect(["release_branch", "repository_archived", "x"].map(skippedCheckWord)).toEqual([
      "its release branch",
      "its archived flag",
      "x",
    ]);
    expect(["branch_snapshot", "marked", "other"].map(headlineReasonWord)).toEqual([
      "snapshot",
      "marked",
      "other",
    ]);
  });

  test("a fact added by a move, and the rule why", () => {
    expect(["released_before_ga", "a_new_basis"].map(addsBasisWord)).toEqual([
      "it was released before your target PHP's major",
      "a new basis",
    ]);
    expect(["correlated-evidence", "another-reason"].map(ruleWhyWord)).toEqual([
      "correlated evidence",
      "another reason",
    ]);
  });

  test("an advisory feed that never answered", () => {
    expect(
      ["no_feed", "transport", "invalid_response", "new"].map((answer) =>
        feedAnswerWord({ answer, records: null, reason: null }),
      ),
    ).toEqual(["publishes no advisories", "network error", "unreadable answer", "new"]);
  });
});
