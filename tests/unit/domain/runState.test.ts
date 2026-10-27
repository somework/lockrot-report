import { describe, expect, it } from "vitest";
import { stateLines } from "../../../src/domain/runState";
import type { Report2 } from "../../../src/model/report";

function report(over: Record<string, unknown>): Report2 {
  return {
    note_details: [],
    security: { check: "complete" },
    counts: { unknown: 0 },
    packages_checked: 10,
    baseline: null,
    run: { php_window: null, target_php: "8.4" },
    findings: [],
    ...over,
  } as unknown as Report2;
}

describe("stateLines", () => {
  it("is empty for a complete online run with no baseline", () => {
    expect(stateLines(report({}))).toEqual([]);
  });

  it("states an offline run from its note code, the check and the unknown count", () => {
    const [line] = stateLines(
      report({
        note_details: [{ code: "offline", data: {} }],
        security: { check: "not_run" },
        counts: { unknown: 7 },
      }),
    );
    expect(line?.head).toBe("Offline run");
    expect(line?.parts).toEqual([
      "no advisory check ran",
      "7 of 10 packages have no grade, because lockrot read no metadata for them",
    ]);
  });

  it("names the packages the ignore list does not cover for advisories", () => {
    const [line] = stateLines(
      report({ note_details: [{ code: "ignore_does_not_cover_advisories", data: { entries: [{}, {}] } }] }),
    );
    expect(line?.kind).toBe("allowlist");
    expect(line?.parts[1]).toBe("2 packages it lists still count for advisories");
  });

  it("puts new first, names each stale baseline entry as text (§7.9.4)", () => {
    const [line] = stateLines(
      report({ baseline: { path: "b.json", known: 5, new: 2, worsened: 3, stale: ["old/gone"] } }),
    );
    expect(line?.parts).toEqual([
      "2 new",
      "3 worsened",
      "5 known",
      "1 entry for packages that left the lock: old/gone",
    ]);
  });

  it("adds the PHP line after the lookup line when the target is outside the window (PD-PHP-1)", () => {
    const window = {
      platform_override: null,
      host_requires: [],
      with_dev: null,
      without_dev: { minors: ["7.4"], gaps: false, lower_edge: null, upper_edge: null, closest: null },
      target: { php: "8.4.99", inside: false },
      target_fix: null,
    };
    const lines = stateLines(
      report({ security: { check: "not_run" }, run: { php_window: window, target_php: "8.4" } }),
    );

    expect(lines.map((line) => line.kind)).toEqual(["lookup", "php"]);
    expect(lines[1]?.parts).toEqual(["this lock installs on PHP 7.4, so your target, 8.4, is excluded"]);
    expect(lines[1]?.more).toEqual({ text: "The PHP window", link: { view: "run", section: "php-window" } });
  });
});
