import { describe, expect, it } from "vitest";
import {
  GATE_WORDS,
  nextStepWords,
  heldByLine,
  heldByWords,
  moreWord,
  reachLine,
  rowAfter,
  rowBlockedWords,
  rowCommand,
  rowHolds,
  majorCount,
  majorCountWords,
  rowNewLine,
} from "../../../src/domain/findingRow";
import { commandLabel } from "../../../src/domain/moveCards";
import type { Finding, Run } from "../../../src/model/report";

type Hold = Parameters<typeof heldByLine>[0][number];
const hold = (name: string | null, source = "package", verdict: string | null = null): Hold =>
  ({ source, package: name, holder: verdict === null ? null : { verdict } }) as Hold;
const run = { graded_verdicts: ["critical", "high", "medium", "low"] } as unknown as Run;

function finding(overrides: Record<string, unknown>): Finding {
  return {
    reach: "transitive",
    dev: false,
    direct_dependents: ["a/one", "a/two", "a/three"],
    chain: [],
    next_step: null,
    ...overrides,
  } as unknown as Finding;
}

const step = (overrides: Record<string, unknown>) => ({ held_by: [], also: [], commands: [], ...overrides });

describe("reachLine (accepted derivation 2)", () => {
  it("names chain[0] when direct_dependents lists it, and counts the others", () => {
    const f = finding({ chain: ["a/two", "b/mid", "c/pkg"] });
    expect(reachLine(f)).toEqual({ lead: "via", through: "a/two", more: 2, dev: false });
  });

  it("names direct_dependents[0] when chain is empty or its first entry is not a direct dependent", () => {
    expect(reachLine(finding({}))).toEqual({ lead: "via", through: "a/one", more: 2, dev: false });
    expect(reachLine(finding({ chain: ["z/other", "c/pkg"] }))).toEqual({
      lead: "via",
      through: "a/one",
      more: 2,
      dev: false,
    });
  });

  it("says direct with no name", () => {
    expect(reachLine(finding({ reach: "direct", dev: true }))).toEqual({
      lead: "direct",
      through: null,
      more: 0,
      dev: true,
    });
  });
});

describe("the holders of a row (accepted derivation 3)", () => {
  it("counts each package holder once, over held_by then the also moves, and names the first in data order on equal ranks", () => {
    const f = finding({
      next_step: step({
        held_by: [hold(null, "root"), hold("b/one"), hold("b/two")],
        also: [{ held_by: [hold("b/two"), hold("b/three")] }],
      }),
    });
    const line = heldByLine(rowHolds(f), run, "c/pkg");
    expect(line).toEqual({ name: "b/one", more: 2 });
    expect(line === null ? null : heldByWords(line)).toBe("held by b/one and 2 more");
  });

  it("names the holder of the highest grade first, by the sheet's holder rank", () => {
    const holds = [
      hold("a/ok", "package", "ok"),
      hold("a/medium", "package", "medium"),
      hold("a/high", "package", "high"),
    ];
    expect(heldByLine(holds, run, "c/pkg")).toEqual({ name: "a/high", more: 2 });
  });

  it("names a hold by the finding's own package after the root and before every other package, whatever its grade", () => {
    const holds = [
      hold("a/high", "package", "high"),
      hold(null, "root"),
      hold("symfony/mailer", "package", "low"),
    ];
    expect(heldByLine(holds, run, "symfony/mailer")).toEqual({ name: "its own release", more: 1 });
  });

  it("says the root as the sheet's Held by does when only the root holds", () => {
    const line = heldByLine([hold(null, "root")], run, "c/pkg");
    expect(line === null ? null : heldByWords(line)).toBe("held by your composer.json");
    expect(heldByLine([], run, "c/pkg")).toBeNull();
  });

  it("counts the rest in words", () => {
    expect(moreWord(6)).toBe("and 6 more");
  });
});

