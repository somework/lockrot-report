import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { population2 } from "../../../src/domain/list";
import { pulledTree } from "../../../src/domain/radius";
import {
  gradeMix,
  RADIUS_WORDS,
  radiusAnswer2,
  radiusLayout2,
  radiusRowFacts,
  radiusRows2,
} from "../../../src/domain/radius2";
import type { Report2, Report2Embed } from "../../../src/model/report";
import { INITIAL_STATE } from "../../../src/state/types";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const wallabag = (
  JSON.parse(
    readFileSync(
      join(process.cwd(), ".lockrot/tests/fixtures/baselined/wallabag-2.6/check/report.bundle.json"),
      "utf8",
    ),
  ) as Report2Embed
).report;

const layoutOf = (report: Report2) =>
  radiusLayout2(report, population2(report, "radius"), population2(report, "radius"));

describe("radiusLayout2", () => {
  it("lists under each requirement the packages its S7 names", () => {
    // composite: each exposure requirement has a finding, and its S7 names one flagged package.
    const layout = layoutOf(composite);
    expect(layout.rows.map((row) => [row.package, row.count, row.exposure])).toEqual([
      ["friendsofsymfony/oauth-server-bundle", 1, 1],
      ["guzzlehttp/guzzle", 1, 1],
    ]);
    expect(layout.rows.map((row) => row.pulled.map((f) => f.package))).toEqual([
      ["friendsofsymfony/oauth2-php"],
      ["symfony/polyfill-intl-idn"],
    ]);
  });

  it("lists nothing under a requirement with no finding, and keeps lockrot's count", () => {
    const report: Report2 = { ...composite, exposure: [{ package: "acme/absent", flagged: 3 }] };
    const [row] = layoutOf(report).rows;
    if (row === undefined) throw new Error("no row");
    expect([row.count, row.exposure]).toEqual([0, 3]);
  });

  it("lists nothing under a requirement with a finding but no S7, and keeps lockrot's count", () => {
    const report: Report2 = { ...composite, exposure: [{ package: "symfony/yaml", flagged: 2 }] };
    const [row] = layoutOf(report).rows;
    if (row === undefined) throw new Error("no row");
    expect([row.count, row.exposure]).toEqual([0, 2]);
    expect(radiusRowFacts(report, row)).toEqual({ count: 2, mix: null, note: null });
  });

  it("puts a graded direct requirement off the exposure list among the unlisted, not a row", () => {
    const layout = layoutOf(composite);
    expect(layout.unlisted.map((f) => f.package)).toContain("twig/twig");
    expect(layout.rows.map((row) => row.package)).not.toContain("twig/twig");
  });

  it("orders an open row's packages by rank, never by S7's order or a grade order", () => {
    const polyfill = composite.findings.find((f) => f.package === "symfony/polyfill-intl-idn");
    const bundle = composite.findings.find((f) => f.package === "friendsofsymfony/oauth-server-bundle");
    if (polyfill === undefined || bundle === undefined) throw new Error("no polyfill or bundle");
    const parent = bundle.package;
    const sibling = (name: string, rank: number) => ({
      ...polyfill,
      package: name,
      verdict: "high" as const,
      priority: "high" as const,
      rank,
    });
    const member = (name: string) => ({
      package: name,
      chain: [parent, name],
      verdict: "high" as const,
      lead: null,
      flag_ids: [],
    });
    const withS7 = {
      ...bundle,
      signals: bundle.signals.map((signal) =>
        signal.id === "S7"
          ? { ...signal, data: { flagged: 2, packages: [member("aaa/second"), member("zzz/first")] } }
          : signal,
      ),
    };
    const report: Report2 = {
      ...composite,
      exposure: [{ package: parent, flagged: 2 }],
      findings: [
        ...composite.findings.map((f) => (f.package === parent ? withS7 : f)),
        sibling("zzz/first", 8),
        sibling("aaa/second", 9),
      ],
    };
    const [row] = layoutOf(report).rows;
    if (row === undefined) throw new Error("no row");
    expect(pulledTree(row).map((node) => node.finding.package)).toEqual(["zzz/first", "aaa/second"]);
  });

  it("keeps report.exposure's order, and each row counts exposure[].flagged, on a recorded case", () => {
    const layout = layoutOf(wallabag);

    expect(layout.rows.map((row) => row.package)).toEqual(wallabag.exposure.map((entry) => entry.package));
    expect(layout.rows.map((row) => row.count)).toEqual(wallabag.exposure.map((entry) => entry.flagged));
  });

  it("lists every package of a requirement's S7 signal, vulnerable-only ones too", () => {
    const layout = layoutOf(wallabag);
    const placedAll = layout.rows.flatMap((row) => row.pulled.map((f) => f.package));
    const vulnerableOnly = wallabag.findings.filter(
      (f) => f.flags.length > 0 && f.flags.every(({ id }) => id === "vulnerable"),
    );
    expect(vulnerableOnly.some((f) => placedAll.includes(f.package))).toBe(true);
  });
});

