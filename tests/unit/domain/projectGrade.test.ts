import { describe, expect, test } from "vitest";

import { flagBars } from "../../../src/domain/overviewBand";
import {
  figureLine,
  flagPoints,
  gradeLine,
  gradeLineText,
  loadLine,
  weighsMost,
  WEIGHS_WORDS,
} from "../../../src/domain/projectGrade";
import type { Finding, Report2 } from "../../../src/model/report";
import { linkHref } from "../../../src/state/hash";
import { multiFindingReports, pageGoldens } from "../words/recorded";

function golden(id: string): Report2 {
  const found = pageGoldens().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no page golden ${id}`);
  return structuredClone(found.report);
}

function baselined(name: string): Report2 {
  const found = multiFindingReports().find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no recorded report ${name}`);
  return structuredClone(found.report);
}

const lines = (report: Report2) => {
  const grade = gradeLine(report);
  return [grade === null ? null : gradeLineText(grade), figureLine(report), loadLine(report)];
};

interface RunShape {
  checked: number;
  flagged: number;
  counts: Partial<Report2["counts"]>;
  /** [verdict, score.total, how many findings], in `findings[]` order. */
  findings: [Finding["verdict"], number, number][];
}

/** A report-2 that holds a recorded run's counts and scores, from the worked values of the brief. */
function run({ checked, flagged, counts, findings }: RunShape): Report2 {
  const report = golden("composite");
  const template = report.findings[0];
  if (template === undefined) throw new Error("no finding");
  report.packages_checked = checked;
  report.packages_flagged = flagged;
  report.counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, finished: 0, ok: 0, ...counts };
  report.findings = findings.flatMap(([verdict, total, n], group) =>
    Array.from({ length: n }, (_, i) => {
      const finding = structuredClone(template);
      finding.package = `vendor/p${String(group)}-${String(i)}`;
      finding.verdict = verdict;
      if ("total" in finding.score) finding.score.total = total;
      return finding;
    }),
  );
  return report;
}

describe("the four recorded runs of the brief", () => {
  test.each([
    [
      "wallabag",
      run({
        checked: 200,
        flagged: 57,
        counts: { critical: 3, high: 39, medium: 12, low: 3 },
        findings: [
          ["critical", 36, 3],
          ["high", 16, 37],
          ["high", 27, 2],
          ["medium", 8, 12],
          ["low", 4, 3],
        ],
      }),
      "Project grade: critical · 3 critical findings · 42 of 200 packages high or worse",
      "862 points on 57 flagged packages · 754 (87 %) from high or worse · score model 1",
    ],
    [
      "koel",
      run({
        checked: 156,
        flagged: 13,
        counts: { critical: 1, high: 5, medium: 4, low: 2, unknown: 1 },
        findings: [
          ["critical", 36, 1],
          ["high", 16, 5],
          ["medium", 8, 4],
          ["low", 4, 2],
        ],
      }),
      "Project grade: critical · 1 critical finding · 6 of 156 packages high or worse · 1 not judged",
      "156 points on 13 flagged packages · 116 (74 %) from high or worse · score model 1",
    ],
    [
      "mautic",
      run({
        checked: 193,
        flagged: 27,
        counts: { high: 6, medium: 15, low: 6 },
        findings: [
          ["high", 16, 5],
          ["high", 18, 1],
          ["medium", 8, 15],
          ["low", 4, 6],
        ],
      }),
      "Project grade: high · 6 high findings · 6 of 193 packages high or worse",
      "242 points on 27 flagged packages · 98 (40 %) from high or worse · score model 1",
    ],
  ])("%s reads its grade line and its load line", (_, report, grade, load) => {
    const [gradeText, , loadText] = lines(report);

    expect(gradeText).toBe(grade);
    expect(loadText).toBe(load);
  });

  test("akaunting, as recorded, reads its three lines", () => {
    expect(lines(golden("akaunting"))).toEqual([
      "Project grade: critical · 3 critical findings · 25 of 183 packages high or worse",
      "37 of 183 packages flagged · 126 ok · 20 allowlisted",
      "527 points on 37 flagged packages · 450 (85 %) from high or worse · score model 1",
    ]);
  });

  test("akaunting draws its 10 highest scores, ties in findings order, and holds the rest in one line", () => {
    const chart = weighsMost(golden("akaunting"));

    expect(chart?.rows.map(({ package: name, total }) => `${name} ${String(total)}`)).toEqual([
      "plank/laravel-mediable 32",
      "genealabs/laravel-model-caching 32",
      "intervention/imagecache 32",
      "hoa/consistency 18",
      "laravel/framework 16",
      "league/commonmark 16",
      "akaunting/laravel-language 16",
      "akaunting/laravel-mutable-observer 16",
      "intervention/image 16",
      "laravel/slack-notification-channel 16",
    ]);
    expect(chart?.rest).toBe("27 more flagged packages hold 317 points");
  });

  test("akaunting's bars draw each term at its contribution over bar_max, a halved term halved", () => {
    const rows = weighsMost(golden("akaunting"))?.rows ?? [];

    expect(rows[0]?.segments.map(({ flag, width }) => [flag, width])).toEqual([
      ["left-behind", 16 / 64],
      ["vulnerable", 16 / 64],
    ]);
    expect(rows[3]).toMatchObject({ package: "hoa/consistency", grade: "high", reach: ["transitive"] });
    expect(rows[3]?.segments.map(({ flag, width }) => [flag, width])).toEqual([
      ["abandoned", 16 / 64],
      ["old-promise", 2 / 64],
    ]);
    expect(rows[3]?.text).toBe("18 = (abandoned 32 + old-promise 4 [¼ of 16]) ÷ 2 transitive");
  });

  test("akaunting's flag ledger prints the points each flag holds", () => {
    expect(flagBars(golden("akaunting")).map(({ flag, points }) => `${flag} ${points}`)).toEqual([
      "abandoned 288 pts",
      "left-behind 104 pts",
      "old-promise 26 pts",
      "stale 53 pts",
      "vulnerable 56 pts",
    ]);
  });
});

