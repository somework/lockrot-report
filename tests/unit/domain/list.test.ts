import { describe, expect, it } from "vitest";
import {
  applyFilters2,
  fitFilters2,
  hiddenByFilters2,
  population2,
  railGroups2,
  renderedPackages2,
} from "../../../src/domain/list";
import type { Finding, Report2 } from "../../../src/model/report";
import { EMPTY_FILTERS, INITIAL_STATE, type Filters, type State } from "../../../src/state/types";
import { advisoryRows } from "../../../src/domain/advisoryRows";
import { fixLabel } from "../../../src/domain/pageVocabulary";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const partial = readContractJson("report-2", "D-partial-dagger.json") as Report2;

function only<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined || items.length !== 1) throw new Error(`expected one item, got ${items.length}`);
  return item;
}

/** The composite plus D-partial's cssmin, whose `stale` no term names, under a name of its own. */
const withAccepted: Report2 = {
  ...composite,
  findings: [...composite.findings, { ...only(partial.findings), package: "partial/cssmin", rank: 8 }],
};

function state(overrides: Partial<State> = {}, filters: Partial<Filters> = {}): State {
  return { ...INITIAL_STATE, ...overrides, filters: { ...EMPTY_FILTERS, ...filters } };
}

function names(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.package);
}

const BY_RANK = [
  "twig/twig",
  "symfony/monolog-bridge",
  "symfony/debug",
  "friendsofsymfony/oauth-server-bundle",
  "tubalmartin/cssmin",
  "symfony/yaml",
  "symfony/polyfill-intl-idn",
];

