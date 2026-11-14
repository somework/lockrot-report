import { describe, expect, test } from "vitest";

import { ageRows } from "../../../src/domain/ageRows";
import { baselineSuffix } from "../../../src/domain/baselineSuffix";
import { branchesLead, branchTimeline, laneWords } from "../../../src/domain/branchTimeline";
import { feedsLine } from "../../../src/domain/feedsLine";
import type { Finding, FindingBaseline, ReleaseBranch } from "../../../src/model/report";
import { modelCases } from "./recorded";

const modelCase = (name: string) => {
  const found = modelCases().find((model) => model.name === name);
  if (found === undefined) throw new Error(`no case ${name}`);
  return found;
};

describe("a feed of a finding whose origin is unknown", () => {
  test("is not blamed on a Composer repository", () => {
    const { finding } = modelCase("B");
    const feeds = finding.security.feeds.map((feed) => ({
      ...feed,
      answer: "not_asked",
      records: null,
      reason: "not_from_composer_repository",
    }));
    const unknownOrigin = {
      ...finding,
      origin: { ...finding.origin, kind: "unknown" },
      security: { ...finding.security, feeds },
    } as Finding;

    expect(feedsLine(unknownOrigin)).toBe("packagist.org (not asked (origin unknown))");
  });
});

describe("the branch of an alias snapshot", () => {
  test("is the row whose newest dated release is the branch's last release, whatever its newest tag", () => {
    const { finding, metadata } = modelCase("snapshot-alias");
    const rows = (metadata?.branches ?? []).map((row) => ({ ...row, highest: `${row.highest}-undated` }));

    expect(ageRows(finding, metadata && { ...metadata, branches: rows }).map((r) => r.label)).toContain(
      "5.x last",
    );
  });
});

describe("the lead of Release branches", () => {
  test("names the package's branch when no row is marked installed", () => {
    const { finding, metadata } = modelCase("B");
    const unmarked = metadata && {
      ...metadata,
      branches: metadata.branches.map((row) => ({ ...row, installed: false })),
    };

    expect(branchesLead(finding, unmarked)[0]).toBe(
      "Your branch, 2.x, had its last release, v2.8.52, 6.9 years ago.",
    );
  });

  test("names a snapshot, which has no branch, as one", () => {
    const { finding, metadata } = modelCase("G");

    expect(branchesLead(finding, metadata)[0]).toBe("A branch snapshot, dev-master, is installed.");
  });

  test("calls S8's branch within reach the newest releasing one, not the highest (S9-4)", () => {
    const { finding, metadata } = modelCase("installed-php-halved");

    expect(branchesLead(finding, metadata)[1]).toBe(
      "The newest releasing branch within reach, 4.x, released 4.9.1 2.2 years ago.",
    );
  });
});

describe("a higher branch dated by a commit its tags share (R9-42, SIGNALS-10 Q1)", () => {
  const lane = (name: string, branch: string, edit: (row: ReleaseBranch) => void = () => undefined) => {
    const { finding, run, metadata } = structuredClone(modelCase(name));
    const row = metadata?.branches.find((r) => r.branch === branch);
    if (row === undefined) throw new Error(`${name} has no ${branch} row`);
    edit(row);
    const found = branchTimeline(finding, metadata, run)?.lanes.find((l) => l.branch === branch);
    if (found === undefined) throw new Error(`${name} draws no ${branch} lane`);
    return laneWords(found);
  };

  test("G145: the lead says the move's branch released at most that long ago (pagerfanta)", () => {
    const { finding, metadata } = modelCase("pagerfanta");

    expect(branchesLead(finding, metadata)[1]).toBe(
      "The move's branch, 4.x, released v4.9.0 at most 1.6 years ago.",
    );
  });

  test("G146: the bar of a row with no date of its highest tag reads at most (pagerfanta)", () => {
    expect(lane("pagerfanta", "4.x")).toBe("v4.9.0, released at most 1.6 years ago");
  });

  test("G146: a bar of 0 years keeps less than three weeks ago", () => {
    expect(
      lane("pagerfanta", "4.x", (row) => {
        row.released_years = 0;
      }),
    ).toBe("v4.9.0, released less than three weeks ago");
  });

  test("G145: the lead drops at most at 0 years, as G146 does (RENDER-10C Q1)", () => {
    const { finding, metadata } = structuredClone(modelCase("pagerfanta"));
    const s8 = finding.signals.find((s) => s.id === "S8")?.data as
      { reachable_years: number | null; newest_years: number } | undefined;
    if (s8 === undefined) throw new Error("pagerfanta has no S8");
    s8.newest_years = 0;
    if (s8.reachable_years !== null) s8.reachable_years = 0;

    expect(branchesLead(finding, metadata)[1]).toBe(
      "The move's branch, 4.x, released v4.9.0 less than three weeks ago.",
    );
  });

  test("G146: the installed row reads no bound, whatever its highest tag", () => {
    const { finding, run, metadata } = structuredClone(modelCase("pagerfanta"));
    const installed = metadata?.branches.find((r) => r.installed);
    if (installed === undefined) throw new Error("pagerfanta has no installed row");
    installed.highest_released = null;
    const lane = branchTimeline(finding, metadata, run)?.lanes.find((l) => l.installed);
    if (lane === undefined) throw new Error("pagerfanta draws no installed lane");

    expect(laneWords(lane)).not.toContain("at most");
  });

  test("G146: a row whose highest tag has its own date reads no bound", () => {
    expect(
      lane("pagerfanta", "4.x", (row) => {
        row.highest_released = "2025-03-08T00:00:00+00:00";
      }),
    ).toBe("v4.9.0, released 1.6 years ago");
  });
});

