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
  advisoryIds,
  noAdvisoryLine,
} from "../../../src/domain/advisories";
import { advisoryCheckMark, advisoryListPartial, noAdvisoryWords } from "../../../src/domain/copySummary";
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

/** The composite with every package taken out: a lock with no finding, after a complete lookup. */
const EMPTY_LOCK: Report2 = {
  ...composite,
  findings: [],
  packages_checked: 0,
  packages_flagged: 0,
  security: {
    ...composite.security,
    check: "complete",
    packages: { vulnerable: 0, unchecked: 0, ignored: 0, clear: 0 },
    advisories: { counted: 0, ignored: 0 },
  },
};

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
  const pairs = advisoryPairs2(vulnerable, filters());
  const groups = advisoryGroups2(pairs);

  it("makes one group per package, packages in the order given", () => {
    expect(groups.map((group) => group.finding.package)).toEqual(vulnerable.map((f) => f.package));
    for (const group of groups) {
      expect(group.pairs.every((pair) => pair.finding === group.finding)).toBe(true);
    }
  });

  it("keeps each package's rows in the order given", () => {
    expect(groups.flatMap((group) => group.pairs)).toEqual(pairs);
  });

  it("names, on a later row, the earlier row of its package with the same CVE", () => {
    const [pair] = pairs;
    if (pair === undefined) throw new Error("no pair");
    const cve = { ...pair, row: { ...pair.row, id: "A-1", cve: "CVE-2026-1" } };
    const again = { ...pair, row: { ...pair.row, id: "B-2", cve: "CVE-2026-1" } };
    const none = { ...pair, row: { ...pair.row, id: "C-3", cve: null } };
    expect(advisoryGroups2([cve, none, again])[0]?.sameAs).toEqual([null, null, "A-1"]);
  });
});