describe("radius words", () => {
  it("R12: counts the packages pulled in, those shared by too many requirements, then the rows that hold them (wallabag)", () => {
    const lines = radiusAnswer2(wallabag, layoutOf(wallabag));

    expect(lines.slice(0, 2)).toEqual([
      "52 flagged packages pulled in.",
      "7 of them sit under more than 8 direct requirements.",
    ]);
    expect(lines[2]).toMatch(/^\d+ of them sit under /);
  });

  it("R12: says nothing of unattributed packages when there are none, and names the first row on a tie", () => {
    // composite: two transitive packages, one under each of its two exposure requirements.
    expect(radiusAnswer2(composite, layoutOf(composite))).toEqual([
      "2 flagged packages pulled in.",
      "1 of them sits under friendsofsymfony/oauth-server-bundle.",
    ]);
  });

  it("counts every package pulled in as shared by too many requirements when no row lists one", () => {
    const report: Report2 = { ...composite, exposure: [{ package: "symfony/yaml", flagged: 2 }] };
    expect(radiusAnswer2(report, layoutOf(report))).toEqual([
      "2 flagged packages pulled in.",
      "2 of them sit under more than 8 direct requirements.",
    ]);
  });

  it("R2-41: names the fan-in limit, and agrees in number for one package", () => {
    const report: Report2 = {
      ...composite,
      exposure: [{ package: "symfony/yaml", flagged: 2 }],
      exposure_rule: { max_fan_in: 3 },
      rot_depth: { ...composite.rot_depth, by_reach: { ...composite.rot_depth.by_reach, transitive: 1 } },
    };
    expect(radiusAnswer2(report, layoutOf(report))[1]).toBe(
      "1 of them sits under more than 3 direct requirements.",
    );
  });

  it("gives a row's count and its grade split in graded_verdicts order", () => {
    const row = layoutOf(wallabag).rows.find((r) => r.package === "kphoen/rulerz");
    if (row === undefined) throw new Error("no row");
    expect(radiusRowFacts(wallabag, row)).toEqual({
      count: row.count,
      mix: gradeMix(wallabag, row.pulled),
      note: null,
    });
    expect(gradeMix(composite, composite.findings)).toBe("4 critical, 2 high, 3 low");
  });

  it("gives no count for a row the filter empties, and says how many it hides", () => {
    const [row] = layoutOf(composite).rows;
    if (row === undefined) throw new Error("no row");
    expect(radiusRowFacts(composite, { ...row, count: 0, unfiltered: 1, pulled: [] })).toEqual({
      count: null,
      mix: null,
      note: "None of the 1 flagged package listed under it match the filter.",
    });
  });

  it("agrees in number when one or more rows do not match the filter", () => {
    expect(RADIUS_WORDS.filtered(1)).toBe("1 more does not match the filter");
    expect(RADIUS_WORDS.filtered(2)).toBe("2 more do not match the filter");
  });

  it("drops the held line under a grade filter, which the unfiltered pulled count cannot share", () => {
    const low = population2(composite, "radius").filter((f) => f.verdict === "low");
    const filtered = radiusLayout2(composite, low, population2(composite, "radius"));
    expect(radiusAnswer2(composite, filtered)).toEqual(["2 flagged packages pulled in."]);
    expect(radiusAnswer2(composite, layoutOf(composite))).toContain(
      "1 of them sits under friendsofsymfony/oauth-server-bundle.",
    );
  });

  it("ends the lead when nothing is pulled in, and answers a filtered tab", () => {
    const direct: Report2 = {
      ...composite,
      rot_depth: { ...composite.rot_depth, by_reach: { ...composite.rot_depth.by_reach, transitive: 0 } },
    };
    expect(radiusAnswer2(direct, layoutOf(direct))).toEqual([]);
    const narrowed = radiusLayout2(composite, [], population2(composite, "radius"));
    expect(radiusAnswer2(composite, narrowed)).toEqual([
      "No direct requirement lists a flagged package that matches the filter.",
    ]);
  });
});

describe("radiusRows2", () => {
  it("walks the requirement rows, and an open row's packages under it", () => {
    const layout = layoutOf(wallabag);
    const row = layout.lead[0];
    if (row === undefined) throw new Error("no row");
    const open = { ...INITIAL_STATE, disclosure: { [`row:${row.package}`]: true } };
    expect(radiusRows2(layout, open, false).slice(0, row.count + 1)).toEqual([
      row.package,
      ...pulledTree(row).map((node) => node.finding.package),
    ]);
  });
});

describe("radiusRows2 on a recorded case", () => {
  const layout = layoutOf(wallabag);
  const rowsOf = (rows: typeof layout.lead) =>
    rows.flatMap((row) => [row.package, ...pulledTree(row).map((node) => node.finding.package)]);
  const all = Object.fromEntries(layout.rows.map((row) => [`row:${row.package}`, true]));

  it("walks lead rows with their packages, then the singles", () => {
    const open = { ...INITIAL_STATE, disclosure: all };

    expect(radiusRows2(layout, open, false)).toEqual([...rowsOf(layout.lead), ...rowsOf(layout.singles)]);
    expect(radiusRows2(layout, open, false).length).toBeGreaterThan(layout.rows.length);
  });

  it("leaves out the packages of a closed row, and a closed one-each fold", () => {
    expect(radiusRows2(layout, INITIAL_STATE, false)).toEqual([
      ...layout.lead.map((row) => row.package),
      ...layout.singles.map((row) => row.package),
    ]);
    const shut = { ...INITIAL_STATE, disclosure: { "fold:singles": false } };
    expect(radiusRows2(layout, shut, false)).toEqual(layout.lead.map((row) => row.package));
  });
});
