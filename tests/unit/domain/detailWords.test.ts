import { describe, expect, test } from "vitest";

import { detailReach } from "../../../src/domain/detailWords";
import type { Finding, Run } from "../../../src/model/report";
import { pageGoldens } from "../words/recorded";

const recorded = (change: Partial<Finding>, runChange: Partial<Run> = {}): { finding: Finding; run: Run } => {
  const { report } = structuredClone(pageGoldens()[0] ?? { report: undefined });
  const finding = report?.findings[0];
  if (report === undefined || finding === undefined) throw new Error("no recorded finding");
  return { finding: { ...finding, ...change }, run: { ...report.run, ...runChange } };
};

const reach = (change: Partial<Finding>, runChange: Partial<Run> = {}): string => {
  const { finding, run } = recorded(change, runChange);
  return detailReach(finding, run);
};

describe("detailReach names the reach of a sheet with no flag (G46 to G49)", () => {
  test("a direct requirement (G46)", () => {
    expect(reach({ reach: "direct", dev: false, direct_dependents: [] })).toBe("direct requirement");
  });

  test("a transitive package names what pulls it in, without itself (G47)", () => {
    expect(
      reach({
        package: "acme/lib",
        reach: "transitive",
        dev: false,
        direct_dependents: ["acme/lib", "a/one"],
      }),
    ).toBe("via a/one");
  });

  test("a transitive package names three, then how many more (G47)", () => {
    const names = ["a/one", "a/two", "a/three", "a/four", "a/five"];

    expect(reach({ reach: "transitive", dev: false, direct_dependents: names })).toBe(
      "via a/one, a/two, a/three and 2 more",
    );
  });

  test("an unreached package names the requirements the run walked (G48)", () => {
    const change = { reach: "unreached", dev: false, depth_unmeasured: "unreached" } as const;

    expect(reach(change, { include_dev: false })).toBe(
      "lockrot found no path from your composer.json's require (require-dev counts only with --dev) to it",
    );
    expect(reach(change, { include_dev: true })).toBe(
      "lockrot found no path from your composer.json's require or require-dev to it",
    );
  });

  test("an unreached package of a run that read no composer.json says so (G48)", () => {
    expect(reach({ reach: "unreached", dev: false, depth_unmeasured: "no_composer_json" })).toBe(
      "The run read no composer.json, so lockrot found no path to it",
    );
  });

  test.each<[string, Partial<Finding>, string]>([
    ["direct", { reach: "direct", direct_dependents: [] }, "direct requirement · dev"],
    ["transitive", { reach: "transitive", direct_dependents: ["a/one"] }, "via a/one · dev"],
    [
      "unreached",
      { reach: "unreached", depth_unmeasured: "no_composer_json" },
      "The run read no composer.json, so lockrot found no path to it · dev",
    ],
  ])("a %s packages-dev finding ends in · dev (G49)", (_label, change, words) => {
    expect(reach({ ...change, dev: true })).toBe(words);
  });
});
