import { describe, expect, test } from "vitest";

import { ageLine } from "../../../src/domain/ageLine";
import { baselineSuffix } from "../../../src/domain/baselineSuffix";
import { branchesLine } from "../../../src/domain/branchesLine";
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

    expect(ageLine(finding, metadata && { ...metadata, branches: rows })).toMatch(
      /^5\.x last released v5\.4\.45 /,
    );
  });
});

describe("the installed clause of the Release branches line", () => {
  test("a package on a branch is named by it when no row is marked installed", () => {
    const { finding, metadata } = modelCase("B");
    const unmarked = metadata && {
      ...metadata,
      branches: metadata.branches.map((row) => ({ ...row, installed: false })),
    };

    expect(branchesLine(finding, unmarked)).toMatch(
      /^Your branch, 2\.x, had its last release, v2\.8\.52, 6\.9 years ago; /,
    );
  });

  describe("a higher branch's php clause reads the highest tag, not the newest dated release", () => {
    // 10.x is higher than the installed 9.x; its lowest-tag fields say the opposite of what each test sets.
    const lineWith = (highest: Partial<ReleaseBranch>): string | null => {
      const { finding, metadata } = modelCase("partial");
      const branches = (metadata?.branches ?? []).map((row) =>
        row.branch === "10.x"
          ? {
              ...row,
              php: "^9.9",
              admits_target_php: true,
              admits_project_php: true,
              misses_project_php: null,
              ...highest,
            }
          : row,
      );
      return branchesLine(finding, metadata && { ...metadata, branches });
    };

    test("prints highest_php and the target answer of highest_php", () => {
      expect(lineWith({ highest_php: "^7.1.3", highest_admits_target_php: false })).toContain(
        "10.x released v10.50.3 0.1 years ago and needs php ^7.1.3, which your target does not run;",
      );
    });

    test("prints the project answers of highest_php when the target admits it", () => {
      const above = lineWith({
        highest_php: "^8.1",
        highest_admits_target_php: true,
        highest_admits_project_php: false,
        highest_misses_project_php: "needs_newer",
      });
      const stops = lineWith({
        highest_php: "^8.1",
        highest_admits_target_php: true,
        highest_admits_project_php: false,
        highest_misses_project_php: "stops_before",
      });

      expect([above, stops].map((line) => /needs php \^8\.1(, [^;]*);/.exec(line ?? "")?.[1])).toEqual([
        ", above your require.php",
        ", which your require.php does not admit",
      ]);
    });

    test("leaves the php clause out when highest_php is null", () => {
      expect(lineWith({ highest_php: null })).toContain("10.x released v10.50.3 0.1 years ago;");
    });
  });

  test("a snapshot, which has no branch, is named as one", () => {
    const { finding, metadata } = modelCase("G");

    expect(branchesLine(finding, metadata)).toMatch(/^A branch snapshot, dev-master, is installed; /);
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
