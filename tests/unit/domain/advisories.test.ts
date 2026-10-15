import { describe, expect, it } from "vitest";
import {
  advisoryAnswer2,
  advisoryBand,
  advisoryFixWords,
  advisoryGroups2,
  advisoryLookupHedge,
  advisoryPairs2,
  advisoryRowLabel2,
  advisoryCountedAs,
  advisoryFixNote,
  noAdvisoryLine,
} from "../../../src/domain/advisories";
import { advisoryListPartial } from "../../../src/domain/copySummary";
import type { Finding, Report2 } from "../../../src/model/report";
import { EMPTY_FILTERS, type Filters } from "../../../src/state/types";
import { readContractJson } from "../words/recorded";

const composite = readContractJson("report-2", "composite.json") as Report2;
const vulnerable = composite.findings.filter((f) => f.security.status === "vulnerable");

/** The note a run writes when it asked no repository for advisories. */
const NOT_CHECKED = {
  code: "advisories_not_checked",
  text: "advisories were not checked",
  docs_url: null,
  sets_network_failures: false,
  data: { reason: "offline", composer_repositories_checked: 0 },
} as unknown as Report2["note_details"][number];

const filters = (overrides: Partial<Filters> = {}): Filters => ({ ...EMPTY_FILTERS, ...overrides });

describe("advisoryPairs2", () => {
  it("lists every S9 row of each finding, findings in the order given", () => {
    const pairs = advisoryPairs2(vulnerable, filters());
    expect(pairs).toHaveLength(composite.security.advisories.counted);
    expect([...new Set(pairs.map((pair) => pair.finding.package))]).toEqual(vulnerable.map((f) => f.package));
  });

  it("keeps only the rows the sev and fix rail buttons select", () => {
    const low = advisoryPairs2(vulnerable, filters({ sev: ["low"] }));
    expect(low.length).toBe(composite.security.severities.low);
    expect(low.every((pair) => pair.row.severity === "low")).toBe(true);
    const upgrade = advisoryPairs2(vulnerable, filters({ fix: ["upgrade"] }));
    expect(upgrade.every((pair) => pair.row.fix.kind === "upgrade")).toBe(true);
    expect(upgrade.map((pair) => pair.finding.package)).toEqual(["symfony/monolog-bridge"]);
  });
});

describe("advisoryGroups2", () => {
  const groups = advisoryGroups2(composite.run, advisoryPairs2(vulnerable, filters()));

  it("groups on fix.kind and fix.to_branch, in the model's fix_kinds order", () => {
    const kinds = composite.run.score_model.fix_kinds.map(({ id }) => id);
    const order = groups.map((group) => kinds.indexOf(group.kind));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const group of groups) {
      expect(group.pairs.every((pair) => pair.row.fix.kind === group.kind)).toBe(true);
      expect(group.pairs.every((pair) => pair.row.fix.to_branch === group.toBranch)).toBe(true);
    }
  });

  it("names a group by its fix label and branch", () => {
    expect(groups.map((group) => group.heading)).toEqual([
      "composer update · 1.x",
      "composer update · 5.x",
      "upgrade · 5.x",
      "php floor raise · 3.x",
    ]);
  });

  it("keeps each finding's rows in the order given inside a group", () => {
    const update5 = groups.find((group) => group.heading === "composer update · 5.x");
    expect(update5?.pairs.every((pair) => pair.finding.package === "symfony/yaml")).toBe(true);
  });

  it("sorts an unknown fix kind after the model's kinds, its id as written", () => {
    const [pair] = advisoryPairs2(vulnerable, filters());
    if (pair === undefined) throw new Error("no pair");
    const odd = { ...pair, row: { ...pair.row, fix: { ...pair.row.fix, kind: "rebuild", to_branch: null } } };
    const mixed = advisoryGroups2(composite.run, [odd, pair]);
    expect(mixed.map((group) => group.heading)).toEqual(["php floor raise · 3.x", "rebuild"]);
  });
});

describe("advisoryAnswer2", () => {
  it("counts advisories and packages, by severity in the model's severity order", () => {
    const pairs = advisoryPairs2(vulnerable, filters());
    expect(advisoryAnswer2(composite.run, pairs, pairs.length)).toEqual({
      text: "20 advisories on 4 packages, by severity: 1 critical, 4 high, 4 medium, 2 unrated, 9 low.",
      narrowed: null,
    });
  });

  it("says matching and counts the whole list under a filter", () => {
    const pairs = advisoryPairs2(vulnerable, filters({ fix: ["upgrade"] }));
    expect(advisoryAnswer2(composite.run, pairs, 20)).toEqual({
      text: "1 matching advisory on 1 package, by severity: 1 high.",
      narrowed: "Only advisories that match the filter are counted; without it there are 20.",
    });
  });
});