describe("rowCommand (accepted derivation 8)", () => {
  it("shows the first update or require step as a POSIX line", () => {
    const f = finding({
      package: "a/b",
      next_step: step({
        commands: [
          ["composer", "why-not", "a/b", "2.0"],
          ["composer", "require", "a/b:^2.0"],
        ],
      }),
    });
    expect(rowCommand(f)).toBe("composer require 'a/b:^2.0'");
  });

  it("shows no command when every step is a why-not", () => {
    const f = finding({
      package: "a/b",
      next_step: step({ commands: [["composer", "why-not", "a/b", "2.0"]] }),
    });
    expect(rowCommand(f)).toBeNull();
  });

  it("shows no step of a move when one argv fails the check (SPEC §5.6)", () => {
    const f = finding({
      package: "a/b",
      next_step: step({
        commands: [
          ["composer", "update", "a/b"],
          ["composer", "exec", "calc"],
        ],
      }),
    });
    expect(rowCommand(f)).toBeNull();
  });
});

describe("R16: the blocked words of a move that fixes no advisory", () => {
  const blocked = (fixKind: "blocked" | null, clears: { kind: string; id: string }[] = []) =>
    finding({
      package: "a/b",
      next_step: step({
        kind: "blocked",
        fix_kind: fixKind,
        to_branch: "3.x",
        php_check: { requires: ">=8.5" },
        clears,
      }),
    });

  it("say no newer release runs when the move has no fix kind", () => {
    expect(
      nextStepWords(blocked(null, [{ kind: "advisory", id: "GHSA-1" }]), { ...run, target_php: "8.4" }).text,
    ).toBe("3.x needs php >=8.5; target 8.4 runs no newer release");
  });

  it("say no fixing release runs when the move has a fix kind, though it clears nothing", () => {
    expect(nextStepWords(blocked("blocked"), { ...run, target_php: "8.4" }).text).toBe(
      "3.x needs php >=8.5; target 8.4 runs no fixing release",
    );
  });

  it("are the row's blocked words, which a pinned move and a move of another kind leave null", () => {
    const pinned = finding({
      package: "a/b",
      next_step: step({ kind: "blocked", source: "pinned", fix_kind: null }),
    });
    const update = finding({ package: "a/b", next_step: step({ kind: "update" }) });

    expect(rowBlockedWords(blocked("blocked"), { ...run, target_php: "8.4" })).toBe(
      "3.x needs php >=8.5; target 8.4 runs no fixing release",
    );
    expect(rowBlockedWords(pinned, run)).toBeNull();
    expect(rowBlockedWords(update, run)).toBeNull();
  });
});

describe("W2: the row's command names the finding's package", () => {
  const otphp = () =>
    finding({
      package: "spomky-labs/otphp",
      direct: true,
      next_step: step({
        kind: "raise-php",
        commands: [["composer", "require", "php:>=8.1", "--no-update"]],
        php_check: { raise_to: ">=8.1" },
      }),
    });

  it("shows no command and says the raise when no step names the package (wallabag 8.4's spomky-labs/otphp)", () => {
    expect(rowCommand(otphp())).toBeNull();
    expect(nextStepWords(otphp(), run).text).toBe("raise require.php to >=8.1");
  });

  it("keeps php floor raise when the move names no raise_to", () => {
    const f = finding({
      package: "a/b",
      next_step: step({
        kind: "raise-php",
        commands: [["composer", "require", "php:>=8.1", "--no-update"]],
        php_check: { raise_to: null },
      }),
    });
    expect(nextStepWords(f, run).text).toBe("php floor raise");
  });

  it("says the raise when the step that names the package fails the §5.6 check, as no command shows", () => {
    const f = finding({
      package: "a/b",
      next_step: step({
        kind: "raise-php",
        commands: [
          ["composer", "require", "php:>=8.1", "--no-update"],
          ["composer", "require", "a/b:^2.0", "$(id)"],
        ],
        php_check: { raise_to: ">=8.1" },
      }),
    });
    expect(rowCommand(f)).toBeNull();
    expect(nextStepWords(f, run).text).toBe("raise require.php to >=8.1");
  });

  it("shows the step that names the package and says the raise beside it (R5-29)", () => {
    const f = finding({
      package: "a/b",
      direct: true,
      next_step: step({
        kind: "raise-php",
        commands: [
          ["composer", "require", "php:>=8.1", "--no-update"],
          ["composer", "require", "a/b:^2.0"],
        ],
        php_check: { raise_to: ">=8.1" },
      }),
    });
    expect(rowCommand(f)).toBe("composer require 'a/b:^2.0'");
    expect(nextStepWords(f, run).text).toBe("raise require.php to >=8.1");
  });
});

