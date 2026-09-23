// Shared builders for the domain/ test suite. Not a *.test.ts file itself, so vitest never treats
// it as a suite; it only gives every test in this directory a Finding/Advisory/Model to start from
// and override, instead of restating every required field in each test.

import type { Advisory, Finding, Model, ReportModel, Signal } from "../../../src/model/types";

export function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: "GHSA-0000",
    cve: null,
    title: "Example advisory",
    link: null,
    severityRaw: "high",
    severity: "high",
    reportedAt: null,
    affectedVersions: null,
    fixedBy: null,
    fixedOnBranch: false,
    ...overrides,
  };
}

export function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "S1",
    level: "warn",
    summary: "example signal",
    data: {},
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    package: "acme/widget",
    version: "1.0.0",
    verdict: "abandoned",
    priority: "critical",
    direct: true,
    dev: false,
    replacement: null,
    signals: [],
    chain: [],
    directDependents: [],
    evidence: "the repository is archived",
    allowlistReason: null,
    note: null,
    dataDate: null,
    libyears: null,
    baseline: null,
    advisories: [],
    ...overrides,
  };
}

const EMPTY_REPORT: ReportModel = {
  schemaUrl: "https://lockrot.dev/schema/report-1.json",
  tool: { version: "0.11.0", schema: 1 },
  generatedAt: "2026-01-01T00:00:00Z",
  run: { project: null, targetPhp: null, lockFile: null, failOn: null, thresholds: [], flaggedVerdicts: [] },
  activityCacheOldestAt: null,
  packagesChecked: null,
  includeDev: null,
  notFromComposerRepository: null,
  networkFailures: null,
  counts: {},
  abandoned: null,
  priorities: {},
  exposure: [],
  libyears: null,
  baseline: null,
  notes: [],
  findings: [],
};

export function makeModel(findings: readonly Finding[]): Model {
  return {
    report: { ...EMPTY_REPORT, findings },
    details: new Map(),
    schema: 1,
    newerSchema: false,
  };
}
