import { describe, expect, it } from "vitest";
import {
  groupCounts,
  reachText,
  rowSignals,
  runFacts,
  segmentRuns,
  shortFact,
  vendorOf,
  wayIn,
  whyText,
} from "../../../src/domain/rows";
import type { Finding } from "../../../src/model/types";
import { makeFinding, makeSignal } from "./fixtures";

const THRESHOLDS = [
  ["release-warn-years", 3],
  ["release-high-years", 5],
  ["push-warn-years", 3],
  ["push-high-years", 5],
] as const;

function via(pkg: string, root: string, overrides: Partial<Finding> = {}): Finding {
  return makeFinding({ package: pkg, direct: false, chain: [root, pkg], verdict: "abandoned", ...overrides });
}

function names(findings: readonly Finding[]): string[] {
  return findings.map((f) => f.package);
}

describe("rowSignals (PD-ROWS-1/PD-ROWS-5)", () => {
  const finding = makeFinding({
    signals: [
      makeSignal({ id: "S5", level: "warn" }),
      makeSignal({ id: "S4", level: "high" }),
      makeSignal({ id: "S2", level: "high" }),
    ],
  });

  it("quotes the highest-level signal, a tie going to the lower id, and keeps the rest in order", () => {
    const { key, rest } = rowSignals(finding, null);
    expect(key?.id).toBe("S2");
    expect(rest.map((s) => s.id)).toEqual(["S4", "S5"]);
  });

  it("quotes the rail's one signal filter when the finding carries it", () => {
    expect(rowSignals(finding, "S5").key?.id).toBe("S5");
    expect(rowSignals(finding, "S5").rest.map((s) => s.id)).toEqual(["S2", "S4"]);
  });

  it("falls back to the key fact when the filtered signal is not on this finding", () => {
    expect(rowSignals(finding, "S9").key?.id).toBe("S2");
  });

  it("quotes nothing for a finding with no signal", () => {
    expect(rowSignals(makeFinding({ signals: [] }), null)).toEqual({ key: null, rest: [] });
  });
});

describe("shortFact (PD-ROWS-4)", () => {
  const f = makeFinding();

  it("says each signal short, from its own data", () => {
    expect(shortFact(makeSignal({ id: "S1", data: { replacement: "Symfony" } }), f)).toBe(
      "marked abandoned, replaced by Symfony",
    );
    expect(shortFact(makeSignal({ id: "S1", data: {} }), f)).toBe("marked abandoned by its repository");
    expect(shortFact(makeSignal({ id: "S2", data: { last_release: "2017-11-15T13:41:13+00:00" } }), f)).toBe(
      "no stable release since Nov 2017",
    );
    expect(shortFact(makeSignal({ id: "S4", data: { last_push: "2021-04-29T19:09:57+00:00" } }), f)).toBe(
      "no push since Apr 2021",
    );
    expect(
      shortFact(
        makeSignal({
          id: "S5",
          data: { released: "2017-11-15T00:00:00+00:00", written_for_php: 5, target_php: "8.4" },
        }),
        f,
      ),
    ).toBe("released 2017 for PHP 5; admits 8.4 untested");
    expect(shortFact(makeSignal({ id: "S7", data: { flagged: 1 } }), f)).toBe("pulls in 1 flagged package");
    expect(shortFact(makeSignal({ id: "S8", data: { branch: "5.x", newest_branch: "7.x" } }), f)).toBe(
      "5.x stopped; 7.x ships",
    );
    expect(shortFact(makeSignal({ id: "S9", data: { advisories: [{}, {}] } }), f)).toBe(
      "2 advisories affect this version",
    );
    expect(shortFact(makeSignal({ id: "S10", summary: "a long sentence" }), f)).toBe("a check could not run");
  });

  it("prefers the finding's own resolved replacement over S1's raw one", () => {
    const replaced = makeFinding({ replacement: "acme/new" });
    expect(shortFact(makeSignal({ id: "S1", data: { replacement: "Acme" } }), replaced)).toBe(
      "marked abandoned, replaced by acme/new",
    );
  });

  it("falls back to the document's own summary when a field is missing or malformed", () => {
    expect(
      shortFact(makeSignal({ id: "S2", summary: "raw S2", data: { last_release: "not a date" } }), f),
    ).toBe("raw S2");
    expect(shortFact(makeSignal({ id: "S8", summary: "raw S8", data: { branch: "5.x" } }), f)).toBe("raw S8");
    expect(shortFact(makeSignal({ id: "S3", summary: "repository archived on GitHub" }), f)).toBe(
      "repository archived on GitHub",
    );
  });

  it("reads a date in UTC, so the month never shifts with the reader's time zone", () => {
    expect(shortFact(makeSignal({ id: "S2", data: { last_release: "2020-01-01T00:30:00+00:00" } }), f)).toBe(
      "no stable release since Jan 2020",
    );
  });
});

describe("whyText / reachText", () => {
  it("uses the evidence sentence for a finding without a signal", () => {
    expect(whyText(makeFinding({ signals: [], evidence: "the evidence" }), null)).toBe("the evidence");
  });

  it("names the direct requirement a chain starts at, and says so when there is none", () => {
    expect(reachText(makeFinding({ direct: true }))).toBe("direct");
    expect(reachText(via("a/b", "acme/root"))).toBe("via acme/root");
    expect(reachText(makeFinding({ direct: false, chain: [] }))).toBe("through another package");
  });
});

