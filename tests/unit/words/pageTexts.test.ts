import { describe, expect, test } from "vitest";

import { copySummary } from "../../../src/domain/copySummary";
import { libyearsPanel } from "../../../src/domain/libyearsPanel";
import { scorePanel } from "../../../src/domain/scorePanel";
import type { Report2 } from "../../../src/model/report2";
import { pageGoldens } from "./recorded";

describe("the page texts equal lockrot's page goldens", () => {
  test("the pinned goldens are not empty", () => {
    const goldens = pageGoldens();

    expect(goldens.length).toBeGreaterThan(0);
    expect(goldens.filter(({ golden }) => golden.panel !== null).length).toBeGreaterThan(0);
  });

  test.each(pageGoldens())("$id: the copy summary", ({ golden, report }) => {
    expect(copySummary(report)).toEqual(golden.copy_summary);
  });

  test.each(pageGoldens())("$id: the Libyears panel", ({ golden, report }) => {
    expect(libyearsPanel(report)).toBe(golden.libyears_panel);
  });

  test.each(pageGoldens().filter(({ golden }) => golden.panel !== null))(
    "$id: the How the score works panel",
    ({ golden, report }) => {
      expect(scorePanel(report.run)).toEqual(golden.panel);
    },
  );
});

const composite = (): Report2 => {
  const found = pageGoldens().find(({ id }) => id === "composite");
  if (found === undefined) throw new Error("no composite golden");
  return structuredClone(found.report);
};

describe("the copy summary at its edges", () => {
  test("names no project and no data date when the report has none", () => {
    const report = { ...composite(), data_date: null, run: { ...composite().run, project: null } };

    expect(copySummary(report)[0]).toBe("lockrot report · lockrot 0.14.0 · score model 1 · target PHP 8.4");
  });

  test("splits production from dev-only and counts the unreached", () => {
    const report = composite();
    report.rot_depth = {
      ...report.rot_depth,
      production: 5,
      development: 2,
      by_reach: { direct: 4, transitive: 2, unreached: 1 },
    };

    expect(copySummary(report)[2]).toMatch(
      /^5 in production, 2 dev-only · 4 required directly, 2 pulled in, 1 unreached · /,
    );
  });

  test("says all dev-only packages are dev-only", () => {
    const report = composite();
    report.rot_depth = { ...report.rot_depth, production: 0, development: 7 };

    expect(copySummary(report)[2]).toMatch(/^All 7 dev-only · /);
  });

  test("marks a partial advisory list as partial", () => {
    const report = composite();
    report.security = { ...report.security, check: "partial" };

    expect(copySummary(report)[2]).toContain(
      "(severity: 1 critical, 4 high, 4 medium, 2 unrated, 9 low) (advisory check incomplete, so the list may be partial) · fix by package:",
    );
  });

  test("reads an unchecked package as an incomplete check", () => {
    const report = composite();
    report.security = {
      ...report.security,
      packages: { ...report.security.packages, unchecked: 1 },
      advisories: { counted: 0, ignored: 0 },
    };

    expect(copySummary(report)[2]).toContain("no advisory found, but the advisory check was incomplete");
  });

  test("prints a fix kind it does not know after the known ones", () => {
    const report = composite();
    report.security = { ...report.security, fixes: { ...report.security.fixes, "new-kind": 3 } };

    expect(copySummary(report)[2]).toContain("1 php floor raise, 3 new-kind · ");
  });

  test("leaves the flag list out when no flag carries a package", () => {
    const report = composite();
    for (const flag of Object.values(report.flags)) flag.carrying = 0;

    expect(copySummary(report)[1]).toBe("7 of 7 packages flagged (100%): 3 graded critical, 2 high, 2 low.");
  });

  test("says there is no package in an empty lock", () => {
    const report = { ...composite(), packages_checked: 0, packages_flagged: 0 };

    expect(copySummary(report)[1]).toBe("No packages in this lock.");
  });
});

