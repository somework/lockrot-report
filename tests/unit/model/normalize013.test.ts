/**
 * Branch-row PHP admission, `exposure_rule`, `unattributed`, `run.root_package`, `run.project_php`
 * and `lock.branch_snapshot`. A key left out reads as no answer, the same as `null`: `null`, `[]`,
 * never `false`. `report.absent` says which report keys were left out.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { BranchRow, Model } from "../../../src/model/types";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");

function raw(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as Record<string, unknown>;
}

function load(name: string): Model {
  const result = normalize(raw(name));
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

function allRows(model: Model): BranchRow[] {
  return [...model.details.values()].flatMap((d) => d.metadata?.branches ?? []);
}

function rowsOf(model: Model, pkg: string): readonly BranchRow[] {
  return model.details.get(pkg)?.metadata?.branches ?? [];
}

const ROW_KEYS = [
  "admitsTargetPhp",
  "admitsProjectPhp",
  "phpBlockedBy",
  "missesTargetPhp",
  "missesProjectPhp",
] as const;

/** A report with only the keys `normalize` needs, and one package whose single branch row is `row`. */
function withRow(row: Record<string, unknown>): Model {
  const result = normalize({
    report: {
      lockrot: { version: "0.13.0", schema: 1 },
      generated_at: "2026-09-28T00:00:00+00:00",
      findings: [],
    },
    details: {
      "vendor/pkg": {
        metadata: { branches: [{ branch: "1.x", installed: true, highest: "1.0.0", ...row }] },
      },
    },
  });
  if (!result.ok) throw new Error("synthetic bundle failed to normalize");
  return result.model;
}

function onlyRow(model: Model): BranchRow {
  const row = rowsOf(model, "vendor/pkg")[0];
  if (row === undefined) throw new Error("no row");
  return row;
}

function withReport(extra: Record<string, unknown>, details: unknown = {}): Model {
  const result = normalize({
    report: {
      lockrot: { version: "0.13.0", schema: 1 },
      generated_at: "2026-09-28T00:00:00+00:00",
      findings: [],
      ...extra,
    },
    details,
  });
  if (!result.ok) throw new Error("synthetic bundle failed to normalize");
  return result.model;
}

// -------------------------------------------------------------------------------------------
// Branch rows
// -------------------------------------------------------------------------------------------

