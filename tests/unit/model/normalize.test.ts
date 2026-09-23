import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { normalize, parseBundle } from "../../../src/model/normalize";
import { PRIORITIES, VERDICTS, type Severity } from "../../../src/model/types";
import { DEFAULT_FLAGGED } from "../../../src/domain/vocab";

// Resolved from the repo root (vitest's working directory), not from this file's own URL: under
// Vite's transform the module URL is not always a plain `file:` URL, which breaks `new URL(...)`.
const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function fixtureNames(): readonly string[] {
  return readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".json"));
}

/** A minimal but fully-shaped report source, so individual tests only override the one field they care about. */
function minimalReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: "https://lockrot.dev/schema/report-1.json",
    lockrot: { version: "0.11.0", schema: 1 },
    generated_at: "2026-09-24T00:00:00+00:00",
    run: null,
    activity_cache_oldest_at: null,
    packages_checked: 1,
    include_dev: false,
    not_from_composer_repository: 0,
    network_failures: false,
    counts: {
      abandoned: 0,
      silent: 0,
      pinned: 0,
      "left-behind": 0,
      "old-promise": 0,
      stale: 0,
      unknown: 0,
      finished: 0,
      ok: 1,
    },
    abandoned: { total: 0, with_replacement: 0 },
    priorities: { critical: 0, high: 0, medium: 0, low: 0, none: 1 },
    exposure: [],
    libyears: null,
    baseline: null,
    notes: [],
    findings: [],
    ...overrides,
  };
}

function bundle(report: Record<string, unknown>, details: unknown = {}): Record<string, unknown> {
  return { report, details };
}

// -------------------------------------------------------------------------------------------
// Real fixtures
// -------------------------------------------------------------------------------------------

describe("normalize over real fixtures", () => {
  for (const name of fixtureNames()) {
    test(`${name} normalises ok and preserves findings/details counts`, () => {
      const raw = loadFixture(name) as { report: { findings: unknown[] }; details: unknown };
      const result = normalize(raw);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.model.report.findings.length).toBe(raw.report.findings.length);

      const expectedDetailsCount = Array.isArray(raw.details) ? 0 : Object.keys(raw.details as object).length;
      expect(result.model.details.size).toBe(expectedDetailsCount);
    });
  }
});

// -------------------------------------------------------------------------------------------
// Malformed / edge inputs
// -------------------------------------------------------------------------------------------

describe("malformed top-level inputs", () => {
  test.each([
    ["null", null],
    ["an array", []],
    ["a bare string", "x"],
    ["a report that is not an object", { report: 5 }],
  ])("%s is not-a-report", (_label, input) => {
    const result = normalize(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-a-report");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});

describe("generated_at", () => {
  test("missing generated_at is not-a-report", () => {
    const { generated_at: _dropped, ...withoutGeneratedAt } = minimalReport();
    const result = normalize(bundle(withoutGeneratedAt));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-a-report");
    }
  });

  test("unparsable generated_at is not-a-report", () => {
    const result = normalize(bundle(minimalReport({ generated_at: "not a date" })));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-a-report");
    }
  });

  test("a valid generated_at is kept verbatim", () => {
    const result = normalize(bundle(minimalReport()));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.generatedAt).toBe("2026-09-24T00:00:00+00:00");
    }
  });
});

describe("details shapes (critic.md K1)", () => {
  test("details as [] normalises to an empty map", () => {
    const result = normalize(bundle(minimalReport(), []));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.size).toBe(0);
    }
  });

  test("details as {} normalises to an empty map", () => {
    const result = normalize(bundle(minimalReport(), {}));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.size).toBe(0);
    }
  });

  test("a missing details key normalises to an empty map", () => {
    const result = normalize({ report: minimalReport() });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.size).toBe(0);
    }
  });

  test("a populated details object is carried through, keyed by package", () => {
    const result = normalize(
      bundle(minimalReport(), {
        "vendor/pkg": { metadata: null, lock: null, activity: null, repository_link: null },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.size).toBe(1);
      expect(result.model.details.get("vendor/pkg")).toEqual({
        metadata: null,
        lock: null,
        activity: null,
        repositoryLink: null,
      });
    }
  });
});

