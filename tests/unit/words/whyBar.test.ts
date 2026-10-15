import { describe, expect, test } from "vitest";

import { isScoreGraded, type Finding, type Run, type ScoreGraded } from "../../../src/model/report2";
import { bandRuler, legendText, whyBar } from "../../../src/domain/whyBar";
import { recordedCases } from "./recorded";

const byName = (name: string): { finding: Finding; run: Run; score: ScoreGraded } => {
  const recorded = recordedCases().find((c) => c.name === name);
  if (recorded === undefined || !isScoreGraded(recorded.finding.score))
    throw new Error(`no graded case ${name}`);
  return { finding: recorded.finding, run: recorded.run, score: recorded.finding.score };
};

describe("the Why bar", () => {
  test("B's segments are its terms' contributions over bar_max, toned by the model's bands", () => {
    const { run, score } = byName("B");

    const bar = whyBar(score, run);

    expect(bar.over).toBe(false);
    expect(bar.segments.map((s) => [s.flag, s.role, s.contribution, s.band, s.width, s.cut])).toEqual([
      ["left-behind", "lead", 16, "high", 25, false],
      ["old-promise", "corroborating", 4, "high", 6.25, false],
      ["vulnerable", "security", 16, "high", 25, false],
    ]);
  });

  test("a security term with no reachable fix takes the no-fix band", () => {
    const { run, score } = byName("B");
    const doubled = {
      ...score,
      terms: score.terms.map((t) => (t.part === "security" ? { ...t, multiplier: 2 } : t)),
    };

    expect(whyBar(doubled, run).segments.at(-1)?.band).toBe("critical");
  });

  test("segments past bar_max clip cumulatively and mark the overflow", () => {
    const { run, score } = byName("B");
    const big = { ...score, terms: score.terms.map((t) => ({ ...t, contribution: 30 })) };

    const bar = whyBar(big, run);

    expect(bar.over).toBe(true);
    expect(bar.segments.map((s) => [s.width, s.cut])).toEqual([
      [(30 / 64) * 100, false],
      [(30 / 64) * 100, false],
      [(4 / 64) * 100, true],
    ]);
  });
});

test("the ruler ticks every band floor but the lowest, and tones each zone up to the next floor", () => {
  const { run } = byName("B");

  const ruler = bandRuler(run);

  expect(ruler.max).toBe(run.score_model.bar_max);
  expect(ruler.ticks.map((t) => [t.floor, t.verdict])).toEqual([
    [8, "medium"],
    [16, "high"],
    [32, "critical"],
  ]);
  expect(ruler.zones.map((z) => [z.verdict, z.from, z.width])).toEqual([
    ["low", 0, 12.5],
    ["medium", 12.5, 12.5],
    ["high", 25, 25],
    ["critical", 50, 50],
  ]);
});

test("the legend as text names each segment and its contribution in bar order", () => {
  const { run, score } = byName("B");

  expect(legendText(whyBar(score, run))).toBe("left-behind 16, old-promise 4, vulnerable 16");
});
