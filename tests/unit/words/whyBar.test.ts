import { expect, test } from "vitest";

import { isScoreGraded, type Run, type ScoreGraded } from "../../../src/model/report2";
import { scoreBar } from "../../../src/domain/scoreBar";
import { bandRuler, legendText } from "../../../src/domain/whyBar";
import { recordedCases } from "./recorded";

const byName = (name: string): { run: Run; score: ScoreGraded } => {
  const recorded = recordedCases().find((c) => c.name === name);
  if (recorded === undefined || !isScoreGraded(recorded.finding.score))
    throw new Error(`no graded case ${name}`);
  return { run: recorded.run, score: recorded.finding.score };
};

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

  expect(legendText(scoreBar(score, run))).toBe("left-behind 16, old-promise 4, vulnerable 16");
});
