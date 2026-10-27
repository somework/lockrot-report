import { describe, expect, test } from "vitest";
import { assembleEmbed } from "../../../scripts/report2-embed";
import {
  depthRows,
  exposureBars,
  exposureUnit,
  libyearsCaption,
  libyearsTop,
  OVERVIEW_TAB_WORDS,
  stripFlagged,
} from "../../../src/domain/overviewTab";
import type { Finding, Report2 } from "../../../src/model/report";
import { linkHref } from "../../../src/state/hash";

/** The recorded contract composite. */
function composite(): Report2 {
  return structuredClone(assembleEmbed("composite").report);
}

function withFinding(report: Report2, pkg: string, edit: (f: Finding) => void): Report2 {
  const found = report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no finding ${pkg}`);
  edit(found);
  return report;
}

describe("the depth bars (SPEC §7.9.4)", () => {
  test("name depth 0 direct, as the text formats do, and count each hop", () => {
    const report = composite();
    report.rot_depth = {
      ...report.rot_depth,
      flagged: 5,
      unmeasured: { unreached: 0, no_composer_json: 0 },
      by_reach: { direct: 3, transitive: 2, unreached: 0 },
      by_depth: [
        { depth: 0, flagged: 3 },
        { depth: 1, flagged: 1 },
        { depth: 2, flagged: 1 },
      ],
    };

    expect(depthRows(report)).toEqual([
      { label: "direct", flagged: 3 },
      { label: "1 hop away", flagged: 1 },
      { label: "2 hops away", flagged: 1 },
    ]);
  });
});

describe("the exposure bars", () => {
  test("show the rows as published, on a track of the flagged set, with nothing more", () => {
    const report = composite();
    const bars = exposureBars(report);

    expect(bars).toMatchObject({
      rows: [
        { package: "friendsofsymfony/oauth-server-bundle", flagged: 1 },
        { package: "guzzlehttp/guzzle", flagged: 1 },
      ],
      longest: report.packages_flagged,
      overlap:
        "A flagged package counts under each direct requirement it is reached from, up to 8, so the rows overlap.",
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
    expect(bars.longest).toBe(Math.max(11, report.packages_flagged));
    expect(bars.overlap).toContain(`up to ${String(report.exposure_rule.max_fan_in)}`);
    expect(bars.more).toBe("3 more in Blast radius");
    expect(bars.count).toBe("11 direct requirements pull in flagged packages.");
  });

  test("count exposure[] with no threshold only from two entries up", () => {
    const report = composite();
    report.exposure = [{ package: "vendor/a", flagged: 3 }];
    expect(exposureBars(report).count).toBeNull();
  });

  test("name the unattributed packages that are graded findings in one sentence", () => {
    const report = composite();
    report.unattributed = [
      { package: "symfony/cache", verdict: "medium", fan_in: 26 },
      { package: "symfony/yaml", verdict: "low", fan_in: 39 },
    ] as Report2["unattributed"];

    expect(exposureBars(report).shared).toBe(
      "1 flagged package shared by too many requirements to list under one: symfony/yaml.",
    );
  });
});

describe("an exposure row's unit, for a screen reader", () => {
  test("names the count's unit with one singular rule", () => {
    expect([exposureUnit(1), exposureUnit(15)]).toEqual(["flagged package", "flagged packages"]);
  });
});

describe("the libyears table", () => {
  test("ranks measured packages high to low with one decimal, leaving a null and a 0.0 out", () => {
    expect(libyearsTop(composite()).map(({ package: name, libyears }) => [name, libyears])).toEqual([
      ["symfony/monolog-bridge", "10.6"],
      ["guzzlehttp/guzzle", "4.2"],
      ["symfony/yaml", "3.4"],
      ["twig/twig", "2.0"],
      ["symfony/debug", "1.8"],
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

    expect(rows.slice(3, 5).map(({ package: name, libyears }) => [name, libyears])).toEqual([
      ["symfony/debug", "2.2"],
      ["twig/twig", "≥ 2.2"],
    ]);
  });

  test("links a graded row to Findings and an ungraded one to All packages", () => {
    const report = withFinding(composite(), "guzzlehttp/guzzle", (f) => {
      f.verdict = "ok";
    });

    const [first, second] = libyearsTop(report);
    if (first === undefined || second === undefined) throw new Error("fewer than two rows");

    expect(linkHref(first.link)).toBe("#view=findings&pkg=symfony%2Fmonolog-bridge");
    expect(second.package).toBe("guzzlehttp/guzzle");
    expect(linkHref(second.link)).toBe("#view=packages&pkg=guzzlehttp%2Fguzzle");
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

  test("shows the most recent release with its date, and draws no arrow from the installed version", () => {
    expect(libyearsTop(composite()).map(({ package: name, release }) => [name, release])).toEqual([
      ["symfony/monolog-bridge", "v6.4.45 (2026-08-30)"],
      ["guzzlehttp/guzzle", "8.2.0 (2026-09-06)"],
      ["symfony/yaml", "v8.1.8 (2026-09-26)"],
      ["twig/twig", "v3.30.0 (2026-09-25)"],
      ["symfony/debug", "v4.4.44 (2022-07-28)"],
    ]);
  });

  test("draws no arrow when the most recent release is an older version than the installed one", () => {
    const report = withFinding(composite(), "symfony/yaml", (f) => {
      f.age.release = { ...(f.age.release as NonNullable<typeof f.age.release>), version: "v1.0.0" };
    });

    const row = libyearsTop(report).find(({ package: name }) => name === "symfony/yaml");
    expect(row?.release).toBe("v1.0.0 (2026-09-26)");
  });

  test("gives the cause words when the newest release was not measured", () => {
    const report = withFinding(composite(), "symfony/yaml", (f) => {
      f.age.release = null;
      f.age.release_unmeasured = "undated_releases";
    });

    expect(libyearsTop(report).find((row) => row.package === "symfony/yaml")?.release).toBe(
      "undated releases",
    );
  });

  test("carries no grade: a row is the package's lag, not its verdict", () => {
    const row = libyearsTop(composite())[0];

    expect(row).not.toHaveProperty("grade");
    expect(Object.values(OVERVIEW_TAB_WORDS)).not.toContain("Grade");
    expect(OVERVIEW_TAB_WORDS.release).toBe("Most recent release");
  });

  test("names in its caption the count of rows it shows, and no count for one row (R4-31)", () => {
    expect(libyearsCaption(5)).toBe("Furthest behind, top 5");
    expect(libyearsCaption(8)).toBe("Furthest behind, top 8");
    expect(libyearsCaption(2)).toBe("Furthest behind, top 2");
    expect(libyearsCaption(1)).toBe("Furthest behind");
  });
});

describe("the Findings strip", () => {
  test("states the flagged figure", () => {
    expect(stripFlagged(composite())).toBe("9 flagged");
  });
});