describe("row words", () => {
  const [pair] = advisoryPairs2(vulnerable, filters());
  if (pair === undefined) throw new Error("no pair");

  it("words a fix by its version and where it is released", () => {
    expect(advisoryFixWords(pair.row.fix, pair.finding)).toEqual({ version: "v3.26.0", where: "on 3.x" });
    const onBranch = { ...pair.row.fix, on_installed_branch: true };
    expect(advisoryFixWords(onBranch, pair.finding)).toEqual({ version: "v3.26.0", where: "on your branch" });
  });

  it("words a fix with no version by its kind and reason", () => {
    const none = { ...pair.row.fix, kind: "none", version: null, reason: "no_release_outside_range" };
    expect(advisoryFixWords(none, pair.finding)).toEqual({
      version: null,
      where: "no fix: no release outside range",
    });
  });

  it("says what PHP a fix needs and what holds it", () => {
    // composite twig/twig: a php floor raise to >=8.1.0, held by composer.json and symfony/twig-bridge.
    expect(advisoryFixNote(pair.row.fix)).toBe(
      "needs PHP >=8.1.0 · held by composer.json and symfony/twig-bridge",
    );
    expect(advisoryFixNote({ ...pair.row.fix, kind: "update", held_by: [] })).toBeNull();
  });

  it("says what an unrated severity counts as, from the model", () => {
    expect(advisoryCountedAs(composite.run, "unrated")).toBe(", counted as medium");
    expect(advisoryCountedAs(composite.run, "high")).toBeNull();
    expect(advisoryCountedAs(composite.run, "severe")).toBeNull();
  });
});

describe("the lookup words", () => {
  it("hedges nothing after a complete lookup", () => {
    expect(advisoryLookupHedge(composite)).toBeNull();
    expect(noAdvisoryLine(composite)).toBe("No advisory affects this lock.");
  });

  it("hedges a partial or skipped lookup from root security.check", () => {
    const partial: Report2 = { ...composite, security: { ...composite.security, check: "partial" } };
    expect(advisoryLookupHedge(partial)).toBe("Advisories: lookup partial, so this list may be partial.");
    expect(noAdvisoryLine(partial)).toBe("No advisory found (lookup partial).");
    const skipped: Report2 = { ...composite, security: { ...composite.security, check: "not_run" } };
    expect(advisoryLookupHedge(skipped)).toBe("Advisories: not checked, so this list may be partial.");
    expect(noAdvisoryLine(skipped)).toBe("No advisory found (not checked).");
  });

  it.each([
    [
      "an unchecked package",
      {
        ...composite,
        security: { ...composite.security, packages: { ...composite.security.packages, unchecked: 1 } },
      },
    ],
    [
      "an advisories_not_checked note",
      { ...composite, note_details: [...composite.note_details, NOT_CHECKED] },
    ],
  ])("hedges a complete lookup beside %s, as the overview does", (_, report: Report2) => {
    expect(report.security.check).toBe("complete");
    expect(advisoryListPartial(report)).toBe(true);
    expect(advisoryLookupHedge(report)).toBe("Advisories: check incomplete, so this list may be partial.");
    expect(noAdvisoryLine(report)).toBe("No advisory found (check incomplete).");
  });

  it("finds no rows for a finding without an S9 signal", () => {
    const clear = composite.findings.find((f) => f.security.status !== "vulnerable") as Finding;
    expect(advisoryPairs2([clear], filters())).toEqual([]);
  });
});

describe("row lookups", () => {
  it("tones a severity by its band in the model", () => {
    expect(advisoryBand(composite.run, "unrated")).toBe("medium");
    expect(advisoryBand(composite.run, "severe")).toBeNull();
  });

  it("names a row by package, severity and CVE", () => {
    const [pair] = advisoryPairs2(vulnerable, filters());
    if (pair === undefined) throw new Error("no pair");
    expect(advisoryRowLabel2(pair)).toBe("twig/twig, critical, CVE-2026-46633");
  });
});
