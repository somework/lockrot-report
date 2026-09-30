import { describe, expect, it } from "vitest";
import type { Model, PackageDetails } from "../../../src/model/types";
import {
  noteRepositories,
  repositoryGroups,
  activityTally,
  cacheAge,
  cacheNullReason,
  failOnThreshold,
  nullReason,
  replacementInWordsOnly,
  sameScalePairs,
  spanPhrase,
  thresholdGroups,
  utcMinute,
} from "../../../src/domain/run";
import { makeFinding, makeModel, makeSignal } from "./fixtures";

const HOUR = 3600 * 1000;

function withActivity(fromCache: readonly boolean[]): ReadonlyMap<string, PackageDetails> {
  return new Map(
    fromCache.map((cached, index) => [
      `v/p${index}`,
      {
        metadata: null,
        lock: null,
        repositoryLink: null,
        activity: {
          forge: "GitHub",
          repository: `v/p${index}`,
          archived: false,
          pushedAt: null,
          fetchedAt: null,
          fromCache: cached,
        },
      },
    ]),
  );
}

describe("utcMinute", () => {
  it("writes an instant to the minute in UTC, whatever its offset", () => {
    expect(utcMinute("2026-09-24T00:00:00+00:00")).toBe("2026-09-24 00:00 UTC");
    expect(utcMinute("2026-09-24T02:30:59+02:00")).toBe("2026-09-24 00:30 UTC");
  });

  it("returns a string that does not parse as given", () => {
    expect(utcMinute("yesterday")).toBe("yesterday");
  });
});

describe("spanPhrase", () => {
  it("says hours under two days, days under two months, then months or years", () => {
    expect(spanPhrase(0)).toBe("less than an hour");
    expect(spanPhrase(HOUR)).toBe("1 hour");
    expect(spanPhrase(23.66 * HOUR)).toBe("24 hours");
    expect(spanPhrase(72 * HOUR)).toBe("3 days");
    expect(spanPhrase(400 * 24 * HOUR)).toBe("1.1 years");
  });

  it("never reads a negative span as one", () => {
    expect(spanPhrase(-5 * HOUR)).toBe("less than an hour");
  });
});

describe("cacheAge", () => {
  it("measures the oldest cached activity against generated_at", () => {
    const base = makeModel([]);
    const report = {
      ...base.report,
      generatedAt: "2026-09-21T18:57:03+00:00",
      activityCacheOldestAt: "2026-09-20T19:17:28+00:00",
    };
    expect(cacheAge(report)).toEqual({ oldest: "2026-09-20T19:17:28+00:00", before: "24 hours" });
  });

  it("is null without a date", () => {
    expect(cacheAge(makeModel([]).report)).toBeNull();
  });
});

describe("activityTally and cacheNullReason", () => {
  it("counts the activity blocks and those from the cache", () => {
    expect(activityTally(withActivity([true, false, false]))).toEqual({ total: 3, fromCache: 1 });
  });

  it("says every answer was fetched during the run only when none came from the cache", () => {
    const base = makeModel([]);
    const fresh: Model = { ...base, details: withActivity([false, false]) };
    expect(cacheNullReason(fresh)).toBe(
      "none — all 2 repository answers in this file were fetched during the run",
    );
    const cached: Model = { ...base, details: withActivity([true, false]) };
    expect(cacheNullReason(cached)).toBe(
      "left empty by this run, though 1 of the 2 repository answers here came from the cache",
    );
  });

  // Eval: a bare "not recorded" gave no reason; every null now says why from what the file holds.
  it("says why the date is empty when the file explains no package, or none carries activity", () => {
    const base = makeModel([]);
    expect(cacheNullReason(base)).toBe("left empty by this run — this file explains no package");
    const noActivity: Model = {
      ...base,
      details: new Map([["v/p", { metadata: null, lock: null, repositoryLink: null, activity: null }]]),
    };
    expect(cacheNullReason(noActivity)).toBe("none — no package in this file carries repository activity");
  });

  it("says the key is absent when the document leaves it out", () => {
    const base = makeModel([]);
    const absent: Model = {
      ...base,
      details: withActivity([false]),
      report: { ...base.report, absent: ["activity_cache_oldest_at"] },
    };
    expect(cacheNullReason(absent)).toBe("not in this document");
  });
});