describe("a timeline row's php words read the highest tag, not the newest dated release (G147)", () => {
  // 10.x is higher than the installed 9.x; its lowest-tag fields say the opposite of what each test sets.
  const wordsWith = (highest: Partial<ReleaseBranch>): string | null => {
    const { finding, run, metadata } = modelCase("partial");
    const branches = (metadata?.branches ?? []).map((row) =>
      row.branch === "10.x"
        ? { ...row, admits_target_php: true, admits_project_php: true, misses_project_php: null, ...highest }
        : row,
    );
    const lanes = branchTimeline(finding, metadata && { ...metadata, branches }, run)?.lanes ?? [];
    return lanes.find((lane) => lane.branch === "10.x")?.phpWords ?? null;
  };

  test("the target's answer comes first", () => {
    expect(wordsWith({ highest_admits_target_php: false, highest_admits_project_php: false })).toBe(
      "your target does not run it",
    );
  });

  test("a require.php below the release's floor reads above it, any other miss does not admit it", () => {
    const above = wordsWith({
      highest_admits_target_php: true,
      highest_admits_project_php: false,
      highest_misses_project_php: "needs_newer",
    });
    const stops = wordsWith({
      highest_admits_target_php: true,
      highest_admits_project_php: false,
      highest_misses_project_php: "stops_before",
    });

    expect([above, stops]).toEqual(["above your require.php", "your require.php does not admit it"]);
  });

  test("an admitted release has no words", () => {
    expect(wordsWith({ highest_admits_target_php: true, highest_admits_project_php: true })).toBeNull();
  });
});

// The expected strings are the productions of lockrot's spec §6.4.
describe("the baseline suffix", () => {
  const withBaseline = (name: string, baseline: FindingBaseline) => {
    const { finding, run } = modelCase(name);
    return baselineSuffix({ ...finding, baseline }, run);
  };
  const recorded = {
    lead: null,
    flags: null,
    advisory_count: 1,
    first_seen: "2026-03-02",
    target_php: "8.4",
    fix_model: 1,
  };
  const nothingNow = { known: 0, new: 0, re_rated: 0, fix_lost: 0 };

  test("a finding the baseline has no entry for is a new package", () => {
    expect(
      withBaseline("A", { status: "new", recorded: null, advisories_now: nothingNow, worsened_by: [] }),
    ).toBe("(baseline: new package)");
  });

  test("an entry that nothing worsens is known, and a lone known advisory is singular", () => {
    const entry = { status: "known" as const, recorded, worsened_by: [] };

    expect([
      withBaseline("A", { ...entry, advisories_now: nothingNow }),
      withBaseline("A", { ...entry, advisories_now: { ...nothingNow, known: 1 } }),
    ]).toEqual(["(baseline: known)", "(baseline: 1 advisory known)"]);
  });

  test("a flag that is new is named before the new advisories", () => {
    expect(
      withBaseline("A", {
        status: "worsened",
        recorded,
        advisories_now: { ...nothingNow, new: 2 },
        worsened_by: [{ kind: "flag", id: "stale", why: "new", recorded: null, now: null }],
      }),
    ).toBe("(baseline: stale new; 2 new advisories)");
  });

  test("an advisory whose fix is lost says so, by its CVE or else its id", () => {
    const lost = (id: string) =>
      withBaseline("A", {
        status: "worsened",
        recorded,
        advisories_now: { ...nothingNow, fix_lost: 1 },
        worsened_by: [
          {
            kind: "advisory",
            id,
            why: "fix_lost",
            recorded: { severity: "high", fix_kind: "raise-php" },
            now: { severity: "high", fix_kind: "blocked" },
          },
        ],
      });

    expect([lost("PKSA-h8hf-ytnd-5t9q"), lost("unknown-id")]).toEqual([
      "(baseline: CVE-2026-46633 fix lost: raise-php → blocked)",
      "(baseline: unknown-id fix lost: raise-php → blocked)",
    ]);
  });

  test("a re-rate that also crosses the fix boundary says so only when both runs compare fixes", () => {
    const reRated = (recordedRun: Partial<typeof recorded>) =>
      withBaseline("A", {
        status: "worsened",
        recorded: { ...recorded, ...recordedRun },
        advisories_now: { ...nothingNow, re_rated: 1 },
        worsened_by: [
          {
            kind: "advisory",
            id: "PKSA-8zx5-v2nz-58pb",
            why: "re_rated",
            recorded: { severity: "medium", fix_kind: "raise-php" },
            now: { severity: "high", fix_kind: "none" },
          },
        ],
      });
    const name = "CVE-2026-49981";

    expect([reRated({}), reRated({ target_php: "8.3" }), reRated({ fix_model: 2 })]).toEqual([
      `(baseline: ${name} re-rated medium → high, fix lost: raise-php → none)`,
      `(baseline: ${name} re-rated medium → high)`,
      `(baseline: ${name} re-rated medium → high)`,
    ]);
  });

  test("a finding with no baseline, and a finding with no grade, have no suffix", () => {
    const { finding, run } = modelCase("A");
    const zero = modelCase("psr-log");

    expect([
      baselineSuffix({ ...finding, baseline: null }, run),
      baselineSuffix({ ...zero.finding, baseline: finding.baseline }, zero.run),
    ]).toEqual([null, null]);
  });
});
