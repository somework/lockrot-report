import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alsoHolds,
  firstMoves,
  gateLineTarget,
  heldLine,
  READY_SHOWN,
  readyFindings,
  wayOutLine,
} from "../../../src/domain/firstMoves";
import { applyFilters2, fitFilters2 } from "../../../src/domain/list";
import { isHeld, needsAnotherWayOut } from "../../../src/domain/readyToRun";
import { linkState } from "../../../src/state/hash";
import type { LinkTarget } from "../../../src/state/types";
import { INITIAL_STATE } from "../../../src/state/types";
import { pageGoldens, readContractJson } from "../words/recorded";
import { MOVE_KIND_WORDS } from "../../../src/domain/pageVocabulary";
import type { Finding, Report2 } from "../../../src/model/report";

const hold = (source: "root" | "package") => ({ source, package: source === "root" ? null : "c/d" });

function finding(
  name: string,
  rank: number,
  fails: boolean,
  held: "none" | "root" | "package" = "none",
): Finding {
  return {
    package: name,
    verdict: "high",
    rank,
    gate: { fails },
    next_step: {
      kind: "update",
      commands: [["composer", "update", name]],
      check: { result: "resolves", form: "inline", reason: null, installs: null },
      held_by: held === "none" ? [] : [hold(held)],
      also: [],
    },
  } as unknown as Finding;
}

/** A gate-failing finding whose move has no command: neither ready nor held. */
function stuck(
  name: string,
  kind: string | null,
  by: { kind: string; facts: { kind: string; id: string }[] }[] = [],
): Finding {
  return {
    package: name,
    verdict: "high",
    rank: 9,
    gate: { fails: true, by: by.map((entry) => ({ value: entry.kind, ...entry })) },
    next_step: kind === null ? null : { kind, commands: [], check: null, held_by: [], also: [] },
    // An unchecked advisory gate, as an offline run writes it: the missing check blocks S9.
    checks_missing: by.some((entry) => entry.kind === "unchecked")
      ? [{ check: "advisories", reason: "offline", blocks: ["S9"] }]
      : [],
    security: { check: by.some((entry) => entry.kind === "unchecked") ? "not_run" : "complete" },
  } as unknown as Finding;
}

/** A gate-failing `raise-php` move: its php step and the package step, never ready. */
function raisePhp(name: string, raiseTo: string | null): Finding {
  return {
    package: name,
    verdict: "high",
    rank: 5,
    gate: { fails: true, by: [] },
    next_step: {
      kind: "raise-php",
      commands: [
        ["composer", "require", `php:${raiseTo ?? ">=8.1"}`, "--no-update"],
        ["composer", "require", `${name}:^2.0`],
      ],
      php_check: { raise_to: raiseTo },
      check: { result: "resolves", form: "inline", reason: null, installs: null },
      held_by: [],
      also: [],
    },
  } as unknown as Finding;
}

const unchecked = [{ kind: "unchecked", facts: [{ kind: "signal", id: "S9" }] }];

function report(findings: Finding[], gateFails: boolean): Report2 {
  return {
    findings,
    gate: { fails: gateFails, failing: findings.filter((f) => f.gate.fails).length },
    run: { graded_verdicts: ["critical", "high", "medium", "low"], move_check: { baseline: "resolves" } },
  } as unknown as Report2;
}

describe("readyFindings (the Ready to run block)", () => {
  it("lists ready moves in lockrot's rank order", () => {
    const r = report(
      [finding("c/c", 3, false), finding("a/a", 1, false), finding("b/b", 2, false, "package")],
      false,
    );
    expect(readyFindings(r).map((f) => f.package)).toEqual(["a/a", "c/c"]);
  });

  it("keeps only gate-failing findings when the gate fails; a root hold is still ready", () => {
    const r = report(
      [finding("a/a", 1, false), finding("b/b", 2, true, "package"), finding("c/c", 3, true, "root")],
      true,
    );
    expect(readyFindings(r).map((f) => f.package)).toEqual(["c/c"]);
  });
});

describe("Ready to run on a refused baseline (R14)", () => {
  it("says that Composer refuses the lock itself, so no move was checked", () => {
    const stopped = finding("b/b", 2, true);
    const r = {
      ...report([stopped], true),
      packages_flagged: 1,
      run: { graded_verdicts: ["critical", "high", "medium", "low"], move_check: { baseline: "refused" } },
    } as unknown as Report2;
    if (stopped.next_step !== null)
      stopped.next_step.check = {
        result: "not_checked",
        form: null,
        reason: "baseline_refused",
        installs: null,
      };

    expect(firstMoves(r).none).toBe(
      "No move is ready to run: Composer refuses the lock itself, so no move was checked.",
    );
  });
});

