/**
 * The facts lockrot 0.13 states so the page need not rebuild them: a finding's origin, why its
 * libyears are missing, its priority basis, the advisories no fix is expected for, where it stands
 * against fail-on; the run's mode, strict network and threshold kind, its gate and typed notes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { normalize } from "../../../src/model/normalize";
import type { Finding, Model } from "../../../src/model/types";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");

function load(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")));
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

function finding(model: Model, pkg: string): Finding {
  const found = model.report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no ${pkg}`);
  return found;
}

function withFinding(extra: Record<string, unknown>): Finding {
  const result = normalize({
    report: {
      lockrot: { version: "0.13.0", schema: 1 },
      generated_at: "2026-09-28T00:00:00+00:00",
      findings: [{ package: "acme/x", version: "1.0.0", verdict: "stale", priority: "low", ...extra }],
    },
  });
  if (!result.ok) throw new Error("synthetic bundle failed to normalize");
  const [only] = result.model.report.findings;
  if (only === undefined) throw new Error("no finding");
  return only;
}

function withReport(extra: Record<string, unknown>): Model {
  const result = normalize({
    report: {
      lockrot: { version: "0.13.0", schema: 1 },
      generated_at: "2026-09-28T00:00:00+00:00",
      findings: [],
      ...extra,
    },
  });
  if (!result.ok) throw new Error("synthetic bundle failed to normalize");
  return result.model;
}

const MINI = load("mini-0.13-edges.json");

describe("finding.priorityBasis", () => {
  test("keeps every step as written, a flat one and one this page does not know included", () => {
    expect(finding(MINI, "acme/dev-vuln").priorityBasis).toEqual({
      base: "high",
      steps: [
        { reason: "transitive", from: "high", to: "medium" },
        { reason: "dev", from: "medium", to: "low" },
        { reason: "no_fix_expected", from: "low", to: "medium" },
      ],
    });
    expect(finding(MINI, "acme/abandoned-vuln").priorityBasis?.steps).toEqual([
      { reason: "no_fix_expected", from: "critical", to: "critical" },
    ]);
    expect(finding(MINI, "acme/future-step").priorityBasis?.steps).toEqual([
      { reason: "licence_change", from: "high", to: "critical" },
    ]);
  });

  test("the lock-only run names the unreached step", () => {
    const lockOnly = load("mini-0.13-edges-lock-only.json");

    expect(finding(lockOnly, "acme/dev-helper").priorityBasis).toEqual({
      base: "medium",
      steps: [
        { reason: "unreached", from: "medium", to: "low" },
        { reason: "dev", from: "low", to: "low" },
      ],
    });
  });

  test("every real 0.13 finding's steps chain from its base to its priority", () => {
    for (const name of ["wallabag_wallabag-0.13.json", "koel_lock-only-0.13.json", "mini-0.13-edges.json"]) {
      for (const f of load(name).report.findings) {
        const basis = f.priorityBasis;
        expect(basis).not.toBeNull();
        if (basis === null) continue;
        const end = basis.steps.reduce((at, step) => {
          expect(step.from).toBe(at);
          return step.to;
        }, basis.base);
        expect(end).toBe(f.priority);
      }
    }
  });

  test.each([
    ["absent", {}],
    ["null", { priority_basis: null }],
    ["without a base", { priority_basis: { steps: [] } }],
    ["a list", { priority_basis: [] }],
  ])("%s is no basis", (_label, extra) => {
    expect(withFinding(extra).priorityBasis).toBeNull();
  });

  test("a basis whose steps are unreadable keeps its base and reads each step as text", () => {
    expect(withFinding({ priority_basis: { base: "medium", steps: "x" } }).priorityBasis).toEqual({
      base: "medium",
      steps: [],
    });
    expect(withFinding({ priority_basis: { base: "medium", steps: [5] } }).priorityBasis?.steps).toEqual([
      { reason: "", from: "", to: "" },
    ]);
  });

  test("an older document's findings carry none", () => {
    for (const f of load("wallabag_wallabag.json").report.findings) {
      expect(f.priorityBasis).toBeNull();
    }
  });
});

describe("finding.noFixExpected and each advisory's releasesRead", () => {
  test("null, [] and a list stay apart", () => {
    expect(finding(MINI, "acme/future-step").noFixExpected).toBeNull();
    expect(finding(MINI, "acme/abandoned-fixed").noFixExpected).toEqual([]);
    expect(finding(MINI, "acme/abandoned-vuln").noFixExpected).toEqual([
      { id: "PKSA-abnd-0001", reason: "no_release_fixes" },
      { id: "PKSA-abnd-0002", reason: "affected_range_unknown" },
      { id: "PKSA-abnd-0003", reason: "fix_withdrawn" },
    ]);
  });

  test("an advisory carries its S9's releases_read", () => {
    const snapshot = finding(MINI, "acme/silent-snapshot");

    expect(snapshot.noFixExpected).toEqual([{ id: "PKSA-snap-0001", reason: "releases_unknown" }]);
    expect(snapshot.advisories.map((a) => a.releasesRead)).toEqual([false]);
    expect(finding(MINI, "acme/dev-vuln").advisories.map((a) => a.releasesRead)).toEqual([true]);
  });

  test("an older document says neither", () => {
    const otphp = finding(load("wallabag_wallabag.json"), "spomky-labs/otphp");

    expect(otphp.noFixExpected).toBeNull();
    expect(otphp.advisories.length).toBeGreaterThan(0);
    expect(otphp.advisories.every((a) => a.releasesRead === null)).toBe(true);
  });

  test("wallabag 0.13's otphp: two advisories, neither on the installed branch", () => {
    expect(finding(load("wallabag_wallabag-0.13.json"), "spomky-labs/otphp").noFixExpected).toEqual([
      { id: "PKSA-kbc7-dq62-pt7d", reason: "not_on_installed_branch" },
      { id: "PKSA-qv5y-crcz-9nxw", reason: "not_on_installed_branch" },
    ]);
  });

  test("something other than a list is no prediction; an unreadable item reads as text", () => {
    expect(withFinding({ no_fix_expected: {} }).noFixExpected).toBeNull();
    expect(withFinding({ no_fix_expected: [7] }).noFixExpected).toEqual([{ id: "", reason: "" }]);
  });
});

describe("finding.gate, fromComposerRepository, libyearsUnmeasured", () => {
  test("mini-0.13-edges: as written, an unknown exemption included", () => {
    expect(finding(MINI, "acme/future-step").gate).toEqual({
      reachesFailOn: true,
      fails: false,
      exemptBy: "waiver",
    });
    expect(finding(MINI, "acme/path-lib")).toMatchObject({
      gate: { reachesFailOn: true, fails: true, exemptBy: null },
      fromComposerRepository: false,
      libyearsUnmeasured: "not_from_composer_repository",
    });
    expect(finding(MINI, "acme/future-reason").libyearsUnmeasured).toBe("yanked_release");
    expect(finding(MINI, "acme/dev-vuln")).toMatchObject({
      fromComposerRepository: true,
      libyearsUnmeasured: null,
    });
  });

  test("a report without a gate gives every finding none", () => {
    for (const f of load("mini-0.13-gate-null.json").report.findings) {
      expect(f.gate).toBeNull();
    }
  });

  test("koel 0.13: the one package with no details still says it is not from a repository", () => {
    const koel = load("koel_koel-0.13.json");

    expect(koel.details.has("teamtnt/laravel-scout-tntsearch-driver")).toBe(false);
    expect(finding(koel, "teamtnt/laravel-scout-tntsearch-driver").fromComposerRepository).toBe(false);
  });

  test("a wrong type is no answer, never false", () => {
    expect(
      withFinding({
        from_composer_repository: "no",
        libyears_unmeasured: 3,
        gate: { reaches_fail_on: "yes", fails: null, exempt_by: 1 },
      }),
    ).toMatchObject({
      fromComposerRepository: null,
      libyearsUnmeasured: null,
      gate: { reachesFailOn: null, fails: null, exemptBy: null },
    });
  });

  test("an older document's findings answer none of them", () => {
    for (const f of load("wallabag_wallabag.json").report.findings) {
      expect([f.fromComposerRepository, f.libyearsUnmeasured, f.gate]).toEqual([null, null, null]);
    }
  });
});

describe("finding.origin and replacementUrl", () => {
  test("mini-0.13-edges: every kind as written, an unknown one and a registry the page does not know included", () => {
    expect(finding(MINI, "wp-plugin/acme-forms").origin).toEqual({
      kind: "composer",
      registry: "wp-packages.org",
      packageUrl: "https://wp-packages.org/packages/wp-plugin/acme-forms",
      local: null,
    });
    expect(finding(MINI, "acme/legacy_").origin).toMatchObject({
      kind: "packagist",
      registry: "packagist.org",
      packageUrl: null,
    });
    expect(finding(MINI, "acme/mirrored").origin).toMatchObject({ kind: "acme:mirror", registry: null });
    expect(finding(MINI, "acme/next-registry").origin?.registry).toBe("registry.acme.example");
  });

  test("mautic 0.13: the path entry is local, a packagist one is not", () => {
    const mautic = load("mautic_mautic-0.13.json");

    expect(finding(mautic, "mautic/core-lib").origin).toEqual({
      kind: "path",
      registry: null,
      packageUrl: null,
      local: true,
    });
    expect(finding(mautic, "rector/type-perfect").origin?.local).toBe(false);
  });

  test("replacement_url: a link, null beside a named replacement, and null with none", () => {
    expect(finding(MINI, "acme/retired-api")).toMatchObject({
      replacement: "acme/new-api",
      replacementUrl: "https://packagist.org/packages/acme/new-api",
    });
    expect(finding(MINI, "acme/private-retired")).toMatchObject({
      replacement: "acme/private-next",
      replacementUrl: null,
    });
    expect(finding(MINI, "acme/retired-words")).toMatchObject({ replacement: null, replacementUrl: null });
  });

  test.each([
    ["absent", {}],
    ["null", { origin: null }],
    ["a list", { origin: [] }],
    ["a string", { origin: "packagist" }],
  ])("origin %s is no origin", (_label, extra) => {
    expect(withFinding(extra).origin).toBeNull();
  });

  test("a wrong type is no answer, never a default", () => {
    expect(
      withFinding({
        origin: { kind: 1, registry: false, package_url: {}, local: "yes" },
        replacement_url: 5,
      }),
    ).toMatchObject({
      origin: { kind: null, registry: null, packageUrl: null, local: null },
      replacementUrl: null,
    });
  });

  test("an older document's findings answer neither", () => {
    for (const f of load("mautic_mautic.json").report.findings) {
      expect([f.origin, f.replacementUrl]).toEqual([null, null]);
    }
  });
});

describe("run.mode, run.strictNetwork, run.failOnKind and the report's gate", () => {
  test.each([
    [
      "mini-0.13-edges.json",
      "check",
      true,
      "priority",
      { fails: true, trippedBy: ["strict_network", "fail_on"], failOnApplied: true },
    ],
    [
      "mini-0.13-gate-generate.json",
      "generate_baseline",
      true,
      "priority",
      { fails: true, trippedBy: ["strict_network"], failOnApplied: false },
    ],
    [
      "mini-0.13-gate-none.json",
      "check",
      false,
      "none",
      { fails: false, trippedBy: [], failOnApplied: true },
    ],
    ["mini-0.13-gate-null.json", "check", false, null, null],
    [
      "mini-0.13-gate-unknown.json",
      "audit",
      false,
      "licence",
      { fails: true, trippedBy: ["fail_on", "licence_policy"], failOnApplied: true },
    ],
    [
      "wallabag_offline-strict-unchecked-0.13.json",
      "check",
      true,
      "unchecked",
      { fails: true, trippedBy: ["strict_network", "fail_on"], failOnApplied: true },
    ],
  ])("%s: mode %s, strict %s, kind %s", (name, mode, strictNetwork, failOnKind, gate) => {
    const { run, gate: actual } = load(name).report;

    expect([run.mode, run.strictNetwork, run.failOnKind]).toEqual([mode, strictNetwork, failOnKind]);
    expect(actual).toEqual(gate);
  });

  test("an older document answers none, and names each key it leaves out", () => {
    const report = load("wallabag_wallabag.json").report;

    expect([report.run.mode, report.run.strictNetwork, report.run.failOnKind, report.gate]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(report.noteDetails).toEqual([]);
    expect(report.absent).toEqual(
      expect.arrayContaining(["note_details", "gate", "run.fail_on_kind", "run.mode", "run.strict_network"]),
    );
  });

  test("a gate written as null is the document's answer, not a key left out", () => {
    const report = load("mini-0.13-gate-null.json").report;

    expect(report.gate).toBeNull();
    expect(report.absent).toEqual([]);
  });

  test("a gate with unreadable parts answers no part it cannot read", () => {
    expect(withReport({ gate: { fails: "yes", tripped_by: "fail_on" } }).report.gate).toEqual({
      fails: null,
      trippedBy: [],
      failOnApplied: null,
    });
  });
});

describe("report.noteDetails", () => {
  test("one entry per note, at the same index and with the same text, a repeated code included", () => {
    const report = MINI.report;

    expect(report.noteDetails.map((n) => n.text)).toEqual(report.notes);
    expect(report.noteDetails.filter((n) => n.code === "advisories_not_checked")).toHaveLength(4);
  });

  test("keeps the first and an unknown vendor code as written, a null docs_url included", () => {
    const details = MINI.report.noteDetails;

    expect(details[0]).toEqual({
      code: "offline",
      text: "offline: repository metadata served from Composer's cache",
      docsUrl: "https://lockrot.dev/notes/#offline",
      setsNetworkFailures: false,
      data: {},
    });
    expect(details.at(-1)).toEqual({
      code: "acme:licence-scan",
      text: "acme licence scan skipped 2 packages",
      docsUrl: null,
      setsNetworkFailures: false,
      data: { skipped: ["acme/licensed", "acme/mid"] },
    });
  });

  test("an unreadable entry keeps its place", () => {
    expect(withReport({ note_details: [5, { code: "offline", data: [] }] }).report.noteDetails).toEqual([
      { code: "", text: "", docsUrl: null, setsNetworkFailures: null, data: {} },
      { code: "offline", text: "", docsUrl: null, setsNetworkFailures: null, data: {} },
    ]);
  });
});