describe("OWN and RANK on a row's holders", () => {
  it("names its own release first after the root, never the package (monica's laravel/framework)", () => {
    const holds = [
      hold(null, "root"),
      hold("league/commonmark", "package", "critical"),
      hold("laravel/framework", "package", "high"),
    ];
    const line = heldByLine(holds, run, "laravel/framework");
    expect(line === null ? null : heldByWords(line)).toBe("held by its own release and 1 more");
  });

  it("ranks a holder by its best hold, when it has two", () => {
    const on = (name: string, target: string | null, verdict: string): Hold =>
      ({ source: "package", package: name, target, holder: { verdict } }) as Hold;
    const holds = [on("x/high", "y/z", "high"), on("a/two", "y/z", "low"), on("a/two", null, "low")];
    expect(heldByLine(holds, run, "c/pkg")).toEqual({ name: "a/two", more: 1 });
  });

  it("names a hold on the finding's package before a graded hold on another (monica's firebase/php-jwt)", () => {
    const on = (name: string, target: string | null, verdict: string): Hold =>
      ({ source: "package", package: name, target, holder: { verdict } }) as Hold;
    const holds = [
      on("socialiteproviders/manager", "laravel/socialite", "ok"),
      on("socialiteproviders/facebook", "socialiteproviders/manager", "medium"),
      on("laravel/socialite", null, "ok"),
    ];
    expect(heldByLine(holds, run, "firebase/php-jwt")).toEqual({ name: "laravel/socialite", more: 2 });
  });
});

describe("GATE_WORDS.group (accepted derivation 1)", () => {
  it("says the gate on the group head from gate.fails", () => {
    expect(GATE_WORDS.group(3, 3, true)).toBe("all fail the gate");
    expect(GATE_WORDS.group(1, 1, true)).toBe("all fail the gate");
    expect(GATE_WORDS.group(1, 3, true)).toBe("1 fails the gate");
    expect(GATE_WORDS.group(2, 3, true)).toBe("2 fail the gate");
    expect(GATE_WORDS.group(0, 3, true)).toBeNull();
    expect(GATE_WORDS.group(3, 3, false)).toBeNull();
  });
});

describe("commandLabel (SPEC §7.9.8.6, G114)", () => {
  it("labels one step Command and several Commands, in order", () => {
    expect(commandLabel([["composer", "require", "a/b:^2.0"]])).toBe("Command");
    expect(
      commandLabel([
        ["composer", "update", "a/b"],
        ["composer", "why-not", "c/d", "2.0"],
      ]),
    ).toBe("Commands, in order");
  });

  it("labels a move of why-not steps only Check, and a move with no step null", () => {
    expect(commandLabel([["composer", "why-not", "a/b", "2.0"]])).toBe("Check");
    expect(
      commandLabel([
        ["composer", "why-not", "a/b", "2.0"],
        ["composer", "why-not", "c/d", "1.0"],
      ]),
    ).toBe("Check");
    expect(commandLabel([])).toBeNull();
  });
});