describe("the new-line tag of a ready move (R8)", () => {
  const ready = (toBranch: string): string | null | undefined => {
    const found = pageGoldens().find((entry) => entry.id === "snipe-it");
    if (found === undefined) throw new Error("no page golden snipe-it");
    const report = structuredClone(found.report);
    const [first] = readyFindings(report);
    if (first?.next_step == null) throw new Error("snipe-it has a ready move");
    first.next_step = { ...first.next_step, crosses_major: true, to_branch: toBranch };
    return firstMoves(report).moves.find((move) => move.package === first.package)?.newLine;
  };

  it("says a new 0.x line for a 0.x move, as the Findings row does (mautic)", () => {
    expect(ready("0.6.x")).toBe("a new 0.x line");
  });

  it("says a new major for another move across a major", () => {
    expect(ready("3.x")).toBe("a new major");
  });
});

describe("heldLine", () => {
  it("counts the failing findings a package holds, against gate.failing", () => {
    const r = report([finding("b/b", 2, true, "package"), finding("c/c", 3, true, "root")], true);
    expect(heldLine(r)).toBe(
      "1 of 2 findings that fail the gate is held by other packages. Their holders are in each sheet's Held by.",
    );
  });

  it("is absent when the gate passes or nothing is held", () => {
    expect(heldLine(report([finding("b/b", 2, false, "package")], false))).toBeNull();
    expect(heldLine(report([finding("c/c", 3, true)], true))).toBeNull();
  });
});

describe("wayOutLine", () => {
  it("counts the failing findings neither ready nor held by kind, in x-known-values order", () => {
    const r = report(
      [
        finding("a/a", 1, true),
        finding("b/b", 2, true, "package"),
        stuck("c/c", "find-alternative"),
        stuck("d/d", "replace"),
        stuck("e/e", "find-alternative"),
        stuck("f/f", "replace"),
      ],
      true,
    );
    expect(wayOutLine(r)).toBe("4 need another way out: 2 replace, 2 find an alternative");
  });

  it("never says other: a move with no command by its kind, an unknown kind as written after the known ones, a finding with no move by its gate kind", () => {
    const r = report(
      [
        stuck("c/c", "vendor:teleport"),
        stuck("d/d", null, [{ kind: "grade", facts: [{ kind: "flag", id: "abandoned" }] }]),
        stuck("e/e", "no-fix"),
        stuck("f/f", null, unchecked),
      ],
      true,
    );
    expect(wayOutLine(r)).toBe(
      "4 need another way out: 1 no fix, 1 vendor:teleport, 1 no move for its grade, 1 unchecked: the advisory check did not run",
    );
  });

  it("counts a raise-php move by its kind, with the target when every one names the same floor", () => {
    expect(wayOutLine(report([raisePhp("a/a", ">=8.1"), raisePhp("b/b", ">=8.1")], true))).toBe(
      "2 need another way out: 2 raise PHP >=8.1",
    );
    expect(wayOutLine(report([raisePhp("a/a", ">=8.1"), raisePhp("b/b", ">=8.2")], true))).toBe(
      "2 need another way out: 2 raise PHP",
    );
  });

  it("counts a move the check stopped by its check: refused, then not checked in the table's order, then an unknown reason", () => {
    const stopped = (name: string, kind: string, result: string, reason: string | null): Finding =>
      ({
        ...stuck(name, kind),
        next_step: { kind, commands: [], held_by: [], also: [], check: { result, form: null, reason } },
      }) as unknown as Finding;
    const r = report(
      [
        stopped("a/a", "update", "not_checked", "offline"),
        stopped("b/b", "require", "not_checked", "baseline_refused"),
        stopped("c/c", "update", "not_checked", "a_later_reason"),
        stopped("d/d", "require", "refused", null),
        stuck("e/e", "test"),
      ],
      true,
    );
    expect(wayOutLine(r)).toBe(
      "5 need another way out: 1 test, 1 Composer refuses the move, 1 not checked: Composer refuses the lock itself, 1 not checked: a package it needs is not in Composer's cache, 1 not checked: a_later_reason",
    );
    expect(firstMoves(r).wayOutParts).toContainEqual({ text: "a_later_reason", code: true });
  });

  it("words an advisory_lookup_incomplete check from the reason table, after solver_error", () => {
    const stopped = (name: string, reason: string): Finding =>
      ({
        ...stuck(name, "update"),
        next_step: {
          kind: "update",
          commands: [],
          held_by: [],
          also: [],
          check: { result: "not_checked", form: null, reason },
        },
      }) as unknown as Finding;
    const r = report([stopped("a/a", "advisory_lookup_incomplete"), stopped("b/b", "solver_error")], true);
    expect(wayOutLine(r)).toBe(
      "2 need another way out: 1 not checked: Composer's solver failed on it, 1 not checked: the advisory lookup did not cover a package it installs",
    );
  });

  it("counts every Composer move as not checked when the run checked no move", () => {
    const r = {
      ...report(
        [stuck("a/a", "update"), stuck("b/b", "raise-php"), stuck("c/c", "tag"), stuck("d/d", "replace")],
        true,
      ),
      run: { graded_verdicts: ["critical", "high", "medium", "low"], move_check: null },
    } as unknown as Report2;
    expect(wayOutLine(r)).toBe("4 need another way out: 1 replace, 3 not checked: the run checked no move");
  });

  it("says what fails the gate, with no way-out prefix, when nothing is graded and nothing has a move", () => {
    const r = {
      ...report([{ ...stuck("a/a", null, unchecked), verdict: "ok" } as unknown as Finding], true),
      packages_flagged: 0,
    } as Report2;
    expect(wayOutLine(r)).toBe("1 fails the gate as unchecked: the advisory check did not run.");
    expect(firstMoves(r).none).toBe("Nothing to run: no package is flagged.");
  });

  it("is absent when k is 0 or the gate passes", () => {
    expect(
      wayOutLine(report([finding("a/a", 1, true), finding("b/b", 2, true, "package")], true)),
    ).toBeNull();
    expect(wayOutLine(report([stuck("c/c", "replace")], false))).toBeNull();
  });

  it("links the held line to the held filter and the way-out line to the failing findings", () => {
    const r = {
      ...report([finding("b/b", 2, true, "package"), stuck("c/c", "replace")], true),
      packages_flagged: 2,
    } as Report2;
    const first = firstMoves(r);
    expect(first.heldLink).toEqual({ view: "findings", filters: { gate: ["fails", "held"] } });
    expect(first.wayOutLink).toEqual({ view: "findings", filters: { gate: ["fails", "wayout"] } });
  });
});

