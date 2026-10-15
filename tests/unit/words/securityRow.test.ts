import { describe, expect, test } from "vitest";

import { moreWaysOut, rungText, securityRow } from "../../../src/domain/securityLine";
import { recordedCases } from "./recorded";

const byName = (name: string) => {
  const recorded = recordedCases().find((c) => c.name === name);
  if (recorded === undefined) throw new Error(`no recorded case ${name}`);
  return recorded;
};

describe("the Security row split into its summary and its rungs", () => {
  test("B keeps its golden summary and four rungs, lowest branch first", () => {
    const { finding, run, metadata } = byName("B");

    const row = securityRow(finding, run, metadata);

    expect(row.summary).toBe("1 high advisory · 1 on record for this name · fix: upgrade · lookup complete");
    expect(row.rungs.map((r) => r.branch)).toEqual(["5.x", "6.x", "7.x", "8.x"]);
    expect(rungText(row.rungs[0]!)).toBe(
      "clears 1 of 1 from v5.4.52 (upgrade; held by composer.json; after it: 0, ok, if Composer resolves it)",
    );
    expect(row.rungs[0]).toMatchObject({
      after: "after it: 0, ok, if Composer resolves it",
      afterVerdict: "ok",
    });
  });

  test("a rung that names no score after it has no after part", () => {
    const { finding, run, metadata } = byName("joomla-filter");

    const [first] = securityRow(finding, run, metadata).rungs;

    expect(first).toMatchObject({ branch: "2.x", after: null, afterVerdict: null });
    expect(rungText(first!)).toBe("clears 1 of 1 from 2.0.6 (needs a PHP your target does not run)");
  });

  test("a finding with no counted advisory has no rung", () => {
    const { finding, run, metadata } = byName("F");
    const clear = { ...finding, security: { ...finding.security, status: "clear" as const } };

    expect(securityRow(clear as typeof finding, run, metadata).rungs).toEqual([]);
  });
});

describe("the level-0 button over the other rungs", () => {
  test("names the branches and the class they share", () => {
    const { finding, run, metadata } = byName("B");

    expect(moreWaysOut(securityRow(finding, run, metadata).rungs.slice(1))).toBe(
      "3 more ways out: 6.x, 7.x and 8.x (php floor raise)",
    );
  });

  test("leaves the class out when the rungs differ, and is singular for one", () => {
    const { finding, run, metadata } = byName("B-also-dagger");
    const rungs = securityRow(finding, run, metadata).rungs;

    expect(moreWaysOut(rungs.slice(0, 2))).toBe("2 more ways out: 2.x and 3.x");
    expect(moreWaysOut(rungs.slice(1, 2))).toBe("1 more way out: 3.x (upgrade)");
  });
});
