import { describe, expect, test } from "vitest";

import { plain } from "../../../src/domain/rich";
import { moveCheckFact, runFacts } from "../../../src/domain/runTab";
import type { Report2 } from "../../../src/model/report";
import { pageGoldens } from "../words/recorded";

const golden = (id: string): Report2 => {
  const found = pageGoldens().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no page golden ${id}`);
  return structuredClone(found.report);
};

describe("the Run tab's move check (SPEC §7.9.16)", () => {
  test("names the Composer that checked the moves, and the ext-* requirements it did not check", () => {
    expect(plain(moveCheckFact(golden("snipe-it")) ?? [])).toBe(
      "checked with the solver of Composer 2.10.3 against the lock · ext-* requirements not checked",
    );
  });

  test("says that Composer's solver refuses the lock itself", () => {
    expect(plain(moveCheckFact(golden("wallabag-2.6")) ?? [])).toBe(
      "not checked, because Composer's solver refuses the lock itself",
    );
  });

  test("says why no move was checked, in the reason words", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    report.run.move_check = {
      ...report.run.move_check,
      baseline: "not_checked",
      reason: "install_time_budget",
    };
    expect(plain(moveCheckFact(report) ?? [])).toBe("not checked (the install-time budget ran out)");
  });

  test("prints an unknown reason as written, in a code element", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    report.run.move_check = { ...report.run.move_check, baseline: "not_checked", reason: "a_later_reason" };
    expect(moveCheckFact(report)).toEqual(["not checked (", { code: "a_later_reason" }, ")"]);
  });

  test("shows no row when the run checked no move", () => {
    const report = golden("composite");
    expect(moveCheckFact(report)).toBeNull();
    expect(runFacts(report).map(({ key }) => key)).not.toContain("moves");
  });

  test("lists the row after the run's other facts", () => {
    expect(runFacts(golden("snipe-it")).at(-1)?.key).toBe("moves");
  });
});