describe("population2", () => {
  it("lists the graded findings on Findings and Blast radius", () => {
    const finished = { ...only(partial.findings), package: "done/pkg", verdict: "finished" as const };
    const report = { ...composite, findings: [...composite.findings, finished] };
    expect(names(population2(report, "findings"))).toEqual(BY_RANK);
    expect(names(population2(report, "radius"))).toEqual(BY_RANK);
    expect(names(population2(report, "packages"))).toEqual([...BY_RANK, "done/pkg"]);
  });

  it("lists the vulnerable findings on Advisories and nothing on Run", () => {
    expect(names(population2(composite, "advisories"))).toEqual([
      "twig/twig",
      "symfony/monolog-bridge",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    expect(population2(composite, "run")).toEqual([]);
  });
});

describe("applyFilters2", () => {
  it("orders by rank whatever order the document lists", () => {
    const reversed = { ...composite, findings: [...composite.findings].reverse() };
    expect(names(applyFilters2(reversed, state(), "findings"))).toEqual(BY_RANK);
  });

  it("keeps any finding that counts one of the selected flags", () => {
    expect(names(applyFilters2(composite, state({}, { flag: ["pinned", "abandoned"] }), "findings"))).toEqual(
      ["symfony/debug", "friendsofsymfony/oauth-server-bundle"],
    );
  });

  it("keeps every finding when the accepted flags are hidden: the toggle filters no package", () => {
    expect(names(applyFilters2(withAccepted, state({}, { accepted: ["hide"] }), "findings"))).toEqual(
      names(applyFilters2(withAccepted, state(), "findings")),
    );
  });

  it("keeps the findings no line of composer.json names for the unnamed scope", () => {
    expect(names(applyFilters2(composite, state({}, { scope: ["unnamed"] }), "findings"))).toEqual([
      "symfony/polyfill-intl-idn",
    ]);
  });

  it("keeps a finding with an advisory row of a selected severity or fix kind", () => {
    expect(names(applyFilters2(composite, state({}, { sev: ["critical"] }), "findings"))).toEqual([
      "twig/twig",
    ]);
    expect(names(applyFilters2(composite, state({}, { fix: ["update", "upgrade"] }), "findings"))).toEqual([
      "symfony/monolog-bridge",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
  });

  it("filters by verdict, the gate and the search box", () => {
    expect(names(applyFilters2(composite, state({}, { verdict: ["low"] }), "findings"))).toEqual([
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    expect(applyFilters2(composite, state({}, { gate: ["fails"] }), "findings")).toHaveLength(5);
    expect(names(applyFilters2(composite, state({ q: "flag:stale score:>=18" }), "findings"))).toEqual([
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
    ]);
  });

  it("sorts All packages by score, highest first, ties in rank order", () => {
    const sorted = applyFilters2(
      composite,
      state({ view: "packages", sort: "score", sortDesc: true }),
      "packages",
    );
    expect(names(sorted)).toEqual([
      "symfony/monolog-bridge",
      "symfony/debug",
      "twig/twig",
      "friendsofsymfony/oauth-server-bundle",
      "tubalmartin/cssmin",
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
  });

  it("sorts All packages by rank for the verdict column", () => {
    const reversed = { ...composite, findings: [...composite.findings].reverse() };
    expect(names(applyFilters2(reversed, state({ sort: "verdict" }), "packages"))).toEqual(BY_RANK);
  });

  it("sorts by installed age, unmeasured last, and by reach, an unreached package deepest", () => {
    expect(names(applyFilters2(composite, state({ sort: "age", sortDesc: true }), "packages"))).toEqual([
      "symfony/monolog-bridge",
      "tubalmartin/cssmin",
      "symfony/debug",
      "symfony/yaml",
      "twig/twig",
      "friendsofsymfony/oauth-server-bundle",
      "symfony/polyfill-intl-idn",
    ]);
    const unreached = readContractJson("report-2", "unreached.json") as Report2;
    const withUnreached = {
      ...composite,
      findings: [...composite.findings, { ...only(unreached.findings), rank: 8 }],
    };
    expect(names(applyFilters2(withUnreached, state({ sort: "reached" }), "packages"))).toEqual([
      ...BY_RANK.filter((pkg) => pkg !== "symfony/polyfill-intl-idn"),
      "symfony/polyfill-intl-idn",
      "fgrosse/phpasn1",
    ]);
  });
});

describe("hiddenByFilters2", () => {
  it("is true only for a package the tab lists and the filters keep off", () => {
    const hiding = state({ q: "no-such-package" });
    expect(hiddenByFilters2(composite, hiding, "twig/twig")).toBe(true);
    expect(hiddenByFilters2(composite, state(), "twig/twig")).toBe(false);
    expect(hiddenByFilters2(composite, hiding, "not/listed")).toBe(false);
  });
});

describe("railGroups2", () => {
  it("offers each graded verdict with a package under the title Grade, in run.graded_verdicts order", () => {
    const grade = railGroups2(composite, state()).find((group) => group.group === "verdict");
    const graded = (id: string): number =>
      population2(composite, "findings").filter((f) => f.verdict === id).length;
    const listed = composite.run.graded_verdicts.filter((id) => graded(id) > 0);

    expect(grade?.title).toBe("Grade");
    expect(grade?.rows.map((row) => [row.key, row.label, row.count, row.on])).toEqual(
      listed.map((id) => [id, id, graded(id), false]),
    );
    expect(listed.length).toBeGreaterThan(1);
  });

  it("counts the union within the Grade group, and keeps a pressed grade", () => {
    const grade = railGroups2(composite, state({}, { verdict: ["critical"] })).find(
      (group) => group.group === "verdict",
    );
    const graded = (ids: readonly string[]): number =>
      population2(composite, "findings").filter((f) => ids.includes(f.verdict)).length;

    expect(grade?.rows.find((row) => row.key === "critical")).toMatchObject({
      count: graded(["critical"]),
      on: true,
    });
    expect(grade?.rows.find((row) => row.key === "high")).toMatchObject({
      count: graded(["critical", "high"]),
      on: false,
    });
  });

  it("counts each counted flag in run.flag_ids order, leaving out a flag nothing carries", () => {
    const flag = railGroups2(composite, state()).find((group) => group.group === "flag");
    expect(flag?.rows.map((row) => [row.key, row.count])).toEqual([
      ["abandoned", 1],
      ["pinned", 1],
      ["left-behind", 1],
      ["old-promise", 3],
      ["stale", 2],
      ["vulnerable", 4],
    ]);
  });

  it("offers each advisory severity in score_model order, counting the packages with one", () => {
    const sev = railGroups2(composite, state()).find((group) => group.group === "sev");
    const withSeverity = (id: string): number =>
      population2(composite, "findings").filter((f) => advisoryRows(f).some((row) => row.severity === id))
        .length;
    const listed = composite.run.score_model.severities
      .map(({ id }) => id)
      .filter((id) => withSeverity(id) > 0);

    expect(sev?.title).toBe("Severity");
    expect(sev?.rows.map((row) => [row.key, row.label, row.count])).toEqual(
      listed.map((id) => [id, id, withSeverity(id)]),
    );
  });

  it("offers each fix kind in ease order under its label, counting the packages an advisory of it holds", () => {
    const fix = railGroups2(composite, state()).find((group) => group.group === "fix");
    const withFix = (id: string): number =>
      population2(composite, "findings").filter((f) => advisoryRows(f).some((row) => row.fix.kind === id))
        .length;
    const listed = [...composite.run.score_model.fix_kinds]
      .sort((a, b) => a.ease - b.ease)
      .map(({ id }) => id)
      .filter((id) => withFix(id) > 0);

    expect(fix?.title).toBe("Fix");
    expect(fix?.rows.map((row) => [row.key, row.label, row.count])).toEqual(
      listed.map((id) => [id, fixLabel(id), withFix(id)]),
    );
    expect(listed.length).toBeGreaterThan(0);
  });

  it("counts the union within the flag group", () => {
    const flag = railGroups2(composite, state({}, { flag: ["stale"] })).find(
      (group) => group.group === "flag",
    );
    expect(flag?.rows.find((row) => row.key === "abandoned")).toEqual({
      key: "abandoned",
      label: "abandoned",
      count: 3,
      on: false,
    });
  });

  it("offers the accepted toggle only where an accepted flag exists, counting the rows it changes", () => {
    expect(railGroups2(composite, state()).map((group) => group.group)).toEqual([
      "gate",
      "verdict",
      "flag",
      "sev",
      "fix",
      "scope",
    ]);
    const accepted = railGroups2(withAccepted, state()).find((group) => group.group === "accepted");
    expect(accepted?.rows).toEqual([{ key: "hide", label: "Hide accepted flags", count: 1, on: false }]);
    const on = railGroups2(withAccepted, state({}, { accepted: ["hide"] })).find(
      (group) => group.group === "accepted",
    );
    expect(on?.rows).toEqual([{ key: "hide", label: "Hide accepted flags", count: 1, on: true }]);
  });

  it("counts only the listed rows under the accepted toggle", () => {
    const accepted = railGroups2(withAccepted, state({}, { flag: ["vulnerable"] })).find(
      (group) => group.group === "accepted",
    );
    expect(accepted?.rows.map((row) => row.count)).toEqual([0]);
  });

  it("offers the not in composer.json chip in the scope group", () => {
    const scope = railGroups2(composite, state()).find((group) => group.group === "scope");
    expect(scope?.rows.find((row) => row.key === "unnamed")).toEqual({
      key: "unnamed",
      label: "not in composer.json",
      count: 1,
      on: false,
    });
  });
});

describe("fitFilters2", () => {
  it("opens an old prio= as verdict= and an old verdict=<flag> as flag=", () => {
    const fitted = fitFilters2(composite, {
      ...EMPTY_FILTERS,
      prio: ["high"],
      verdict: ["left-behind", "critical"],
    });
    expect(fitted).toEqual({ ...EMPTY_FILTERS, verdict: ["critical", "high"], flag: ["left-behind"] });
  });

  it("returns the same filters when nothing needs a change", () => {
    const filters = { ...EMPTY_FILTERS, verdict: ["high"], flag: ["stale"], gate: ["fails"] };
    expect(fitFilters2(composite, filters)).toBe(filters);
  });

  it("keeps only the hide key of the accepted toggle", () => {
    expect(fitFilters2(composite, { ...EMPTY_FILTERS, accepted: ["with", "hide"] })).toEqual({
      ...EMPTY_FILTERS,
      accepted: ["hide"],
    });
  });

  it("drops a gate filter on a run that nothing fails", () => {
    const passing = { ...composite, gate: { ...composite.gate, fails: false } };
    expect(fitFilters2(passing, { ...EMPTY_FILTERS, gate: ["fails"] })).toEqual(EMPTY_FILTERS);
  });
});

describe("renderedPackages2", () => {
  it("walks the rows of every tab with a list", () => {
    expect(renderedPackages2(composite, state({}, { verdict: ["low"] }), "findings")).toEqual([
      "symfony/yaml",
      "symfony/polyfill-intl-idn",
    ]);
    expect(renderedPackages2(composite, state(), "packages")).toEqual(BY_RANK);
    expect(renderedPackages2(composite, state(), "advisories")).toEqual([
      "symfony/polyfill-intl-idn",
      ...Array<string>(3).fill("symfony/yaml"),
      "symfony/monolog-bridge",
      ...Array<string>(15).fill("twig/twig"),
    ]);
    expect(renderedPackages2(composite, state(), "radius")).toEqual(["guzzlehttp/guzzle"]);
  });
});

describe("the Since filter (M19)", () => {
  it("keeps a state only for a finding the baseline records, never one with no baseline entry", () => {
    const baselined = readContractJson("report-2", "B-baselined-dagger.json") as Report2;
    const recorded = only(baselined.findings);
    const unrecorded = { ...recorded, package: "acme/unrecorded", rank: recorded.rank + 1, baseline: null };
    const report: Report2 = { ...baselined, findings: [recorded, unrecorded] };

    for (const since of ["new", "worsened", "known"]) {
      const kept = names(applyFilters2(report, state({}, { since: [since] }), "findings"));
      expect(kept, since).toEqual(since === recorded.baseline?.status ? [recorded.package] : []);
    }
  });
});
