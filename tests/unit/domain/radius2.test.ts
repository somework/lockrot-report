import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { population2 } from "../../../src/domain/list2";
import { radiusRowOrder } from "../../../src/domain/radius";
import {
  gradeMix,
  radiusAnswer2,
  radiusLayout2,
  radiusRowSay,
  radiusRows2,
} from "../../../src/domain/radius2";
import type { Report2, Report2Embed } from "../../../src/model/report2";
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
  it("lists a transitive package under the requirement its chain runs through", () => {
    const layout = layoutOf(composite);
    expect(layout.ranked.map((row) => row.package)).toEqual(["guzzlehttp/guzzle"]);
    expect(layout.ranked[0]?.pulled.map((f) => f.package)).toEqual(["symfony/polyfill-intl-idn"]);
  });

  it("puts a graded direct requirement that lists nothing among the self-only rows", () => {
    expect(layoutOf(composite).unlisted.map((f) => f.package)).toContain("twig/twig");
  });

  it("lists or points to every package of a requirement's S7 signal, vulnerable-only ones too", () => {
    const layout = layoutOf(wallabag);
    const placedAll: string[] = [];
    for (const finding of wallabag.findings) {
      const s7 = finding.signals.find(({ id }) => id === "S7");
      const row = [...layout.ranked, ...layout.selfOnly].find((r) => r.package === finding.package);
      if (s7 === undefined || row === undefined) continue;
      const listed = (s7.data as { packages: { package: string }[] }).packages.map((p) => p.package);
      const shared = new Set(wallabag.unattributed.map((entry) => entry.package));
      const placed = [...row.pulled, ...row.elsewhere.map((entry) => entry.finding)].map((f) => f.package);
      expect(placed.sort()).toEqual(listed.filter((p) => !shared.has(p)).sort());
      placedAll.push(...placed);
    }
    const vulnerableOnly = wallabag.findings.filter(
      (f) => f.flags.length > 0 && f.flags.every(({ id }) => id === "vulnerable"),
    );
    expect(vulnerableOnly.some((f) => placedAll.includes(f.package))).toBe(true);
  });
});

describe("radius words", () => {
  it("answers with the rows that hold the flagged packages", () => {
    expect(radiusAnswer2(layoutOf(composite))).toBe("1 flagged package pulled in, under guzzlehttp/guzzle.");
  });

  it("says what a row lists, by grade in graded_verdicts order", () => {
    const [row] = layoutOf(composite).ranked;
    if (row === undefined) throw new Error("no row");
    expect(radiusRowSay(composite, row)).toBe("Pulls in 1 flagged package: 1 low.");
    expect(gradeMix(composite, composite.findings)).toBe("3 critical, 2 high, 2 low");
  });

  it("answers an empty tab, and a filtered one", () => {
    const empty: Report2 = { ...composite, exposure: [] };
    expect(radiusAnswer2(layoutOf(empty))).toBe("No direct requirement pulls in a flagged package.");
    const narrowed = radiusLayout2(composite, [], population2(composite, "radius"));
    expect(radiusAnswer2(narrowed)).toBe(
      "No direct requirement lists a flagged package that matches the filter.",
    );
  });
});

describe("radiusRows2", () => {
  it("walks the requirement rows, and an open row's packages under it", () => {
    const layout = layoutOf(composite);
    expect(radiusRows2(layout, INITIAL_STATE, false)).toEqual(["guzzlehttp/guzzle"]);
    const open = { ...INITIAL_STATE, disclosure: { "row:guzzlehttp/guzzle": true } };
    expect(radiusRows2(layout, open, false)).toEqual(["guzzlehttp/guzzle", "symfony/polyfill-intl-idn"]);
  });
});

describe("radiusRows2 against the report-1 walk", () => {
  it("walks the rows radiusRowOrder walks, folds and tails included", () => {
    const layout = layoutOf(wallabag);
    const all = Object.fromEntries(
      [...layout.ranked, ...layout.selfOnly].map((row) => [`row:${row.package}`, true]),
    );
    const open = { ...INITIAL_STATE, disclosure: { ...all, "fold:self": true, "fold:other": true } };
    const rows = radiusRows2(layout, open, false);
    expect(rows).toEqual(radiusRowOrder(layout, { disclosure: open.disclosure, pkg: null, narrow: false }));
    expect(rows.length).toBeGreaterThan(layout.ranked.length);
  });
});
