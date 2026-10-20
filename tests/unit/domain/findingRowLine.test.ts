import { describe, expect, it } from "vitest";
import {
  GATE_WORDS,
  heldByLine,
  heldByWords,
  moreWord,
  reachLine,
  rowAfter,
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
    const line = heldByLine(rowHolds(f), run);
    expect(line).toEqual({ name: "b/one", more: 2 });
    expect(line === null ? null : heldByWords(line)).toBe("held by b/one and 2 more");
  });

  it("names the holder of the highest grade first, by the sheet's holder rank", () => {
    const holds = [
      hold("a/ok", "package", "ok"),
      hold("a/medium", "package", "medium"),
      hold("a/high", "package", "high"),
    ];
    expect(heldByLine(holds, run)).toEqual({ name: "a/high", more: 2 });
  });

  it("says the root as the sheet's Held by does when only the root holds", () => {
    const line = heldByLine([hold(null, "root")], run);
    expect(line === null ? null : heldByWords(line)).toBe("held by your composer.json");
    expect(heldByLine([], run)).toBeNull();
  });

  it("counts the rest in words", () => {
    expect(moreWord(6)).toBe("and 6 more");
  });
});

describe("rowCommand (accepted derivation 8)", () => {
  it("shows the first update or require step as a POSIX line", () => {
    const f = finding({
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
    const f = finding({ next_step: step({ commands: [["composer", "why-not", "a/b", "2.0"]] }) });
    expect(rowCommand(f)).toBeNull();
  });

  it("shows no step of a move when one argv fails the check (SPEC §5.6)", () => {
    const f = finding({
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

describe("GATE_WORDS.group (accepted derivation 1)", () => {
  it("says the gate on the group head from gate.fails", () => {
    expect(GATE_WORDS.group(3, 3, true)).toBe("all fail the gate");
    expect(GATE_WORDS.group(1, 1, true)).toBe("all fail the gate");
    expect(GATE_WORDS.group(1, 3, true)).toBe("1 fail the gate");
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
    expect(majorCountWords(majorCount(rows))).toBe("1 of 2 moves cross a major");
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