describe("MOVE_KIND_WORDS", () => {
  it("follows the schema's x-known-values of next_step.kind, one word each", () => {
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), "contract", "lockrot-report-2.schema.json"), "utf8"),
    ) as { definitions: { move: { properties: { kind: { "x-known-values": string[] } } } } };
    expect(MOVE_KIND_WORDS.map(([kind]) => kind)).toEqual(
      schema.definitions.move.properties.kind["x-known-values"],
    );
  });
});

describe("the unchecked way-out item on lockrot's ok-offline page golden", () => {
  const golden = pageGoldens().find(({ id }) => id === "ok-offline");
  if (golden === undefined) throw new Error("no ok-offline page golden");
  const { report } = golden;

  it("says what fails the gate in §7.9.16's words, under the no-move sentence", () => {
    expect(firstMoves(report).none).toBe("Nothing to run: no package is flagged.");
    expect(wayOutLine(report)).toBe("1 fails the gate as unchecked: the advisory check did not run.");
  });

  it("links to the tab whose list holds the finding: All packages, as Findings lists graded findings only", () => {
    const link = firstMoves(report).wayOutLink;
    expect(link).toEqual({ view: "packages", filters: { gate: ["fails", "wayout"] } });
    const state = {
      ...INITIAL_STATE,
      view: "packages" as const,
      filters: { ...INITIAL_STATE.filters, ...link?.filters },
    };
    expect(applyFilters2(report, state, "packages").map((f) => f.package)).toEqual(
      report.findings.filter((f) => f.gate.fails).map((f) => f.package),
    );
  });
});

