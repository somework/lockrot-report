import { expect, test } from "vitest";

import { whyBlock, whyLines } from "../../../src/domain/scoreWhy";
import { recordedCases } from "./recorded";

const byName = (name: string) => {
  const recorded = recordedCases().find((c) => c.name === name);
  if (recorded === undefined) throw new Error(`no recorded case ${name}`);
  return recorded;
};

test("B's Why lines carry their kinds in SPEC order", () => {
  const { finding, report } = byName("B");

  expect(whyBlock(finding, report).map((line) => line.kind)).toEqual([
    "header",
    "term",
    "term",
    "term",
    "halving",
    "opening",
    "counterfactuals",
    "after-the-move",
  ]);
});

test("the kinds add nothing to the text of any recorded case", () => {
  const cases = recordedCases();

  expect(cases.length).toBeGreaterThan(0);
  for (const { finding, report } of cases) {
    expect(whyBlock(finding, report).map((line) => line.text)).toEqual(whyLines(finding, report));
  }
});

test("a score-0 finding has a header and no opening", () => {
  const { finding, report } = byName("stale-accepted-dagger");
  const kinds = whyBlock(finding, report).map((line) => line.kind);

  expect(kinds[0]).toBe("header");
  expect(kinds).not.toContain("opening");
});
