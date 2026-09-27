/**
 * S6's facts (`domain/pinned.ts`) and every sentence the page words from them: the answer's pinned
 * clause, the key facts' release slot, a run's reason and an age cell's context reason.
 *
 * lockrot 0.13.0 tells S6's two cases apart (`reason`) and says whether the repository lists any tag
 * (`has_stable_release`, a pre-release counts; null when no repository metadata was loaded). A
 * document written before 0.13.0 carries none of it and keeps today's words, unless its lock says
 * the version is not a branch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { answerParts, answerText } from "../../../src/domain/answer";
import {
  pinnedContextReason,
  pinnedFacts,
  pinnedKind,
  pinnedReleaseSlot,
  pinnedRunReason,
} from "../../../src/domain/pinned";
import { runFacts } from "../../../src/domain/rows";
import { normalize } from "../../../src/model/normalize";
import type { ExplainLock, Finding, Model, PackageDetails } from "../../../src/model/types";
import { makeFinding, makeMetadata, makeSignal } from "./fixtures";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "bundles");

function load(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")) as unknown);
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

const WALLABAG_013 = load("wallabag_wallabag-0.13.json");
const WALLABAG_011 = load("wallabag_wallabag.json");
const MAUTIC_013 = load("mautic_mautic-0.13.json");
const MAUTIC_011 = load("mautic_mautic.json");
const EDGES = load("mini-0.13-edges.json");
const EDGES_LOCK_ONLY = load("mini-0.13-edges-lock-only.json");
const KOEL_013 = load("koel_koel-0.13.json");

const THRESHOLDS = [
  ["release-warn-years", 3],
  ["release-high-years", 5],
  ["push-warn-years", 3],
  ["push-high-years", 5],
] as const;

function finding(model: Model, pkg: string): Finding {
  const found = model.report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`${pkg} is not a finding`);
  return found;
}

function details(model: Model, pkg: string): PackageDetails | null {
  return model.details.get(pkg) ?? null;
}

function sentence(model: Model, pkg: string): string {
  const f = finding(model, pkg);
  const d = details(model, pkg);
  return answerText(
    answerParts({
      finding: f,
      details: d,
      metadataReplacement: null,
      thresholds: model.report.run.thresholds,
    }),
  );
}

function slot(model: Model, pkg: string): string | null {
  const d = details(model, pkg);
  const facts = pinnedFacts(finding(model, pkg), d);
  if (facts === null) throw new Error(`${pkg} has no S6 facts`);
  return pinnedReleaseSlot(facts, d?.lock ?? null);
}

function lock(overrides: Partial<ExplainLock> = {}): ExplainLock {
  return {
    php: null,
    released: "2024-01-01T00:00:00+00:00",
    repository: null,
    fromComposerRepository: true,
    dev: false,
    branchSnapshot: true,
    type: null,
    ...overrides,
  };
}

function withLock(l: ExplainLock | null): PackageDetails {
  return { metadata: null, lock: l, activity: null, repositoryLink: null };
}

describe("pinnedFacts", () => {
  test("reads S6's 0.13 data: a snapshot of a package with a dated tag (wallabag friendsofsymfony/oauth-server-bundle)", () => {
    const facts = pinnedFacts(
      finding(WALLABAG_013, "friendsofsymfony/oauth-server-bundle"),
      details(WALLABAG_013, "friendsofsymfony/oauth-server-bundle"),
    );
    expect(facts).toEqual({
      version: "dev-master",
      summary: "pinned to branch snapshot dev-master",
      reason: { raw: "branch_snapshot", known: true },
      hasStableRelease: true,
      lastStableVersion: "1.6.2",
      lastStableRelease: "2019-01-23T15:23:04+00:00",
      lastStableDatedBy: null,
      snapshotTime: "2022-03-24T10:22:23+00:00",
    });
  });

  test("keeps false apart from null: never tagged (wallabag/rulerz) against no metadata (acme/path-lib)", () => {
    const rulerz = pinnedFacts(
      finding(WALLABAG_013, "wallabag/rulerz"),
      details(WALLABAG_013, "wallabag/rulerz"),
    );
    const pathLib = pinnedFacts(finding(EDGES, "acme/path-lib"), details(EDGES, "acme/path-lib"));
    expect(rulerz?.hasStableRelease).toBe(false);
    expect(rulerz?.lastStableVersion).toBeNull();
    expect(pathLib?.hasStableRelease).toBeNull();
    expect(pathLib?.snapshotTime).toBe("2025-06-01T12:00:00+00:00");
  });

  test("reads no_stable_release as a known reason with no snapshot time (acme/untagged)", () => {
    const facts = pinnedFacts(finding(EDGES, "acme/untagged"), details(EDGES, "acme/untagged"));
    expect(facts?.reason).toEqual({ raw: "no_stable_release", known: true });
    expect(facts?.hasStableRelease).toBe(false);
    expect(facts?.snapshotTime).toBeNull();
    expect(facts?.version).toBe("1.0.0");
  });

  test("keeps a reason it does not know as written, flagged unknown", () => {
    const facts = pinnedFacts(
      makeFinding({
        verdict: "pinned",
        signals: [
          makeSignal({ id: "S6", summary: "the installed version was yanked", data: { reason: "yanked" } }),
        ],
      }),
      null,
    );
    expect(facts?.reason).toEqual({ raw: "yanked", known: false });
    expect(facts?.summary).toBe("the installed version was yanked");
  });

  test("leaves every 0.13 key absent on an older document's S6 with no details to fall back to", () => {
    const facts = pinnedFacts(
      makeFinding({ verdict: "pinned", signals: [makeSignal({ id: "S6", data: { version: "dev-main" } })] }),
      null,
    );
    expect(facts).toEqual({ version: "dev-main", summary: "example signal" });
    expect(facts !== null && "reason" in facts).toBe(false);
    expect(facts !== null && "hasStableRelease" in facts).toBe(false);
  });

  test("falls back to the explain metadata, and to the lock's time for a snapshot, when S6 does not carry them", () => {
    const facts = pinnedFacts(
      finding(WALLABAG_011, "friendsofsymfony/oauth-server-bundle"),
      details(WALLABAG_011, "friendsofsymfony/oauth-server-bundle"),
    );
    expect(facts?.reason).toBeUndefined();
    expect(facts?.hasStableRelease).toBe(true);
    expect(facts?.lastStableVersion).toBe("1.6.2");
    expect(facts?.lastStableRelease).toBe("2019-01-23T15:23:04+00:00");
    expect(facts?.snapshotTime).toBe("2022-03-24T10:22:23+00:00");
  });

  test("prefers S6's own data over the metadata", () => {
    const facts = pinnedFacts(
      makeFinding({
        verdict: "pinned",
        signals: [makeSignal({ id: "S6", data: { reason: "branch_snapshot", has_stable_release: null } })],
      }),
      { ...withLock(lock()), metadata: makeMetadata({ hasStableRelease: true, lastStableVersion: "9.9.9" }) },
    );
    expect(facts?.hasStableRelease).toBeNull();
    expect(facts?.lastStableVersion).toBe("9.9.9");
  });

  test("reads a value of the wrong type as no answer, never as true or false", () => {
    const facts = pinnedFacts(
      makeFinding({
        verdict: "pinned",
        signals: [
          makeSignal({
            id: "S6",
            data: { reason: 7, has_stable_release: "yes", last_stable_version: 2, snapshot_time: false },
          }),
        ],
      }),
      null,
    );
    expect(facts?.reason).toBeUndefined();
    expect(facts?.hasStableRelease).toBeNull();
    expect(facts?.lastStableVersion).toBeNull();
    expect(facts?.snapshotTime).toBeNull();
  });

  test("is null for a finding with no S6 whose verdict is not pinned", () => {
    expect(pinnedFacts(makeFinding({ verdict: "stale" }), null)).toBeNull();
  });

  test("a pinned verdict with no S6 still has facts, the version the finding's own", () => {
    expect(pinnedFacts(makeFinding({ verdict: "pinned", version: "dev-x" }), null)).toEqual({
      version: "dev-x",
      summary: null,
    });
  });
});

describe("pinnedKind", () => {
  test("names the known reasons", () => {
    const snapshot = pinnedFacts(finding(WALLABAG_013, "wallabag/rulerz"), null);
    const untagged = pinnedFacts(finding(EDGES, "acme/untagged"), null);
    expect(snapshot && pinnedKind(snapshot, null)).toBe("snapshot");
    expect(untagged && pinnedKind(untagged, null)).toBe("untagged");
  });

  test("an older document is a snapshot unless its lock says the version is not a branch", () => {
    const facts = { version: "1.0.0", summary: null };
    expect(pinnedKind(facts, null)).toBe("snapshot");
    expect(pinnedKind(facts, lock({ branchSnapshot: true }))).toBe("snapshot");
    expect(pinnedKind(facts, lock({ branchSnapshot: null }))).toBe("snapshot");
    expect(pinnedKind(facts, lock({ branchSnapshot: false }))).toBe("other");
  });

  test("a reason it does not know is other, whatever the lock says", () => {
    const facts = { version: "1.0.0", summary: "x", reason: { raw: "yanked", known: false } };
    expect(pinnedKind(facts, lock({ branchSnapshot: true }))).toBe("other");
  });
});

describe("the answer's pinned clause", () => {
  test("a snapshot of a package with no tagged release (wallabag/rulerz, 0.13)", () => {
    expect(sentence(WALLABAG_013, "wallabag/rulerz")).toBe(
      "Pinned to dev-master, a branch snapshot of a package with no tagged release. You require it directly.",
    );
  });

  test("a snapshot beside the newest dated tag (friendsofsymfony/oauth-server-bundle, rector/rector)", () => {
    expect(sentence(WALLABAG_013, "friendsofsymfony/oauth-server-bundle")).toMatch(
      /^Pinned to dev-master, a branch snapshot rather than a release; its newest dated tag is 1\.6\.2 \(2019-01-23\)\./,
    );
    expect(sentence(MAUTIC_013, "rector/rector")).toMatch(
      /^Pinned to dev-main, a branch snapshot rather than a release; its newest dated tag is 2\.6\.7 \(2026-09-13\)\./,
    );
  });

  test("no repository metadata says nothing about tags (acme/path-lib, mautic/core-lib)", () => {
    expect(sentence(EDGES, "acme/path-lib")).toMatch(
      /^Pinned to dev-main, a branch snapshot rather than a release\. /,
    );
    expect(sentence(MAUTIC_013, "mautic/core-lib")).toMatch(
      /^Pinned to 7\.0\.0-dev, a branch snapshot rather than a release\. /,
    );
  });

  test("a tagged-looking version in a repository with no tag is not called a snapshot (acme/untagged)", () => {
    const text = sentence(EDGES, "acme/untagged");
    expect(text).toMatch(/^Installed 1\.0\.0, but its repository lists no tag\. /);
    expect(text).not.toContain("snapshot");
    expect(sentence(EDGES_LOCK_ONLY, "acme/untagged")).toMatch(
      /^Installed 1\.0\.0, but its repository lists no tag\. /,
    );
  });

  test("a reason it does not know quotes S6's summary as written", () => {
    const text = answerText(
      answerParts({
        finding: makeFinding({
          verdict: "pinned",
          signals: [
            makeSignal({
              id: "S6",
              summary: "the installed version was yanked.",
              data: { reason: "yanked" },
            }),
          ],
        }),
        details: withLock(lock({ branchSnapshot: true })),
        metadataReplacement: null,
        thresholds: THRESHOLDS,
      }),
    );
    expect(text).toBe("Pinned: the installed version was yanked. You require it directly.");
  });

  test("an older document keeps today's words, whatever its metadata says about tags", () => {
    expect(sentence(WALLABAG_011, "wallabag/rulerz")).toBe(
      "Pinned to dev-master, a branch snapshot rather than a release. You require it directly.",
    );
    expect(sentence(WALLABAG_011, "friendsofsymfony/oauth-server-bundle")).toMatch(
      /^Pinned to dev-master, a branch snapshot rather than a release\. /,
    );
    expect(sentence(MAUTIC_011, "rector/rector")).toMatch(
      /^Pinned to dev-main, a branch snapshot rather than a release\. /,
    );
  });

  test("an older document whose lock says not a branch is not called a snapshot", () => {
    const f = makeFinding({
      verdict: "pinned",
      signals: [makeSignal({ id: "S6", summary: "no stable release", data: { version: "1.0.0" } })],
    });
    const text = answerText(
      answerParts({
        finding: f,
        details: withLock(lock({ branchSnapshot: false })),
        metadataReplacement: null,
        thresholds: THRESHOLDS,
      }),
    );
    expect(text).toBe("Pinned: no stable release. You require it directly.");
  });

  test("a pinned verdict with no S6 and a lock that says not a branch names the version only", () => {
    const text = answerText(
      answerParts({
        finding: makeFinding({ verdict: "pinned", version: "1.2.3" }),
        details: withLock(lock({ branchSnapshot: false })),
        metadataReplacement: null,
        thresholds: THRESHOLDS,
      }),
    );
    expect(text).toBe("Pinned to 1.2.3. You require it directly.");
  });
});

describe("pinnedReleaseSlot: the key facts' release slot", () => {
  test("never tagged, or an older document: none, a snapshot", () => {
    expect(slot(WALLABAG_013, "wallabag/rulerz")).toBe("none, a snapshot");
    expect(slot(WALLABAG_011, "wallabag/rulerz")).toBe("none, a snapshot");
    expect(slot(MAUTIC_011, "rector/rector")).toBe("none, a snapshot");
    expect(slot(KOEL_013, "roave/security-advisories")).toBe("none, a snapshot");
  });

  test("a snapshot of a tagged package, or of one with no metadata, does not say none", () => {
    expect(slot(MAUTIC_013, "rector/rector")).toBe("a snapshot");
    expect(slot(WALLABAG_013, "friendsofsymfony/oauth-server-bundle")).toBe("a snapshot");
    expect(slot(EDGES, "acme/path-lib")).toBe("a snapshot");
    expect(slot(MAUTIC_013, "mautic/core-lib")).toBe("a snapshot");
  });

  test("no tag at all, and not a snapshot: none tagged (acme/untagged)", () => {
    expect(slot(EDGES, "acme/untagged")).toBe("none tagged");
  });

  test("a reason it does not know: a snapshot only when the lock says so, else the slot's usual reading", () => {
    const facts = { version: "1.0.0", summary: "x", reason: { raw: "yanked", known: false } };
    expect(pinnedReleaseSlot(facts, lock({ branchSnapshot: true }))).toBe("a snapshot");
    expect(pinnedReleaseSlot(facts, lock({ branchSnapshot: false }))).toBeNull();
    expect(pinnedReleaseSlot(facts, null)).toBeNull();
  });
});

describe("pinnedRunReason and pinnedContextReason", () => {
  test("a run of snapshots, of untagged packages, and a mixed or unknown one", () => {
    expect(pinnedRunReason("snapshot")).toBe("pinned to a branch snapshot");
    expect(pinnedRunReason("untagged")).toBe("without a tag in their repositories");
    expect(pinnedRunReason(null)).toBe("pinned");
  });

  test("an age cell's context reason", () => {
    expect(pinnedContextReason("snapshot")).toBe("flagged for being pinned to a branch snapshot");
    expect(pinnedContextReason("untagged")).toBe("flagged because its repository lists no tag");
    expect(pinnedContextReason("other")).toBe("flagged as pinned");
  });

  test("runFacts names the kind every member of a pinned run shares (wallabag rulerz, 0.13)", () => {
    const run = ["wallabag/rulerz", "wallabag/rulerz-bundle", "wallabag/rulerz-bridge"].map((p) =>
      finding(WALLABAG_013, p),
    );
    expect(runFacts(run, THRESHOLDS, WALLABAG_013.details).pinned).toBe("snapshot");
    expect(runFacts(run, THRESHOLDS).pinned).toBe("snapshot");
  });

  test("runFacts: an untagged run, a mixed run, and a run that is not pinned", () => {
    const untagged = (pkg: string) =>
      makeFinding({
        package: pkg,
        verdict: "pinned",
        signals: [makeSignal({ id: "S6", data: { reason: "no_stable_release", has_stable_release: false } })],
      });
    const snapshot = makeFinding({
      package: "acme/c",
      verdict: "pinned",
      signals: [makeSignal({ id: "S6", data: { reason: "branch_snapshot" } })],
    });
    expect(runFacts([untagged("acme/a"), untagged("acme/b")], THRESHOLDS).pinned).toBe("untagged");
    expect(runFacts([untagged("acme/a"), snapshot], THRESHOLDS).pinned).toBeNull();
    expect(runFacts([makeFinding({ verdict: "stale" })], THRESHOLDS).pinned).toBeNull();
  });
});

describe("documents written before 0.13.0 keep today's words", () => {
  const OLD = readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".json") && !name.includes("-0.13"));

  test.each(OLD)("%s: every S6 or pinned finding reads as a snapshot, in the words it had", (name) => {
    const model = load(name);
    for (const f of model.report.findings) {
      const d = details(model, f.package);
      const facts = pinnedFacts(f, d);
      if (facts === null) continue;
      expect(facts.reason, f.package).toBeUndefined();
      expect(pinnedKind(facts, d?.lock ?? null), f.package).toBe("snapshot");
      expect(pinnedReleaseSlot(facts, d?.lock ?? null), f.package).toBe("none, a snapshot");
      if (f.verdict === "pinned") {
        const version = facts.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(sentence(model, f.package), f.package).toMatch(
          new RegExp(`^Pinned to ${version}, a branch snapshot rather than a release\\. `),
        );
      }
    }
  });
});
