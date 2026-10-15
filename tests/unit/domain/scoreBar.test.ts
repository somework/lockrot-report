import { describe, expect, it } from "vitest";
import { scoreBar } from "../../../src/domain/scoreBar";
import type { Report2, ScoreGraded, Term } from "../../../src/model/report2";
import { isScoreGraded, isTermSecurity } from "../../../src/model/report2";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const run = composite.run;
const barMax = run.score_model.bar_max;

function graded(pkg: string): ScoreGraded {
  const score = composite.findings.find((f) => f.package === pkg)?.score;
  if (score === undefined || !isScoreGraded(score)) throw new Error(`${pkg} is not graded`);
  return score;
}

describe("scoreBar", () => {
  it("lays one segment per term, each as wide as its contribution over bar_max", () => {
    const score = graded("symfony/monolog-bridge");
    const bar = scoreBar(score, run);
    expect(bar.segments.map((s) => [s.flag, s.role, s.width])).toEqual(
      score.terms.map((t) => [t.flag, t.role, t.contribution / barMax]),
    );
    expect(bar.over).toBe(false);
  });

  it("tones a maintenance segment by its flag's band and a security one by its severity's", () => {
    const [lead, , security] = scoreBar(graded("symfony/monolog-bridge"), run).segments;
    expect(lead?.band).toBe(run.score_model.flags.find((f) => f.id === "left-behind")?.band);
    expect(security?.band).toBe(run.score_model.severities.find((s) => s.id === "high")?.band);
  });

  it("ticks every band floor but the lowest", () => {
    const floors = run.score_model.bands.map((b) => b.floor).sort((a, b) => a - b);
    expect(scoreBar(graded("twig/twig"), run).ticks).toEqual(
      floors.slice(1).map((floor) => ({ floor, at: floor / barMax })),
    );
  });

  it("clips past bar_max: the crossing segment is cut, a later one dropped, and the bar marked over", () => {
    const score = graded("symfony/debug");
    const [lead] = score.terms;
    if (lead === undefined || isTermSecurity(lead)) throw new Error("symfony/debug has a maintenance lead");
    const big: Term = { ...lead, contribution: barMax - 1 };
    const terms: Term[] = [
      big,
      { ...lead, flag: "stale", contribution: 4 },
      { ...lead, flag: "silent", contribution: 2 },
    ];
    const bar = scoreBar({ ...score, terms }, run);
    expect(bar.over).toBe(true);
    expect(bar.segments.map((s) => [s.flag, s.width, s.cut])).toEqual([
      [lead.flag, (barMax - 1) / barMax, false],
      ["stale", 1 / barMax, true],
    ]);
  });

  it("draws an unknown role solid, as a lead", () => {
    const score = graded("symfony/debug");
    const terms = score.terms.map((t) => ({ ...t, role: "rumour" })) as unknown as Term[];
    expect(scoreBar({ ...score, terms }, run).segments.map((s) => s.role)).toEqual(["lead", "lead"]);
  });
});