describe("vendorOf / wayIn", () => {
  it("splits a Composer name at its slash", () => {
    expect(vendorOf("hoa/event")).toBe("hoa");
    expect(vendorOf("php")).toBeNull();
  });

  it("keys a direct requirement by vendor and anything else by its chain's root", () => {
    expect(wayIn(makeFinding({ package: "scheb/2fa-bundle", direct: true }))).toBe("direct:scheb");
    expect(wayIn(via("hoa/event", "wallabag/rulerz"))).toBe("via:wallabag/rulerz");
    expect(wayIn(makeFinding({ direct: false, chain: [] }))).toBeNull();
    expect(wayIn(makeFinding({ package: "novendor", direct: true }))).toBeNull();
  });
});

describe("segmentRuns (PD-ROWS-6: display only, never reorders)", () => {
  it("marks three or more consecutive rows sharing verdict and way in as a run", () => {
    const list = [
      via("x/one", "acme/other"),
      via("hoa/a", "wallabag/rulerz"),
      via("hoa/b", "wallabag/rulerz"),
      via("hoa/c", "wallabag/rulerz"),
      via("y/two", "acme/other"),
    ];
    const segments = segmentRuns(list);
    expect(segments.map((s) => [s.run, names(s.findings)])).toEqual([
      [false, ["x/one"]],
      [true, ["hoa/a", "hoa/b", "hoa/c"]],
      [false, ["y/two"]],
    ]);
  });

  it("never joins rows that are not next to each other, and writes no run for two", () => {
    const list = [
      via("hoa/a", "wallabag/rulerz"),
      via("hoa/b", "wallabag/rulerz"),
      via("x/one", "acme/other"),
      via("hoa/c", "wallabag/rulerz"),
    ];
    const segments = segmentRuns(list);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.run).toBe(false);
    expect(names(segments[0]?.findings ?? [])).toEqual(names(list));
  });

  it("splits on verdict and on dev-ness", () => {
    const list = [
      via("a/a", "r/r"),
      via("a/b", "r/r"),
      via("a/c", "r/r", { verdict: "silent" }),
      via("a/d", "r/r", { dev: true }),
    ];
    expect(segmentRuns(list).some((s) => s.run)).toBe(false);
  });

  it("keys direct requirements by vendor", () => {
    const list = ["scheb/a", "scheb/b", "scheb/c"].map((p) =>
      makeFinding({ package: p, direct: true, verdict: "left-behind" }),
    );
    expect(segmentRuns(list)).toEqual([{ run: true, findings: list }]);
  });

  it("keeps the list's own order, and every row, in the segments", () => {
    const list = [via("b/b", "r/r"), via("a/a", "r/r"), via("c/c", "r/r"), makeFinding({ package: "z/z" })];
    expect(segmentRuns(list).flatMap((s) => names(s.findings))).toEqual(names(list));
    expect(segmentRuns([])).toEqual([]);
  });
});

describe("groupCounts (PD-ROWS-6)", () => {
  it("counts by verdict, most common first, ties in the vocabulary's order, and by reach and dev", () => {
    const counts = groupCounts([
      makeFinding({ verdict: "silent", direct: true }),
      makeFinding({ verdict: "abandoned", direct: true }),
      makeFinding({ verdict: "silent", direct: false, dev: true }),
      makeFinding({ verdict: "left-behind", direct: false }),
    ]);
    expect(counts).toEqual({
      total: 4,
      verdicts: [
        { verdict: "silent", count: 2 },
        { verdict: "abandoned", count: 1 },
        { verdict: "left-behind", count: 1 },
      ],
      direct: 2,
      dev: 1,
    });
  });
});

describe("runFacts (PD-ROWS-6)", () => {
  function aged(pkg: string, root: string, id: "S2" | "S4" | "S8", years: number): Finding {
    return via(pkg, root, {
      signals: [makeSignal({ id: "S1" }), makeSignal({ id, data: { years } })],
    });
  }

  it("names what every member shares: vendor, way in, age range and the abandoning signal", () => {
    const facts = runFacts(
      [aged("hoa/a", "wallabag/rulerz", "S2", 9.7), aged("hoa/b", "wallabag/rulerz", "S2", 9.1)],
      THRESHOLDS,
    );
    expect(facts).toEqual({
      count: 2,
      verdict: "abandoned",
      vendor: "hoa",
      direct: false,
      via: "wallabag/rulerz",
      dev: false,
      age: { kind: "release", min: 9.1, max: 9.7 },
      abandonedBy: "S1",
    });
  });

  it("drops the vendor when members differ, and the age when kinds differ or one has none", () => {
    const mixed = runFacts([aged("a/x", "r/r", "S2", 4), aged("b/y", "r/r", "S4", 5)], THRESHOLDS);
    expect(mixed.vendor).toBeNull();
    expect(mixed.age).toBeNull();
    const missing = runFacts([aged("a/x", "r/r", "S2", 4), via("a/y", "r/r")], THRESHOLDS);
    expect(missing.age).toBeNull();
    expect(missing.abandonedBy).toBeNull();
  });

  it("reports a run of direct requirements with no parent", () => {
    const facts = runFacts(
      [makeFinding({ package: "s/a", direct: true }), makeFinding({ package: "s/b", direct: true })],
      THRESHOLDS,
    );
    expect(facts.direct).toBe(true);
    expect(facts.via).toBeNull();
  });
});