describe("advisoryAnswer2", () => {
  it("counts advisories and packages, by severity in the model's severity order", () => {
    const pairs = advisoryPairs2(vulnerable, filters());
    expect(advisoryAnswer2(composite.run, pairs, pairs.length)).toEqual({
      text: "29 advisories on 5 packages, by severity: 1 critical, 5 high, 12 medium, 2 unrated, 9 low.",
      head: "29 advisories on 5 packages.",
      narrowed: null,
    });
  });

  it("says matching and counts the whole list under a filter", () => {
    const pairs = advisoryPairs2(vulnerable, filters({ fix: ["upgrade"] }));
    expect(advisoryAnswer2(composite.run, pairs, 20)).toEqual({
      text: "1 matching advisory on 1 package, by severity: 1 high.",
      head: "1 matching advisory on 1 package.",
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

  it("names the PHP a fix needs when lockrot says the project's floor does not admit it, then the holders", () => {
    // composite twig/twig: a php floor raise to >=8.1.0 that require.php does not admit, held by symfony/twig-bridge.
    expect(advisoryFixNote(pair.row.fix, composite.run)).toBe(
      "needs PHP >=8.1.0 · held by symfony/twig-bridge",
    );
  });

  it.each([
    [false, true, "needs PHP >=8.5"],
    [true, false, "needs PHP >=8.5"],
    [true, true, null],
    [null, true, null],
    [true, null, null],
    [null, null, null],
  ])("reads admits_target_php %s and admits_project_php %s as %s", (target, project, note) => {
    const fix = {
      ...pair.row.fix,
      php: ">=8.5",
      admits_target_php: target,
      admits_project_php: project,
      held_by: [],
    };
    expect(advisoryFixNote(fix, composite.run)).toBe(note);
  });

  it("says the holders as a Findings row does", () => {
    const hold = (name: string) => ({ ...pair.row.fix.held_by[1], source: "package", package: name });
    const fix = {
      ...pair.row.fix,
      kind: "update",
      admits_target_php: true,
      admits_project_php: true,
      held_by: [hold("a/a"), hold("b/b"), hold("c/c")],
    };
    expect(advisoryFixNote(fix as typeof pair.row.fix, composite.run)).toBe("held by a/a and 2 more");
  });

  it("says what an unrated severity counts as, from the model", () => {
    expect(advisoryCountedAs(composite.run, "unrated")).toBe(", counted as medium");
    expect(advisoryCountedAs(composite.run, "high")).toBeNull();
    expect(advisoryCountedAs(composite.run, "severe")).toBeNull();
  });
});

describe("advisoryIds", () => {
  const LINK = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc";

  it("links the source id the link belongs to, and shows a different CVE id as text", () => {
    expect(advisoryIds({ cve: "CVE-2024-1", id: "GHSA-aaaa-bbbb-cccc", link: LINK })).toEqual([
      { text: "CVE-2024-1", href: null, noCve: false },
      { text: "GHSA-aaaa-bbbb-cccc", href: LINK, noCve: false },
    ]);
  });

  it("links the CVE id when it is the source id", () => {
    expect(advisoryIds({ cve: "CVE-2024-1", id: "CVE-2024-1", link: LINK })).toEqual([
      { text: "CVE-2024-1", href: LINK, noCve: false },
    ]);
  });

  it("shows a CVE id without a link as text, and never builds a URL for it", () => {
    expect(advisoryIds({ cve: "CVE-2024-1", id: "CVE-2024-1", link: null })).toEqual([
      { text: "CVE-2024-1", href: null, noCve: false },
    ]);
  });

  it("links the id when the advisory has no CVE", () => {
    expect(advisoryIds({ cve: null, id: "GHSA-aaaa-bbbb-cccc", link: LINK })).toEqual([
      { text: "no CVE assigned", href: null, noCve: true },
      { text: "GHSA-aaaa-bbbb-cccc", href: LINK, noCve: false },
    ]);
  });

  it("refuses a link that is not http or https", () => {
    expect(advisoryIds({ cve: "CVE-2024-1", id: "CVE-2024-1", link: "javascript:alert(1)" })).toEqual([
      { text: "CVE-2024-1", href: null, noCve: false },
    ]);
  });
});

describe("advisoryCheckMark", () => {
  it("is null after a complete lookup that left no package unchecked", () => {
    expect(advisoryCheckMark(composite)).toBeNull();
  });

  it("says the check did not run when security.check is not_run", () => {
    const skipped: Report2 = { ...composite, security: { ...composite.security, check: "not_run" } };
    expect(advisoryCheckMark(skipped)).toBe("check not run");
  });

  it("says the check is incomplete when it was partial", () => {
    const partial: Report2 = { ...composite, security: { ...composite.security, check: "partial" } };
    expect(advisoryCheckMark(partial)).toBe("check incomplete");
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

  it("hedges a complete lookup beside an unchecked package, as the overview does", () => {
    const report: Report2 = {
      ...composite,
      security: { ...composite.security, packages: { ...composite.security.packages, unchecked: 1 } },
    };

    expect(report.security.check).toBe("complete");
    expect(advisoryListPartial(report)).toBe(true);
    expect(advisoryLookupHedge(report)).toBe("Advisories: check incomplete, so this list may be partial.");
    expect(noAdvisoryLine(report)).toBe("No advisory found (check incomplete).");
  });

  it("never reads a note code: a lock with no finding and a not-checked note reads clean", () => {
    // lockrot sets the check to partial or not_run whenever it writes this note, except on a lock
    // with no finding, where nothing was left unchecked.
    const report: Report2 = { ...EMPTY_LOCK, note_details: [...EMPTY_LOCK.note_details, NOT_CHECKED] };

    expect(advisoryListPartial(report)).toBe(false);
    expect(advisoryLookupHedge(report)).toBeNull();
    expect(noAdvisoryLine(report)).toBe("No advisory affects this lock.");
    expect(noAdvisoryWords(report)).toBe("no security advisory");
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