describe("rowAfter (SPEC §7.9.5, After it)", () => {
  const applied = (overrides: Record<string, unknown>) => ({
    total: 0,
    verdict: "ok",
    lead: null,
    deciding_advisory: null,
    at_most: false,
    assumes: ["clears_hold", "composer_resolves"],
    ...overrides,
  });

  it("reads the lead move's if_applied, with the Composer caveat when its assumes hold composer_resolves", () => {
    const f = finding({
      next_step: step({
        if_applied: applied({}),
        also: [{ held_by: [], if_applied: applied({ total: 8 }) }],
      }),
    });
    expect(rowAfter(f)).toBe("after it: 0, ok, if Composer resolves it");
  });

  it("reads no caveat for a move whose check resolves, which drops composer_resolves", () => {
    const f = finding({ next_step: step({ if_applied: applied({ assumes: ["clears_hold"] }) }) });
    expect(rowAfter(f)).toBe("after it: 0, ok");
  });

  it("W1: drops the caveat and ends with the short words of a refused check (wallabag 7.4's guzzlehttp/guzzle)", () => {
    const f = finding({
      next_step: step({ if_applied: applied({}), check: { result: "refused", form: null, reason: null } }),
    });
    expect(rowAfter(f)).toBe("after it: 0, ok · Composer refuses the move");
  });

  it("W1: ends with the reason of a check that did not run (wallabag 8.4's symfony/monolog-bridge)", () => {
    const f = finding({
      next_step: step({
        if_applied: applied({ assumes: ["clears_hold"] }),
        check: { result: "not_checked", form: null, reason: "baseline_refused" },
      }),
    });
    expect(rowAfter(f)).toBe("after it: 0, ok · not checked: Composer refuses the lock itself");
  });

  it("says nothing when if_applied is null, or there is no move", () => {
    expect(rowAfter(finding({ next_step: step({ if_applied: null }) }))).toBeNull();
    expect(rowAfter(finding({}))).toBeNull();
  });
});

describe("rowNewLine and the group count (accepted derivation 11)", () => {
  it("tags a lead move that crosses a major with the sheet's words, the 0.x form without its reason", () => {
    expect(rowNewLine(finding({ next_step: step({ crosses_major: true, to_branch: "10.x" }) }))).toBe(
      "a new major",
    );
    expect(rowNewLine(finding({ next_step: step({ crosses_major: true, to_branch: "0.9.x" }) }))).toBe(
      "a new 0.x line",
    );
    expect(rowNewLine(finding({ next_step: step({ crosses_major: false }) }))).toBeNull();
    expect(rowNewLine(finding({ next_step: step({ crosses_major: null }) }))).toBeNull();
    expect(rowNewLine(finding({}))).toBeNull();
  });

  it("reads the lead move only, never an also[] entry", () => {
    const f = finding({
      next_step: step({ crosses_major: false, also: [{ held_by: [], crosses_major: true }] }),
    });
    expect(rowNewLine(f)).toBeNull();
  });

  it("counts the moves that cross a major over the lead moves whose crosses_major is set", () => {
    const rows = [
      finding({ next_step: step({ crosses_major: true }) }),
      finding({ next_step: step({ crosses_major: false }) }),
      finding({ next_step: step({ crosses_major: null }) }),
      finding({}),
    ];
    expect(majorCount(rows)).toEqual({ n: 1, m: 2 });
    expect(majorCountWords({ n: 1, m: 1 })).toBe("1 of 1 move crosses a major");
    expect(majorCountWords({ n: 1, m: 3 })).toBe("1 of 3 moves crosses a major");
    expect(majorCountWords({ n: 2, m: 3 })).toBe("2 of 3 moves cross a major");
    expect(majorCountWords(majorCount(rows))).toBe("1 of 2 moves crosses a major");
  });

  it("R2-43: does not count a move to a new 0.x line as crossing a major, as its row tag says", () => {
    const rows = [
      finding({ next_step: step({ crosses_major: true, to_branch: "3.x" }) }),
      finding({ next_step: step({ crosses_major: true, to_branch: "0.11.x" }) }),
      finding({ next_step: step({ crosses_major: false }) }),
    ];
    expect(majorCount(rows)).toEqual({ n: 1, m: 3 });
    expect(majorCountWords(majorCount(rows.slice(1)))).toBeNull();
  });

  it("says nothing when no set move crosses (n = 0), or when no move says either way (m = 0)", () => {
    const none = [
      finding({ next_step: step({ crosses_major: false }) }),
      finding({ next_step: step({ crosses_major: false }) }),
    ];
    expect(majorCount(none)).toEqual({ n: 0, m: 2 });
    expect(majorCountWords(majorCount(none))).toBeNull();
    const unset = [finding({ next_step: step({ crosses_major: null }) }), finding({})];
    expect(majorCountWords(majorCount(unset))).toBeNull();
  });
});