describe("alsoHolds", () => {
  function holding(name: string, rank: number, holder: string | null): Finding {
    return {
      package: name,
      verdict: "high",
      rank,
      gate: { fails: true, by: [] },
      next_step: {
        kind: "update",
        commands: [],
        held_by: holder === null ? [] : [{ source: "package", package: holder }],
        also: [],
      },
    } as unknown as Finding;
  }

  it("lists the findings that name the move's package as a holder, in rank order, at most READY_SHOWN", () => {
    const r = report(
      [
        holding("e/e", 5, "a/a"),
        holding("b/b", 2, "a/a"),
        holding("x/x", 1, "z/z"),
        holding("c/c", 3, "a/a"),
        holding("d/d", 4, "a/a"),
      ],
      true,
    );
    expect(alsoHolds(r, "a/a")).toBe("Also holds: b/b (high), c/c (high), d/d (high), +1 more");
    expect(alsoHolds(r, "z/z")).toBe("Also holds: x/x (high)");
  });

  it("is null when nothing names the package, and a root hold never counts", () => {
    const rootHeld = {
      ...holding("b/b", 2, null),
      next_step: { kind: "update", commands: [], held_by: [{ source: "root", package: null }], also: [] },
    } as unknown as Finding;
    expect(alsoHolds(report([rootHeld], true), "a/a")).toBeNull();
  });
});

/** Every lockrot case document: the schema's `cases/` folder, as lockrot writes each run. */
function caseDocuments(): { id: string; report: Report2 }[] {
  const dir = join(process.cwd(), ".lockrot", "tests", "fixtures", "schema", "documents", "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      id: name.slice(0, -5),
      report: JSON.parse(readFileSync(join(dir, name), "utf8")) as Report2,
    }));
}

/** The rows a count link opens, as a click on it does: the address state, fitted, then filtered. */
function rowsOpened(report: Report2, target: LinkTarget): readonly string[] {
  const state = linkState(target);
  const fitted = { ...state, filters: fitFilters2(report, state.filters) };
  return applyFilters2(report, fitted, fitted.view).map((f) => f.package);
}

describe("a count link opens exactly the rows it counts (coordinator rule)", () => {
  const cases = [...pageGoldens().map(({ id, report }) => ({ id, report })), ...caseDocuments()];

  it.each(cases)(
    "$id: the held, way-out, all-ready and gate-line links list exactly the rows they count",
    ({ report }) => {
      if (report.packages_checked === 0) return;
      const first = firstMoves(report);
      const held = report.gate.fails ? report.findings.filter((f) => f.gate.fails && isHeld(f)) : [];
      const wayOut = report.gate.fails ? report.findings.filter(needsAnotherWayOut) : [];
      const ready = readyFindings(report);
      const allReady = ready.length > READY_SHOWN ? ready : [];
      const gateFailing = report.gate.fails ? report.findings.filter((f) => f.gate.fails) : [];
      for (const [counted, link] of [
        [held, first.heldLink],
        [wayOut, first.wayOutLink],
        [allReady, first.moreLink],
        [gateFailing, gateLineTarget(report)],
      ] as const) {
        if (counted.length === 0) {
          expect(link).toBeNull();
          continue;
        }
        if (link === null) throw new Error("a counted set with no link");
        expect([...rowsOpened(report, link)].sort()).toEqual(counted.map((f) => f.package).sort());
      }
    },
  );
});

describe("the unchecked words (SPEC §7.9.4, §7.9.9)", () => {
  const missing = (check: string): Finding =>
    ({
      ...stuck("a/a", null, [{ kind: "unchecked", facts: [{ kind: "signal", id: "S2" }] }]),
      checks_missing: [{ check, reason: "undated_releases", blocks: ["S2"] }],
      security: { check: "complete" },
    }) as unknown as Finding;

  it.each([
    ["release_dates", "release dates not checked"],
    ["releases", "releases not checked"],
    ["release_metadata", "its release metadata not checked"],
    ["advisories", "the advisory check did not run"],
  ])("reads %s as %s", (check, words) => {
    expect(wayOutLine(report([missing(check)], true))).toBe(`1 needs another way out: 1 unchecked: ${words}`);
  });

  it("prints an unknown check id as written, in a code element", () => {
    expect(firstMoves(report([missing("a_later_check")], true)).wayOutParts).toContainEqual({
      text: "a_later_check",
      code: true,
    });
  });

  it("reads lockrot's ok-unchecked recording in the check words", () => {
    const recorded = readContractJson("report-2", "ok-unchecked.json") as Report2;
    expect(wayOutLine(recorded)).toBe("1 fails the gate as unchecked: release dates not checked.");
  });
});

describe("the held line agrees with gate.failing", () => {
  it("reads fails for one failing finding", () => {
    const r = report([finding("b/b", 2, true, "package")], true);
    expect(heldLine(r)).toBe(
      "1 of 1 finding that fails the gate is held by other packages. Their holders are in each sheet's Held by.",
    );
  });
});
