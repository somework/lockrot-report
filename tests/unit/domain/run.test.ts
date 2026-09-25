import { describe, expect, it } from "vitest";
import type { Model, PackageDetails } from "../../../src/model/types";
import {
  activityTally,
  cacheAge,
  cacheNullReason,
  nullReason,
  spanPhrase,
  thresholdGroups,
  utcMinute,
} from "../../../src/domain/run";
import { makeModel } from "./fixtures";

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
    expect(cacheNullReason(fresh)).toBe("none — all 2 in this file were fetched during the run");
    const cached: Model = { ...base, details: withActivity([true]) };
    expect(cacheNullReason(cached)).toBe("not recorded");
    expect(cacheNullReason(base)).toBe("not recorded");
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
    expect(nullReason(base.report, "libyears")).toBe("not recorded");
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