describe("branch rows: admits_*, php_blocked_by, misses_*", () => {
  test("a row without the keys answers none of them: every wallabag_wallabag row reads null", () => {
    const rows = allRows(load("wallabag_wallabag.json"));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const key of ROW_KEYS) {
        expect(row[key]).toBeNull();
      }
    }
  });

  test("wallabag_wallabag-0.13's rows, with the census counts", () => {
    const rows = allRows(load("wallabag_wallabag-0.13.json"));
    const count = (pick: (row: BranchRow) => unknown, value: unknown): number =>
      rows.filter((row) => pick(row) === value).length;
    // census.md §1, "Branch rows": 195 / 16 / 44 and 171 / 40 / 44.
    expect([true, false, null].map((v) => count((r) => r.admitsTargetPhp, v))).toEqual([195, 16, 44]);
    expect([true, false, null].map((v) => count((r) => r.admitsProjectPhp, v))).toEqual([171, 40, 44]);
    expect([null, "project", "target"].map((v) => count((r) => r.phpBlockedBy, v))).toEqual([215, 40, 0]);
    expect(count((r) => r.missesTargetPhp, "stops_before")).toBe(16);
    expect(count((r) => r.missesProjectPhp, "needs_newer")).toBe(24);
    expect(count((r) => r.missesProjectPhp, "stops_before")).toBe(16);
  });

  test("null stays null: a row with no readable php answers nothing, never false", () => {
    const zero = rowsOf(load("mini-0.13-edges.json"), "acme/left").find((r) => r.branch === "0.x");

    expect(zero?.php).toBeNull();
    for (const key of ROW_KEYS) {
      expect(zero?.[key]).toBeNull();
    }
  });

  test("mini-0.13-edges keeps every value as written, unknown ones included", () => {
    const model = load("mini-0.13-edges.json");
    const left = rowsOf(model, "acme/left").map((r) => [r.branch, r.phpBlockedBy, r.missesProjectPhp]);
    const floors = rowsOf(model, "acme/floors").map((r) => [r.branch, r.missesTargetPhp, r.missesProjectPhp]);

    expect(left).toEqual([
      ["3.x", "extension", null],
      ["2.x", "extension", null],
      ["1.x", "project", "needs_newer"],
      ["0.x", null, null],
    ]);
    expect(floors).toEqual([
      ["6.x", "stops_before", "needs_newer"],
      ["5.x", "skips", "skips"],
      ["4.x", "unsatisfiable", "unsatisfiable"],
      ["3.x", "needs_newer", "needs_newer"],
      ["2.x", "stops_before", null],
      ["1.x", "stops_before", "stops_before"],
      ["0.x", "straddles", "skips"],
    ]);
  });

  test("the lock-only mini has no project floor: admits_project_php null on every row", () => {
    const rows = allRows(load("mini-0.13-edges-lock-only.json"));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.admitsProjectPhp).toBeNull();
      expect(row.missesProjectPhp).toBeNull();
    }
  });

  test.each([
    ["true", true, true],
    ["false", false, false],
    ["null", null, null],
    ["a wrong type", "yes", null],
  ])("admits_target_php written as %s", (_label, value, expected) => {
    const row = onlyRow(withRow({ admits_target_php: value, admits_project_php: value }));

    expect(row.admitsTargetPhp).toBe(expected);
    expect(row.admitsProjectPhp).toBe(expected);
  });

  test("a string field of the wrong type is no answer, not coerced text", () => {
    const row = onlyRow(withRow({ php_blocked_by: 7, misses_target_php: false, misses_project_php: {} }));

    expect(row.phpBlockedBy).toBeNull();
    expect(row.missesTargetPhp).toBeNull();
    expect(row.missesProjectPhp).toBeNull();
  });

  test("a row that leaves one key out answers null for that key only", () => {
    const row = onlyRow(withRow({ admits_target_php: false, misses_target_php: "stops_before" }));

    expect(row.admitsTargetPhp).toBe(false);
    expect(row.missesTargetPhp).toBe("stops_before");
    expect(row.admitsProjectPhp).toBeNull();
    expect(row.phpBlockedBy).toBeNull();
    expect(row.missesProjectPhp).toBeNull();
  });
});

// -------------------------------------------------------------------------------------------
// Report level: exposure_rule, unattributed
// -------------------------------------------------------------------------------------------

