import { describe, expect, test } from "vitest";

import { minorsWords, phpStateClauses, reqWords, windowRows } from "../../../src/domain/phpWindow";
import type { Finding, PhpWindowReq, PhpWindowSet, Report2, TargetFix } from "../../../src/model/report";

const req = (over: Partial<PhpWindowReq>): PhpWindowReq => ({
  name: "acme/clock",
  version: "1.2.0",
  link: "require",
  target: "php",
  constraint: "~8.2.0 || ~8.3.0",
  dev: false,
  ...over,
});

const set = (over: Partial<PhpWindowSet> = {}): PhpWindowSet => ({
  minors: ["8.2", "8.3"],
  gaps: false,
  lower_edge: { php: "8.2.0", set_by: [req({})] },
  upper_edge: { excludes: "8.4", set_by: [req({})] },
  closest: null,
  ...over,
});

const fix = (over: Partial<TargetFix>): TargetFix => ({
  packages: [
    {
      name: "acme/clock",
      version: "1.2.0",
      link: "require",
      target: "php",
      constraint: "~8.2.0",
      dev: false,
    },
  ],
  command: null,
  check: "refused",
  reason: null,
  held_by: [],
  platform_step: false,
  ...over,
});

function report(
  window: Partial<NonNullable<Report2["run"]["php_window"]>>,
  findings: Finding[] = [],
): Report2 {
  return {
    run: {
      target_php: "8.4",
      include_dev: false,
      php_window: {
        platform_override: null,
        host_requires: [],
        with_dev: null,
        without_dev: set(),
        target: { php: "8.4.99", inside: false },
        target_fix: null,
        ...window,
      },
    },
    findings,
  } as unknown as Report2;
}

describe("the minors of a window", () => {
  test("joins consecutive minors into one run", () => {
    expect(minorsWords(["7.4", "8.0", "8.1"], false)).toBe("7.4 to 8.1");
  });

  test("keeps the step from 7.4 to 8.0 inside a run when the window has a gap elsewhere", () => {
    expect(minorsWords(["7.1", "7.4", "8.0"], true)).toBe("7.1 and 7.4 to 8.0");
  });

  test("names a lone minor alone", () => {
    expect(minorsWords(["7.4"], false)).toBe("7.4");
  });
});

describe("a link of a setter list", () => {
  test("names the root by its section and target", () => {
    expect(reqWords(req({ name: null, version: null, constraint: "^8.1" }))).toBe("require.php ^8.1");
    expect(reqWords(req({ name: null, version: null, dev: true, constraint: "<8.4" }))).toBe(
      "require-dev.php <8.4",
    );
    expect(reqWords(req({ name: null, version: null, target: "php-64bit", constraint: "^8.1" }))).toBe(
      "require.php-64bit ^8.1",
    );
  });

  test("names a conflict and a php-64bit requirement with their target", () => {
    expect(reqWords(req({ link: "conflict", constraint: "<8.1" }))).toBe("acme/clock conflict php <8.1");
    expect(reqWords(req({ target: "php-64bit", constraint: "^8.2" }))).toBe("acme/clock php-64bit ^8.2");
  });

  test("adds the version where the list names the closest minors", () => {
    expect(reqWords(req({ link: "conflict", constraint: "<8.1" }), true)).toBe(
      "acme/clock 1.2.0 conflict php <8.1",
    );
  });
});

describe("the Run tab rows", () => {
  test("print one row when the lock has no packages-dev key", () => {
    expect(windowRows(report({}))).toEqual([
      "PHP window: 8.2 to 8.3 · lowest 8.2.0, set by acme/clock ~8.2.0 || ~8.3.0 · 8.4 excluded by acme/clock ~8.2.0 || ~8.3.0",
    ]);
  });

  test("print a lowest edge with no setter as the edge alone", () => {
    const rows = windowRows(
      report({ without_dev: set({ lower_edge: { php: "8.2.0", set_by: [] }, upper_edge: null }) }),
    );

    expect(rows).toEqual(["PHP window: 8.2 to 8.3 · lowest 8.2.0"]);
  });

  test("print nothing without a window", () => {
    expect(windowRows({ run: { php_window: null } } as unknown as Report2)).toEqual([]);
  });
});

describe("the PHP state line", () => {
  test("does not show while the target is inside and nothing is capped or overridden", () => {
    expect(phpStateClauses(report({ target: { php: "8.3.99", inside: true } }))).toBeNull();
  });

  test("says its update for one package and ends after it when the refusal names no hold", () => {
    expect(phpStateClauses(report({ target_fix: fix({}) }))).toEqual([
      "this lock installs on PHP 8.2 to 8.3, so your target, 8.4, is excluded",
      "1 package excludes 8.4: acme/clock",
      "Composer's solver at PHP 8.4 refuses its update",
    ]);
  });

  test("names the reason of a fix that was not checked", () => {
    expect(
      phpStateClauses(report({ target_fix: fix({ check: "not_checked", reason: "offline" }) }))?.[2],
    ).toBe("not checked (a package it needs is not in Composer's cache)");
  });

  test("names each root link of a root ceiling once", () => {
    const hold = {
      source: "root" as const,
      package: null,
      version: null,
      link: "require-dev" as const,
      target: "php",
      constraint: "<8.4",
      holder: null,
    };

    expect(phpStateClauses(report({ target_fix: fix({ packages: [], held_by: [hold, hold] }) }))).toEqual([
      "this lock installs on PHP 8.2 to 8.3",
      "your target, 8.4, is excluded, and only a change to require-dev.php can admit it",
    ]);
  });
});