describe("the Libyears panel at its edges", () => {
  test("says at least when a package is only bounded from below", () => {
    const report = composite();
    report.libyears = {
      ...report.libyears,
      at_least_count: 1,
      furthest_behind: report.libyears.furthest_behind && {
        ...report.libyears.furthest_behind,
        at_least: true,
      },
    };

    expect(libyearsPanel(report)).toBe(
      "at least 17.85 libyears over 5 packages · furthest behind: symfony/monolog-bridge v2.6.13, at least 10.62",
    );
  });

  test("names no package when none is behind", () => {
    const report = composite();
    report.libyears = { ...report.libyears, furthest_behind: null };

    expect(libyearsPanel(report)).toBe("17.85 libyears over 5 packages");
  });
});

describe("the How the score works panel at its edges", () => {
  const panel = (change: (run: Report2["run"]) => void): string[] => {
    const { run } = composite();
    change(run);
    return scorePanel(run);
  };

  test("shows an unknown rule id with the arithmetic of its kind", () => {
    const lines = panel((run) => {
      run.score_model.rules.push({
        id: "cap",
        stage: 17,
        kind: "divide",
        applies_to: "total",
        why: "caps-the-total",
        doc: "score-cap",
        illustration: null,
        by: 3,
        when: ["dev", "unreached"],
      });
      run.score_rules_used["cap"] = 5;
    });

    expect(lines.at(-2)).toBe("17 cap: ÷ 3 (dev or unreached) · used on 5");
  });

  test("words the covered flags of an unknown cover rule without underscores", () => {
    const lines = panel((run) => {
      run.score_model.rules.push({
        id: "shield",
        stage: 17,
        kind: "cover",
        applies_to: "gate",
        why: "unknown",
        doc: "score-shield",
        illustration: null,
        covers: "listed_and_below",
      });
    });

    expect(lines.at(-2)).toBe("17 shield: covers listed and below");
  });

  test("shows an unknown kind as its id alone, with no count when the report counts none", () => {
    const lines = panel((run) => {
      run.score_model.rules.push({
        id: "mystery",
        stage: 17,
        kind: "spin",
        applies_to: "total",
        why: "unknown",
        doc: "score-mystery",
        illustration: null,
      });
    });

    expect(lines.at(-2)).toBe("17 mystery");
  });

  test("words a zero-verdict reason and a fix kind it does not know from their ids", () => {
    const lines = panel((run) => {
      const paused: unknown = { verdict: "paused", when: "on_hold" };
      run.score_model.zero_verdicts.push(paused as Report2["run"]["score_model"]["zero_verdicts"][number]);
      run.score_model.fix_kinds.push({ id: "wait", ease: 9, doubles: false });
    });

    expect(lines[2]).toBe(
      "score 0: finished (accepted by an allowlist) · unknown (no metadata) · ok · paused (on hold)",
    );
    expect(lines.at(-1)).toMatch(/ · wait$/);
  });

  test("adds the packages-dev halving to the reach exemption when the run walked --dev", () => {
    const lines = panel((run) => {
      run.include_dev = true;
    });

    expect(lines.find((line) => line.includes("reach never halves security"))).toContain(
      "a transitive critical stays 32; packages-dev still halves it",
    );
  });

  test("leaves the previous-release bands out when the model has none", () => {
    const lines = panel((run) => {
      for (const flag of run.score_model.flags) flag.basis = { ...flag.basis, v013_base: null };
    });

    expect(lines[4]).toMatch(/^with corroboration at most 40 /);
  });

  test("takes every figure from the model", () => {
    const lines = panel((run) => {
      run.score_model.id = 7;
      const medium = run.score_model.bands.find(({ verdict }) => verdict === "medium");
      if (medium !== undefined) medium.floor = 9;
    });

    expect(lines[0]).toBe("How the score works · score model 7");
    expect(lines[1]).toContain("medium 9");
  });
});
