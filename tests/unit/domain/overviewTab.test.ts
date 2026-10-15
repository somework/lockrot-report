import { describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import {
  exposureBars,
  exposureUnit,
  libyearsTop,
  OVERVIEW_TAB_WORDS,
  scoreStrip,
  stripFlagged,
} from "../../../src/domain/overviewTab";
import type { Finding, Report2 } from "../../../src/model/report";
import { linkHref } from "../../../src/state/hash";

/** The contract composite: 7 graded findings, scores 32, 36, 36, 18, 18, 2 and 2 in rank order,
 *  libyears 2.04, 10.62, 1.76, null, 0, 3.43 and null, one exposure row. */
function composite(): Report2 {
  return structuredClone(assembleEmbed("composite").report);
}

function withFinding(report: Report2, pkg: string, edit: (f: Finding) => void): Report2 {
  const found = report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no finding ${pkg}`);
  edit(found);
  return report;
}

describe("the score strip", () => {
  test("stacks equal totals, highest first, each said by its grades", () => {
    const strip = scoreStrip(composite());

    expect(strip.stacks.map(({ total, say }) => [total, say])).toEqual([
      [36, "score 36: 2 critical"],
      [32, "score 32: 1 critical"],
      [18, "score 18: 2 high"],
      [2, "score 2: 2 low"],
    ]);
  });

  test("places a stack at its total over bar_max and keeps its marks in the Findings order", () => {
    const top = scoreStrip(composite()).stacks[0];

    expect(top?.at).toBe(36 / 64);
    expect(top?.marks).toEqual([
      { package: "symfony/monolog-bridge", verdict: "critical" },
      { package: "symfony/debug", verdict: "critical" },
    ]);
  });

  test("clips a total past bar_max at the ruler's end", () => {
    const report = withFinding(composite(), "twig/twig", (f) => {
      if ("total" in f.score) f.score.total = 70;
    });

    expect(scoreStrip(report).stacks[0]).toMatchObject({ total: 70, at: 1 });
  });

  test("draws each band as a zone from its floor to the next one up", () => {
    expect(scoreStrip(composite()).zones).toEqual([
      { verdict: "low", from: 1 / 64, to: 8 / 64 },
      { verdict: "medium", from: 8 / 64, to: 16 / 64 },
      { verdict: "high", from: 16 / 64, to: 32 / 64 },
      { verdict: "critical", from: 32 / 64, to: 1 },
    ]);
  });

  test("labels 0, the band floors above the lowest, and bar_max", () => {
    expect(scoreStrip(composite()).labels.map(({ value }) => value)).toEqual([0, 8, 16, 32, 64]);
  });

  test("links a stack to Findings searched at exactly its total, the rows it holds", () => {
    const stack = scoreStrip(composite()).stacks[2];
    if (stack === undefined) throw new Error("no third stack");
    expect(linkHref(stack.link)).toBe("#view=findings&q=score%3A18");
  });

  test("has no stack when nothing is graded", () => {
    const report = composite();
    report.findings = [];

    expect(scoreStrip(report).stacks).toEqual([]);
  });
});

describe("the exposure bars", () => {
  test("show the rows as published, sized to the longest, with nothing more", () => {
    const bars = exposureBars(composite());

    expect(bars).toMatchObject({
      rows: [{ package: "guzzlehttp/guzzle", flagged: 1 }],
      longest: 1,
      more: null,
      shared: null,
    });
    expect(linkHref(bars.link)).toBe("#view=radius");
  });

  test("cut at eight rows and count the rest", () => {
    const report = composite();
    report.exposure = Array.from({ length: 11 }, (_, i) => ({ package: `vendor/p${i}`, flagged: 11 - i }));

    const bars = exposureBars(report);

    expect(bars.rows.map((row) => row.package)).toEqual(
      ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((p) => `vendor/${p}`),
    );
    expect(bars.longest).toBe(11);
    expect(bars.more).toBe("3 more in Blast radius");
  });

  test("name the unattributed packages in one sentence", () => {
    const report = composite();
    report.unattributed = [
      { package: "symfony/cache", verdict: "medium", fan_in: 26 },
      { package: "symfony/yaml", verdict: "low", fan_in: 39 },
    ] as Report2["unattributed"];

    expect(exposureBars(report).shared).toBe(
      "2 flagged packages shared by too many requirements to list under one: symfony/cache, symfony/yaml.",
    );
  });
});

describe("an exposure row's unit, for a screen reader", () => {
  test("names the count's unit with one singular rule", () => {
    expect([exposureUnit(1), exposureUnit(15)]).toEqual(["flagged package", "flagged packages"]);
  });
});

describe("the libyears table", () => {
  test("ranks measured packages high to low with one decimal and leaves a null unranked", () => {
    expect(libyearsTop(composite()).map(({ package: name, libyears }) => [name, libyears])).toEqual([
      ["symfony/monolog-bridge", "10.6"],
      ["symfony/yaml", "3.4"],
      ["twig/twig", "2.0"],
      ["symfony/debug", "1.8"],
      ["tubalmartin/cssmin", "0.0"],
    ]);
  });

  test("marks a lower bound, rounds a tie to the even digit, and orders a tie by name", () => {
    let report = withFinding(composite(), "twig/twig", (f) => {
      f.libyears = 2.25;
      f.libyears_at_least = true;
    });
    report = withFinding(report, "symfony/debug", (f) => {
      f.libyears = 2.25;
    });

    const rows = libyearsTop(report);

    expect(rows.slice(2, 4).map(({ package: name, libyears }) => [name, libyears])).toEqual([
      ["symfony/debug", "2.2"],
      ["twig/twig", "≥ 2.2"],
    ]);
  });

  test("links a graded row to Findings and an ungraded one to All packages", () => {
    const report = withFinding(composite(), "symfony/yaml", (f) => {
      f.verdict = "ok";
    });

    const [first, second] = libyearsTop(report);
    if (first === undefined || second === undefined) throw new Error("fewer than two rows");

    expect(linkHref(first.link)).toBe("#view=findings&pkg=symfony%2Fmonolog-bridge");
    expect(second).toMatchObject({ package: "symfony/yaml", grade: "ok" });
    expect(linkHref(second.link)).toBe("#view=packages&pkg=symfony%2Fyaml");
  });

  test("keeps eight rows", () => {
    const report = composite();
    const template = report.findings[0];
    if (template === undefined) throw new Error("no finding");
    report.findings = Array.from({ length: 10 }, (_, i) => ({
      ...template,
      package: `v/p${i}`,
      libyears: i,
    }));

    expect(libyearsTop(report).map(({ package: name }) => name)).toEqual(
      ["p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2"].map((p) => `v/${p}`),
    );
  });

  test("names its caption after the cut", () => {
    expect(OVERVIEW_TAB_WORDS.libyearsTop).toBe("Furthest behind, top 8");
  });
});

describe("the Findings strip", () => {
  test("states the flagged figure", () => {
    expect(stripFlagged(composite())).toBe("7 flagged");
  });
});