describe("report.exposureRule and report.unattributed", () => {
  test("a document without the keys has no rule and nothing unattributed, and says it left them out", () => {
    const report = load("wallabag_wallabag.json").report;

    expect(report.exposureRule).toBeNull();
    expect(report.unattributed).toEqual([]);
    expect(report.absent).toEqual(expect.arrayContaining(["exposure_rule", "unattributed"]));
  });

  test("wallabag_wallabag-0.13: max_fan_in 8, nothing unattributed", () => {
    const report = load("wallabag_wallabag-0.13.json").report;

    expect(report.exposureRule).toEqual({ maxFanIn: 8 });
    expect(report.unattributed).toEqual([]);
  });

  test("akaunting carries the one real unattributed package", () => {
    const report = load("gh_akaunting_akaunting-0.13.json").report;

    expect(report.unattributed).toEqual([{ package: "league/config", verdict: "stale", fanIn: 9 }]);
  });

  test("mini-0.13-edges: acme/shared-util, reached from 9", () => {
    expect(load("mini-0.13-edges.json").report.unattributed).toEqual([
      { package: "acme/shared-util", verdict: "stale", fanIn: 9 },
    ]);
  });

  test("exposure_rule written as null, or unreadable, is no rule", () => {
    expect(withReport({ exposure_rule: null }).report.exposureRule).toBeNull();
    expect(withReport({ exposure_rule: { max_fan_in: "8" } }).report.exposureRule).toBeNull();
    expect(withReport({ exposure_rule: [] }).report.exposureRule).toBeNull();
  });

  test("an unattributed entry keeps an unknown verdict as written and an unreadable fan_in as null", () => {
    const report = withReport({
      unattributed: [{ package: "acme/x", verdict: "quantum-flux", fan_in: "many" }, 5],
    }).report;

    expect(report.unattributed).toEqual([
      { package: "acme/x", verdict: "quantum-flux", fanIn: null },
      { package: "", verdict: "", fanIn: null },
    ]);
  });

  test("unattributed written as something other than a list reads as an empty list", () => {
    expect(withReport({ unattributed: null }).report.unattributed).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// run.root_package, run.project_php
// -------------------------------------------------------------------------------------------

describe("run.rootPackage and run.projectPhp", () => {
  test("a document without the keys answers null, and says it left them out", () => {
    const { run, absent } = load("wallabag_wallabag.json").report;

    expect(run.rootPackage).toBeNull();
    expect(run.projectPhp).toBeNull();
    expect(absent).toEqual(expect.arrayContaining(["run.root_package", "run.project_php"]));
  });

  test.each([
    ["wallabag_wallabag-0.13.json", "wallabag/wallabag", "wallabag/wallabag", ">=8.2"],
    ["koel_koel-0.13.json", "koel/koel", "koel/koel", ">=8.3"],
    ["mautic_mautic-0.13.json", "mautic/mautic", "mautic/mautic", null],
    ["mini-0.13-edges.json", "Acme shop", "acme/shop", "^8.3"],
    ["mini-0.13-edges-lock-only.json", null, null, null],
  ])("%s: project %s, root_package %s, project_php %s", (name, project, rootPackage, projectPhp) => {
    const run = load(name).report.run;

    expect(run.project).toBe(project);
    expect(run.rootPackage).toBe(rootPackage);
    expect(run.projectPhp).toBe(projectPhp);
  });

  test("a wrong type is no answer", () => {
    const run = withReport({ run: { root_package: 1, project_php: ["^8.3"] } }).report.run;

    expect(run.rootPackage).toBeNull();
    expect(run.projectPhp).toBeNull();
  });
});

describe("report.absent names the keys a document leaves out, the 0.13 ones like any other", () => {
  test("wallabag_wallabag-0.13 and mini-0.13-edges leave out nothing the page reads", () => {
    expect(load("wallabag_wallabag-0.13.json").report.absent).toEqual([]);
    expect(load("mini-0.13-edges.json").report.absent).toEqual([]);
  });

  test("a report without the keys names each of them", () => {
    const absent = withReport({}).report.absent;

    for (const key of ["exposure_rule", "unattributed", "run.root_package", "run.project_php"]) {
      expect(absent).toContain(key);
    }
  });
});

describe("details written as [] (PHP's empty array; 4 corpus projects)", () => {
  test("a 0.13 report with details [] normalises with no details and keeps its report fields", () => {
    const bundle = raw("wallabag_wallabag-0.13.json");
    const result = normalize({ ...bundle, details: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.details.size).toBe(0);
    expect(result.model.report.exposureRule).toEqual({ maxFanIn: 8 });
  });
});

describe("lock.branchSnapshot keeps the document's own answer", () => {
  function lockWith(lock: Record<string, unknown>): Model {
    return withReport({}, { "vendor/pkg": { lock: { php: null, released: null, ...lock } } });
  }

  test.each([
    ["true", { branch_snapshot: true }, true],
    ["false", { branch_snapshot: false }, false],
    ["null", { branch_snapshot: null }, null],
    ["absent", {}, null],
    ["a wrong type", { branch_snapshot: "yes" }, null],
  ])("branch_snapshot written as %s", (_label, lock, expected) => {
    expect(lockWith(lock).details.get("vendor/pkg")?.lock?.branchSnapshot).toBe(expected);
  });

  test("real documents write it as a boolean, so none reads as null", () => {
    for (const name of ["wallabag_wallabag.json", "wallabag_wallabag-0.13.json", "mautic_mautic.json"]) {
      for (const details of load(name).details.values()) {
        if (details.lock !== null) expect(typeof details.lock.branchSnapshot).toBe("boolean");
      }
    }
  });
});
