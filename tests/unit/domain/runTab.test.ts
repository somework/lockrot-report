import { describe, expect, test } from "vitest";

import { advisoryLookup, acceptedUnchecked, noteRows, thresholdRows } from "../../../src/domain/runTab";
import { bandRuler, scorePanelParts, scoreTables } from "../../../src/domain/scorePanel";
import type { Report2, UncheckedAccepted } from "../../../src/model/report2";
import { pageGoldens, readContractJson, recordedCases } from "../words/recorded";

function golden(id: string): Report2 {
  const found = pageGoldens().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no page golden ${id}`);
  return structuredClone(found.report);
}

describe("the rule rows of How the score works", () => {
  test("hold every rule in stage order, with its docs link and its use count", () => {
    const { rules } = scorePanelParts(golden("composite").run);

    expect(rules).toHaveLength(16);
    expect(rules[1]).toEqual({
      stage: 2,
      label: "lead in full",
      text: "the strongest maintenance fact counts in full",
      used: "used on 4",
      muted: false,
      href: "https://lockrot.dev/verdicts/model-1/#score-lead-first",
    });
  });

  test("mute a rule used on no finding and print a dash for an uncounted one", () => {
    const { rules } = scorePanelParts(golden("composite").run);

    expect(rules[0]).toMatchObject({ label: "counted", used: "used on 0", muted: true });
    expect(rules[13]).toMatchObject({ label: "sort", used: "—", muted: false });
  });

  test("print no count for a rule id the report does not count", () => {
    const { run } = golden("composite");
    const { "lead-first": _dropped, ...used } = run.score_rules_used;

    expect(scorePanelParts({ ...run, score_rules_used: used }).rules[1]).toMatchObject({
      used: "",
      muted: false,
    });
  });
});

describe("the band ruler", () => {
  test("places each band from its floor over bar_max, lowest first, the lowest zone from 0", () => {
    expect(bandRuler(golden("composite").run.score_model)).toEqual({
      zones: [
        { verdict: "low", from: 0, to: 8 / 64 },
        { verdict: "medium", from: 8 / 64, to: 16 / 64 },
        { verdict: "high", from: 16 / 64, to: 32 / 64 },
        { verdict: "critical", from: 32 / 64, to: 1 },
      ],
      ticks: [
        { at: 0, text: "0" },
        { at: 8 / 64, text: "8" },
        { at: 16 / 64, text: "16" },
        { at: 32 / 64, text: "32" },
        { at: 1, text: "64" },
      ],
    });
  });
});

describe("the weight and advisory tables", () => {
  test("give each weighted flag its points, band, share after the lead, previous band and limit", () => {
    const { weights } = scoreTables(golden("composite").run.score_model);

    expect(weights.head).toEqual([
      "Flag",
      "Points",
      "Band",
      "After the lead, ¼",
      "The previous release's band",
      "With corroboration, at most",
    ]);
    expect(weights.rows[0]).toEqual([
      { text: "abandoned" },
      { text: "32" },
      { text: "critical", band: "critical" },
      { text: "—" },
      { text: "critical", band: "critical" },
      { text: "40 (abandoned + left-behind + old-promise)" },
    ]);
    expect(weights.rows[2]?.[3]).toEqual({ text: "4" });
  });

  test("give each severity its points and band, and both again with no reachable fix", () => {
    const { advisories } = scoreTables(golden("composite").run.score_model);

    expect(advisories.head).toEqual(["Severity", "Points", "Band", "× 2: no reachable fix", "Band"]);
    expect(advisories.rows[3]).toEqual([
      { text: "unrated (counts as medium)" },
      { text: "8" },
      { text: "medium", band: "medium" },
      { text: "16" },
      { text: "high", band: "high" },
    ]);
  });
});

describe("the advisory lookup", () => {
  test("states the scope, the packages asked and one row per repository", () => {
    expect(advisoryLookup(golden("composite").run)).toEqual({
      scope: "Scope: all · default",
      asked: "7 packages asked · 0 not asked",
      repositories: ["packagist.org: 33 on record · 4 packages with records"],
      other: null,
    });
  });

  test("words the composer-repositories scope set in config, and the other repositories", () => {
    const { run } = golden("composite");
    const lookup = {
      ...run.advisory_lookup,
      scope: "composer-repositories" as const,
      scope_source: "config" as const,
      other_repositories: 1,
    };

    expect(advisoryLookup({ ...run, advisory_lookup: lookup })).toMatchObject({
      scope:
        "Scope: packages from a Composer repository only (advisory-lookup) · set in extra.lockrot.advisory-lookup",
      other: "1 other repository publishes no advisories",
    });
  });
});

describe("the notes", () => {
  test("add whether advisories were asked to the not-from-a-Composer-repository note", () => {
    const report = golden("composite");
    report.note_details = [
      {
        code: "not_from_composer_repository",
        text: "1 package is not from a Composer repository: its release metadata and repository activity were not read",
        docs_url: null,
        sets_network_failures: false,
        data: { package_count: 1, advisories_asked: false },
      },
    ];

    expect(noteRows(report)).toEqual([
      {
        text: "1 package is not from a Composer repository: its release metadata and repository activity were not read · advisories not asked",
        docs: null,
      },
    ]);
  });
});

describe("the accepted unchecked checks", () => {
  const accepted: UncheckedAccepted = {
    check: "repository_activity",
    reason: "host_not_supported",
    blocks: ["S3", "S4"],
    accepted_by: { scope: "host", value: "git.example.org", reason: "our own forge", expires: "2027-01-31" },
  };

  test("count the packages and give one row per accepted check", () => {
    const report = golden("composite");
    report.packages_unchecked_accepted = 1;
    const [first, ...rest] = report.findings;
    if (first === undefined) throw new Error("no finding");
    report.findings = [{ ...first, unchecked_accepted: [accepted] }, ...rest];

    expect(acceptedUnchecked(report)).toEqual({
      head: "1 package with a check your accept-unchecked list accepted",
      rows: [
        `${first.package} · repository_activity · host not supported · host git.example.org · our own forge · until 2027-01-31`,
      ],
    });
  });

  test("are left out when no package has one", () => {
    expect(acceptedUnchecked(golden("composite"))).toBeNull();
  });
});

describe("the thresholds", () => {
  test("list each recorded threshold in years", () => {
    expect(thresholdRows(golden("composite").run)).toEqual([
      { key: "release-warn-years", value: "3 years" },
      { key: "release-high-years", value: "5 years" },
      { key: "push-warn-years", value: "3 years" },
      { key: "push-high-years", value: "5 years" },
    ]);
  });

  test("are empty when the run recorded none", () => {
    expect(thresholdRows({ ...golden("composite").run, thresholds: null })).toEqual([]);
  });
});

describe("the gate view prints gate.text as written", () => {
  const cases = recordedCases().filter(({ php }) => php !== null);

  test("the recorded cases with a golden are not empty", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test.each(cases)("$name: gate.text equals lockrot's run gate line", ({ name, report }) => {
    const golden = readContractJson("goldens", `${name}.json`) as { run_gate_line: string };

    expect(report.gate.text).toBe(golden.run_gate_line);
  });
});