describe("the three lines of the page-golden documents", () => {
  test.each([
    [
      "composite",
      "Project grade: critical · 3 critical findings · 5 of 7 packages high or worse",
      "7 of 7 packages flagged · 0 ok · 0 allowlisted",
      "144 points on 7 flagged packages · 140 (97 %) from high or worse · score model 1",
    ],
    [
      "new-symfony",
      "Project grade: nothing flagged",
      "0 of 1 package flagged · 1 ok · 0 allowlisted",
      "0 points: nothing flagged",
    ],
    [
      "ok-offline",
      "Project grade: nothing flagged · not checked",
      "0 of 1 package flagged · 1 ok · 0 allowlisted",
      "0 points: nothing flagged",
    ],
    [
      "policy-off",
      "Project grade: medium · 1 medium finding · 0 of 1 package high or worse",
      "1 of 1 package flagged · 0 ok · 0 allowlisted",
      "8 points on 1 flagged package · 0 (0 %) from high or worse · score model 1",
    ],
    [
      "B-dev‡",
      "Project grade: high · 1 high finding · 1 of 1 package high or worse",
      "1 of 1 package flagged · 0 ok · 0 allowlisted",
      "18 points on 1 flagged package · 18 (100 %) from high or worse · score model 1 · 18 from packages-dev",
    ],
    [
      "wallabag",
      "Project grade: critical · 15 critical findings · 84 of 210 packages high or worse",
      "110 of 210 packages flagged · 81 ok · 19 allowlisted",
      "1849 points on 110 flagged packages · 1664 (89 %) from high or worse · score model 1",
    ],
  ])("%s", (id, grade, figure, load) => {
    expect(lines(golden(id))).toEqual([grade, figure, load]);
  });

  test("an empty lock has no grade line, no figure line, no load line and no chart", () => {
    const report = golden("empty-lock");

    expect(lines(report)).toEqual([null, null, null]);
    expect(weighsMost(report)).toBeNull();
  });
});

describe("the grade line", () => {
  test("names the grade apart from its clauses, for the chip that links to Findings", () => {
    const line = gradeLine(golden("composite"));

    expect(line?.grade).toBe("critical");
    expect(line?.link == null ? null : linkHref(line.link)).toBe("#view=findings&verdict=critical");
  });

  test("has no grade and no link when nothing is graded", () => {
    expect(gradeLine(golden("new-symfony"))).toMatchObject({ grade: null, link: null });
  });

  test("adds the lookup word of a partial lookup", () => {
    const report = golden("composite");
    report.security.check = "partial";

    expect(lines(report)[0]).toBe(
      "Project grade: critical · 3 critical findings · 5 of 7 packages high or worse · lookup partial",
    );
  });

  test("lets neither unknown, ok nor finished set the grade", () => {
    const report = golden("new-symfony");
    report.counts = { ...report.counts, unknown: 2, finished: 3 };

    expect(lines(report)[0]).toBe("Project grade: nothing flagged · 2 not judged");
  });

  test("counts the graded findings known to the baseline, after the other qualifiers", () => {
    expect(lines(baselined("baselined/wallabag-2.6"))).toEqual([
      "Project grade: critical · 15 critical findings · 84 of 210 packages high or worse · 45 known to the baseline",
      "112 of 210 packages flagged · 79 ok · 19 allowlisted",
      "1861 points on 112 flagged packages · 1664 (89 %) from high or worse · score model 1",
    ]);
  });

  test("says nothing of a known finding when the run has no baseline", () => {
    const report = baselined("baselined/wallabag-2.6");
    report.baseline = null;

    expect(lines(report)[0]).not.toContain("known to the baseline");
  });
});

