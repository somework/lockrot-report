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
    expect(line?.parts.map((p) => p.text)).toEqual([
      "no advisory check ran",
      "7 of 10 packages have no grade, because lockrot read no metadata for them",
    ]);
  });

  it("names the packages the ignore list does not cover for advisories", () => {
    const [line] = stateLines(
      report({ note_details: [{ code: "ignore_does_not_cover_advisories", data: { entries: [{}, {}] } }] }),
    );
    expect(line?.kind).toBe("allowlist");
    expect(line?.parts[1]?.text).toBe("2 packages it lists still count for advisories");
  });

  it("puts new first and names each stale baseline entry", () => {
    const [line] = stateLines(
      report({ baseline: { path: "b.json", known: 5, new: 2, worsened: 0, stale: ["old/gone"] } }),
    );
    expect(line?.parts.map((p) => p.text)).toEqual([
      "2 new",
      "0 worsened",
      "5 known",
      "1 entry for packages that left the lock: old/gone",
    ]);
    expect(line?.parts[1]?.link).toBeNull();
  });
});