describe("nullReason", () => {
  it("tells an absent key from one written as null", () => {
    const base = makeModel([]);
    expect(nullReason(base.report, "libyears")).toBe("left empty by this run");
    expect(nullReason({ ...base.report, absent: ["libyears"] }, "libyears")).toBe("not in this document");
  });
});

describe("thresholdGroups", () => {
  it("pairs warn with high by subject on one shared scale, leaving the rest as given", () => {
    const groups = thresholdGroups([
      ["release-warn-years", 3],
      ["release-high-years", 5],
      ["push-high-years", 7],
      ["push-warn-years", 4],
      ["odd-years", 2],
      ["solo-warn-years", 1],
    ]);
    expect(groups.pairs).toEqual([
      {
        subject: "release",
        warn: 3,
        high: 5,
        warnName: "release-warn-years",
        highName: "release-high-years",
      },
      { subject: "push", warn: 4, high: 7, warnName: "push-warn-years", highName: "push-high-years" },
    ]);
    expect(groups.others).toEqual([
      ["odd-years", 2],
      ["solo-warn-years", 1],
    ]);
    expect(groups.max).toBe(14);
  });

  it("keeps the 10-year floor the Findings axis uses", () => {
    expect(thresholdGroups([]).max).toBe(10);
  });
});

describe("sameScalePairs", () => {
  it("draws pairs that share both numbers once, keeping first-seen order", () => {
    const { pairs } = thresholdGroups([
      ["release-warn-years", 3],
      ["release-high-years", 5],
      ["push-warn-years", 3],
      ["push-high-years", 5],
      ["tag-warn-years", 2],
      ["tag-high-years", 5],
    ]);
    expect(sameScalePairs(pairs).map((row) => row.map((pair) => pair.subject))).toEqual([
      ["release", "push"],
      ["tag"],
    ]);
  });
});

describe("replacementInWordsOnly", () => {
  it("counts abandoned findings whose successor is named only in words, not resolved to a package", () => {
    const words = makeFinding({
      package: "a/words",
      signals: [makeSignal({ id: "S1", data: { replacement: "Symfony" } })],
    });
    const resolved = makeFinding({
      package: "a/resolved",
      replacement: "b/next",
      signals: [makeSignal({ id: "S1", data: { replacement: "b/next" } })],
    });
    const none = makeFinding({
      package: "a/none",
      signals: [makeSignal({ id: "S1", data: { replacement: null } })],
    });
    const stale = makeFinding({
      package: "a/stale",
      verdict: "stale",
      signals: [makeSignal({ id: "S1", data: { replacement: "x" } })],
    });
    expect(replacementInWordsOnly(makeModel([words, resolved, none, stale]))).toBe(1);
  });
});

describe("failOnThreshold", () => {
  const run = (failOn: string | null, failOnKind: string | null) => ({ failOn, failOnKind });

  it("words the threshold from run.fail_on_kind", () => {
    expect(failOnThreshold(run("none", "none"))).toBe("fails on nothing");
    expect(failOnThreshold(run("silent", "verdict"))).toBe("fails on verdict silent or a more severe one");
    expect(failOnThreshold(run("high", "priority"))).toBe("fails on priority high or higher");
    expect(failOnThreshold(run("unchecked", "unchecked"))).toBe(
      "fails on any package whose check did not run",
    );
  });

  it("names a kind it does not know as written, and says nothing without a kind", () => {
    expect(failOnThreshold(run("gpl-3.0", "licence"))).toBe("another kind of threshold: licence");
    // The page cannot tell a verdict from a priority by the value alone.
    expect(failOnThreshold(run("high", null))).toBeNull();
    expect(failOnThreshold(run(null, null))).toBeNull();
  });
});