describe("the load line", () => {
  test("adds the points from packages-dev", () => {
    expect(lines(baselined("baselined/wallabag-main"))[2]).toBe(
      "898 points on 71 flagged packages · 738 (82 %) from high or worse · score model 1 · 88 from packages-dev",
    );
  });

  test("leaves the share out when the graded findings hold no point", () => {
    const report = golden("policy-off");
    for (const finding of report.findings) if ("total" in finding.score) finding.score.total = 0;

    expect(lines(report)[2]).toBe("0 points on 1 flagged package · 0 from high or worse · score model 1");
  });
});

describe("the points of the flag ledger", () => {
  test("print a half point of a --dev run", () => {
    const report = golden("B-dev‡");
    const term = report.findings[0]?.score;
    if (term === undefined || !("terms" in term)) throw new Error("no graded score");
    const promise = term.terms.find(({ flag }) => flag === "old-promise");
    if (promise === undefined) throw new Error("no old-promise term");
    promise.contribution = 2.5;

    expect(flagBars(report).map(({ flag, points }) => `${flag} ${points}`)).toEqual([
      "left-behind 8 pts",
      "old-promise 2.5 pts",
      "vulnerable 8 pts",
    ]);
  });

  test("sum over the graded findings only", () => {
    const report = golden("composite");
    const twig = report.findings.find((f) => f.package === "twig/twig");
    if (twig === undefined) throw new Error("no twig/twig");
    twig.verdict = "ok";

    expect(flagPoints(report).get("vulnerable")).toBe(20);
  });
});

describe("Weighs most", () => {
  test("draws every graded finding when 10 or fewer are, with no rest line", () => {
    const chart = weighsMost(golden("composite"));

    expect(chart?.rows.map(({ package: name }) => name)).toEqual([
      "symfony/monolog-bridge",
      "symfony/debug",
      "twig/twig",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    expect(chart?.rest).toBeNull();
  });

  test("names in its legend each flag a drawn segment carries, in flag order", () => {
    expect(weighsMost(golden("composite"))?.legend).toEqual([
      "abandoned",
      "pinned",
      "left-behind",
      "old-promise",
      "stale",
      "vulnerable",
    ]);
  });

  test("links each row to its package on Findings and the rest line to Findings", () => {
    const chart = weighsMost(golden("akaunting"));

    expect(chart?.rows[0] === undefined ? null : linkHref(chart.rows[0].link)).toBe(
      "#view=findings&pkg=plank%2Flaravel-mediable",
    );
    expect(chart === null ? null : linkHref(chart.restLink)).toBe("#view=findings");
  });

  test("says dev beside a packages-dev finding and transitive beside an indirect one", () => {
    const report = golden("B-dev‡");
    const finding = report.findings[0];
    if (finding === undefined) throw new Error("no finding");
    finding.direct = false;

    expect(weighsMost(report)?.rows[0]?.reach).toEqual(["transitive", "dev"]);
  });

  test("draws no bar and no rest line when nothing is graded", () => {
    expect(weighsMost(golden("new-symfony"))).toEqual({
      rows: [],
      legend: [],
      rest: null,
      restLink: { view: "findings" },
    });
  });

  test("holds one singular rest line", () => {
    const report = golden("akaunting");
    const graded = report.findings.filter(({ verdict }) =>
      report.run.graded_verdicts.some((g) => g === verdict),
    );
    report.findings = graded.slice(0, 11);

    expect(weighsMost(report)?.rest).toBe(`1 more flagged package holds 16 points`);
  });

  test("names its block and its order, with no count that a short list would belie", () => {
    expect([WEIGHS_WORDS.head, WEIGHS_WORDS.note]).toEqual([
      "Weighs most",
      "highest score first, one segment per flag",
    ]);
  });
});
