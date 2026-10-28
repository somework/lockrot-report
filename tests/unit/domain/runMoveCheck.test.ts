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

  test("names the variables that turned advisory blocking off, after the lock", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    report.run.move_check = {
      ...report.run.move_check,
      blocks_advisories: false,
      blocking_disabled_by: ["COMPOSER_NO_BLOCKING", "COMPOSER_NO_SECURITY_BLOCKING"],
    };
    expect(moveCheckFact(report)).toEqual([
      "checked with the solver of Composer 2.10.3 against the lock, with advisory blocking turned off by ",
      { code: "COMPOSER_NO_BLOCKING" },
      " and ",
      { code: "COMPOSER_NO_SECURITY_BLOCKING" },
      " · ext-* requirements not checked",
    ]);
  });

  test("lists three or more variables with commas and 'and' before the last", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    report.run.move_check = {
      ...report.run.move_check,
      blocks_advisories: false,
      blocking_disabled_by: ["COMPOSER_POLICY", "config.policy", "config.policy.advisories"],
    };
    expect(moveCheckFact(report)).toEqual([
      "checked with the solver of Composer 2.10.3 against the lock, with advisory blocking turned off by ",
      { code: "COMPOSER_POLICY" },
      ", ",
      { code: "config.policy" },
      " and ",
      { code: "config.policy.advisories" },
      " · ext-* requirements not checked",
    ]);
  });

  test("names each pattern of ignored_platform, the list that replaces ignores_extensions (§7.9.16)", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    const { ignores_extensions: _, ...rest } = report.run.move_check;
    const emitted: unknown = {
      ...rest,
      ignored_platform: ["ext-*", "lib-*", "php-debug", "php-ipv6", "php-zts"],
    };
    report.run.move_check = emitted as typeof report.run.move_check;
    expect(plain(moveCheckFact(report) ?? [])).toBe(
      "checked with the solver of Composer 2.10.3 against the lock · ext-*, lib-*, php-debug, php-ipv6 and php-zts requirements not checked",
    );
  });

  test("names no ignored requirement when ignored_platform is empty", () => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    const emitted: unknown = { ...report.run.move_check, ignored_platform: [] };
    report.run.move_check = emitted as typeof report.run.move_check;
    expect(plain(moveCheckFact(report) ?? [])).toBe(
      "checked with the solver of Composer 2.10.3 against the lock",
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

  test.each([
    ["unloaded_name", "not checked (a package the lock needs could not be loaded)"],
    ["offline", "not checked (a package the lock needs is not in Composer's cache)"],
  ])("R2-4: names the lock when the baseline could not load a package (%s)", (reason, words) => {
    const report = golden("snipe-it");
    if (report.run.move_check === null) throw new Error("snipe-it checks its moves");
    report.run.move_check = { ...report.run.move_check, baseline: "not_checked", reason };
    expect(moveCheckFact(report)).toEqual([words]);
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