describe("noteRepositories", () => {
  const note = (code: string, data: Record<string, unknown>) => ({
    code,
    text: "t",
    docsUrl: null,
    setsNetworkFailures: true,
    data,
  });

  it("lists each repository as host/repo, with its message when it has one", () => {
    const data = {
      forge_id: "github",
      repositories: [
        { host: "github.com", repo: "acme/direct-d", message: "API rate limit exceeded." },
        { host: "codeberg.org", repo: "acme/direct-i" },
      ],
    };
    for (const code of [
      "repository_activity_rate_limited",
      "repository_activity_unreachable",
      "repository_activity_not_found",
    ]) {
      expect(noteRepositories(note(code, data)), code).toEqual([
        { name: "github.com/acme/direct-d", message: "API rate limit exceeded." },
        { name: "codeberg.org/acme/direct-i", message: null },
      ]);
    }
  });

  it("reads no data for another code, an unknown one or a missing entry", () => {
    const data = { repositories: [{ host: "github.com", repo: "acme/x" }] };
    expect(noteRepositories(note("repository_activity_anonymous_cap", data))).toEqual([]);
    expect(noteRepositories(note("forge_outage", data))).toEqual([]);
    expect(noteRepositories(undefined)).toEqual([]);
  });

  it("keeps what an odd entry has and drops one with neither host nor repo", () => {
    const data = {
      repositories: [{ repo: "acme/only-repo" }, { host: "gitlab.com", message: 7 }, null, "x", {}],
    };
    expect(noteRepositories(note("repository_activity_not_found", data))).toEqual([
      { name: "acme/only-repo", message: null },
      { name: "gitlab.com", message: null },
    ]);
    expect(noteRepositories(note("repository_activity_not_found", { repositories: null }))).toEqual([]);
    expect(noteRepositories(note("repository_activity_not_found", {}))).toEqual([]);
  });
});

describe("repositoryGroups", () => {
  it("says a message once for every repository that has exactly that message, in first-seen order", () => {
    const repos = [
      { name: "github.com/a/one", message: "offline" },
      { name: "gitlab.com/b/two", message: "curl error 6" },
      { name: "github.com/c/three", message: "offline" },
      { name: "codeberg.org/d/four", message: null },
      { name: "codeberg.org/e/five", message: null },
    ];

    expect(repositoryGroups(repos, null)).toEqual({
      groups: [
        { message: "offline", names: ["github.com/a/one", "github.com/c/three"] },
        { message: "curl error 6", names: ["gitlab.com/b/two"] },
        { message: null, names: ["codeberg.org/d/four", "codeberg.org/e/five"] },
      ],
      hidden: 0,
    });
  });

  it("keeps messages apart that differ at all, the page matches no text", () => {
    const repos = [
      { name: "github.com/a/one", message: "offline: https://api.github.com/repos/a/one" },
      { name: "github.com/b/two", message: "offline: https://api.github.com/repos/b/two" },
    ];

    expect(repositoryGroups(repos, null).groups).toHaveLength(2);
  });

  it("groups only the first repositories up to the cap and counts the rest", () => {
    const repos = Array.from({ length: 25 }, (_, i) => ({
      name: `github.com/a/r${String(i)}`,
      message: "offline",
    }));

    const { groups, hidden } = repositoryGroups(repos, 20);

    expect(groups).toEqual([{ message: "offline", names: repos.slice(0, 20).map((r) => r.name) }]);
    expect(hidden).toBe(5);
  });

  it("hides nothing when the list is within the cap", () => {
    const repos = [{ name: "github.com/a/one", message: null }];

    expect(repositoryGroups(repos, 20).hidden).toBe(0);
    expect(repositoryGroups([], 20)).toEqual({ groups: [], hidden: 0 });
  });
});