describe("buildLock: from_composer_repository default (parity with legacy's `!== false`)", () => {
  test("a lock object missing the key keeps the Packagist link, matching legacy", () => {
    const result = normalize(
      bundle(minimalReport(), {
        "vendor/pkg": {
          metadata: null,
          lock: {
            php: null,
            released: null,
            repository: null,
            dev: false,
            branch_snapshot: false,
            type: null,
          },
          activity: null,
          repository_link: null,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.get("vendor/pkg")?.lock?.fromComposerRepository).toBe(true);
    }
  });

  test("an explicit false still suppresses it", () => {
    const result = normalize(
      bundle(minimalReport(), {
        "vendor/pkg": {
          metadata: null,
          lock: {
            php: null,
            released: null,
            repository: null,
            from_composer_repository: false,
            dev: false,
            branch_snapshot: false,
            type: null,
          },
          activity: null,
          repository_link: null,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.get("vendor/pkg")?.lock?.fromComposerRepository).toBe(false);
    }
  });

  test("an explicit true is kept", () => {
    const result = normalize(
      bundle(minimalReport(), {
        "vendor/pkg": {
          metadata: null,
          lock: {
            php: null,
            released: null,
            repository: null,
            from_composer_repository: true,
            dev: false,
            branch_snapshot: false,
            type: null,
          },
          activity: null,
          repository_link: null,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.get("vendor/pkg")?.lock?.fromComposerRepository).toBe(true);
    }
  });
});

describe("the bare --format=json shape", () => {
  test("a document with lockrot + findings and no report key normalises, with empty details", () => {
    const bare = minimalReport({
      findings: [
        {
          package: "vendor/pkg",
          version: "1.0.0",
          verdict: "ok",
          priority: "none",
          direct: true,
          dev: false,
          signals: [],
          chain: [],
          direct_dependents: [],
          evidence: "",
        },
      ],
    });
    const result = normalize(bare);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.size).toBe(0);
      expect(result.model.report.findings).toHaveLength(1);
      expect(result.model.report.findings[0]?.package).toBe("vendor/pkg");
    }
  });
});

describe("evidence (critic.md K5 — the pre-string legacy shape)", () => {
  test("a string evidence field is kept as-is", () => {
    const result = normalize(
      bundle(
        minimalReport({
          findings: [findingWith({ evidence: "already a string" })],
        }),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.evidence).toBe("already a string");
    }
  });

  test("an array evidence field is joined with ' · '", () => {
    const result = normalize(
      bundle(
        minimalReport({
          findings: [findingWith({ evidence: ["first clause", "second clause"] })],
        }),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.evidence).toBe("first clause · second clause");
    }
  });

  test("a missing evidence field becomes an empty string, not a crash", () => {
    const { evidence: _dropped, ...withoutEvidence } = findingWith({});
    const result = normalize(bundle(minimalReport({ findings: [withoutEvidence] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.evidence).toBe("");
    }
  });
});

describe("unknown enum values are kept, never dropped (DESIGN.md §2)", () => {
  test("an unrecognised verdict string survives normalisation as-is", () => {
    const result = normalize(bundle(minimalReport({ findings: [findingWith({ verdict: "quantum-flux" })] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.verdict).toBe("quantum-flux");
    }
  });

  test("an unknown counts key is kept alongside the known ones, zero-filled elsewhere", () => {
    const result = normalize(bundle(minimalReport({ counts: { ok: 3, "totally-new-verdict": 2 } })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.counts["totally-new-verdict"]).toBe(2);
      expect(result.model.report.counts.ok).toBe(3);
      for (const verdict of VERDICTS) {
        expect(result.model.report.counts[verdict]).toBeTypeOf("number");
      }
    }
  });

  test("every known priority key is zero-filled even when the document supplies none", () => {
    const result = normalize(bundle(minimalReport({ priorities: {} })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const priority of PRIORITIES) {
        expect(result.model.report.priorities[priority]).toBe(0);
      }
    }
  });
});

describe("S9 advisories flattened onto Finding.advisories, with severity bucketed", () => {
  test("advisories from an S9 signal are flattened and each severity is bucketed", () => {
    const finding = findingWith({
      signals: [
        {
          id: "S9",
          level: "warn",
          summary: "2 advisories",
          data: {
            advisories: [
              { id: "A1", severity: "Critical" },
              { id: "A2", severity: "moderate" },
              { id: "A3", severity: null },
              { id: "A4", severity: "somethingElse" },
            ],
          },
        },
      ],
    });
    const result = normalize(bundle(minimalReport({ findings: [finding] })));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const advisories = result.model.report.findings[0]?.advisories ?? [];
    const bySeverity = new Map(advisories.map((a) => [a.id, a.severity]));
    const expected: Record<string, Severity> = {
      A1: "critical",
      A2: "medium",
      A3: "unrated",
      A4: "unrated",
    };
    for (const [id, severity] of Object.entries(expected)) {
      expect(bySeverity.get(id)).toBe(severity);
    }
    expect(advisories).toHaveLength(4);
  });

  test("advisories from multiple S9 signals are flattened in document order", () => {
    const finding = findingWith({
      signals: [
        { id: "S9", level: "warn", summary: "a", data: { advisories: [{ id: "A1", severity: "high" }] } },
        { id: "S6", level: "info", summary: "unrelated", data: {} },
        { id: "S9", level: "warn", summary: "b", data: { advisories: [{ id: "A2", severity: "low" }] } },
      ],
    });
    const result = normalize(bundle(minimalReport({ findings: [finding] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.advisories.map((a) => a.id)).toEqual(["A1", "A2"]);
    }
  });

  test("an S9 signal whose data.advisories is missing contributes no advisories", () => {
    const finding = findingWith({ signals: [{ id: "S9", level: "warn", summary: "x", data: {} }] });
    const result = normalize(bundle(minimalReport({ findings: [finding] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.advisories).toEqual([]);
    }
  });
});

describe("non-string package/version are coerced, never dropped", () => {
  test("a numeric package or version is stringified instead of discarded", () => {
    const result = normalize(
      bundle(minimalReport({ findings: [findingWith({ package: 12345, version: 6.5 })] })),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.package).toBe("12345");
      expect(result.model.report.findings[0]?.version).toBe("6.5");
    }
  });
});

describe("run (contract.md §2.1 / critic.md K5)", () => {
  test("a missing run becomes nulls, with domain/vocab's DEFAULT_FLAGGED as the fallback", () => {
    // The fallback is `DEFAULT_FLAGGED` itself, not a second list hand-copied here that could drift
    // from it (quality finding: normalize.ts's own `FLAGGED_VERDICTS_FALLBACK` used to duplicate
    // it). `toBe` on the array checks that identity, not just that the values still happen to match.
    const result = normalize(bundle(minimalReport({ run: null })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.run).toEqual({
        project: null,
        targetPhp: null,
        lockFile: null,
        failOn: null,
        thresholds: [],
        flaggedVerdicts: DEFAULT_FLAGGED,
      });
      expect(result.model.report.run.flaggedVerdicts).toBe(DEFAULT_FLAGGED);
    }
  });

  test("thresholds are kept in document key order", () => {
    const result = normalize(
      bundle(
        minimalReport({
          run: {
            thresholds: { "push-warn-years": 3, "release-warn-years": 2, "push-high-years": 5 },
          },
        }),
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.run.thresholds).toEqual([
        ["push-warn-years", 3],
        ["release-warn-years", 2],
        ["push-high-years", 5],
      ]);
    }
  });

  test("an explicit empty flagged_verdicts array is kept rather than replaced by the fallback", () => {
    const result = normalize(bundle(minimalReport({ run: { flagged_verdicts: [] } })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.run.flaggedVerdicts).toEqual([]);
    }
  });
});

describe("older documents missing fields added later (contract.md §6, the 0.10.0 drift)", () => {
  test("a finding with no libyears or replacement key normalises those to null", () => {
    const { libyears: _l, replacement: _r, ...oldFinding } = findingWith({});
    const result = normalize(bundle(minimalReport({ findings: [oldFinding] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.findings[0]?.libyears).toBeNull();
      expect(result.model.report.findings[0]?.replacement).toBeNull();
    }
  });

  test("a report missing the abandoned and libyears blocks normalises those to null", () => {
    const { abandoned: _a, libyears: _l, ...oldReport } = minimalReport();
    const result = normalize(bundle(oldReport));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.report.abandoned).toBeNull();
      expect(result.model.report.libyears).toBeNull();
    }
  });

  test("a branch row missing php normalises it to null", () => {
    const result = normalize(
      bundle(minimalReport(), {
        "vendor/pkg": {
          metadata: {
            branches: [{ branch: "1.x", installed: true, highest: "v1.0" }],
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.details.get("vendor/pkg")?.metadata?.branches[0]?.php).toBeNull();
    }
  });
});

describe("parseBundle", () => {
  test("invalid JSON text is reported as not-json", () => {
    const result = parseBundle("{not json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not-json");
    }
  });

  test("valid JSON text delegates to normalize", () => {
    const result = parseBundle(JSON.stringify(bundle(minimalReport())));

    expect(result.ok).toBe(true);
  });
});

describe("schema / newerSchema", () => {
  test("a missing lockrot.schema defaults to 1 and is not newer", () => {
    const result = normalize(bundle(minimalReport({ lockrot: { version: "0.9.0" } })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.schema).toBe(1);
      expect(result.model.newerSchema).toBe(false);
    }
  });

  test("a higher schema number is flagged as newer", () => {
    const result = normalize(bundle(minimalReport({ lockrot: { version: "9.9.9", schema: 2 } })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.schema).toBe(2);
      expect(result.model.newerSchema).toBe(true);
    }
  });
});

function findingWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    package: "vendor/pkg",
    version: "1.0.0",
    verdict: "stale",
    priority: "medium",
    direct: true,
    dev: false,
    replacement: null,
    signals: [],
    chain: ["vendor/pkg"],
    direct_dependents: [],
    evidence: "",
    allowlist_reason: null,
    note: null,
    data_date: null,
    libyears: null,
    baseline: null,
    ...overrides,
  };
}

// -------------------------------------------------------------------------------------------
// Property-style: normalize() never throws, for any of 200 deterministically mutated fixtures.
// -------------------------------------------------------------------------------------------

/** A tiny seeded PRNG (mulberry32) — deterministic across runs, unlike Math.random(). */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically corrupts a cloned JSON value: drops keys, swaps types, empties collections. */
function mutate(value: unknown, rng: () => number, depth = 0): unknown {
  const roll = rng();
  if (roll < 0.06) return null;
  if (roll < 0.1) return undefined;
  if (roll < 0.14) return rng() < 0.5 ? 42 : "mutated-scalar";
  if (roll < 0.18) return [];
  if (roll < 0.22) return {};
  if (depth > 8) return value;

  if (Array.isArray(value)) {
    return value
      .filter(() => rng() > 0.1)
      .map((item: unknown) => (rng() < 0.3 ? mutate(item, rng, depth + 1) : item));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (rng() < 0.12) {
        continue; // drop the key entirely
      }
      result[key] = rng() < 0.3 ? mutate(item, rng, depth + 1) : item;
    }
    return result;
  }
  return value;
}

describe("normalize never throws (property-style, 200 seeded mutations)", () => {
  const names = fixtureNames();
  const fixtures = names.map((name) => loadFixture(name));

  for (let i = 0; i < 200; i += 1) {
    test(`seed ${i} on ${names[i % names.length]}`, () => {
      const base = fixtures[i % fixtures.length];
      const mutated = mutate(structuredClone(base), mulberry32(i));

      expect(() => normalize(mutated)).not.toThrow();
    });
  }
});
