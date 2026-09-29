/**
 * S6's facts (`domain/pinned.ts`) and every sentence the page words from them. Every document is
 * read one way: S6's own field first, then the explain field that states the same fact.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { answerParts, answerText } from "../../../src/domain/answer";
import {
  lockTimeLabel,
  pinnedContextReason,
  pinnedFacts,
  pinnedKind,
  pinnedReleaseSlot,
  pinnedRunReason,
  readPinnedFacts,
  snapshotOf,
  type PinnedFacts,
  type PinnedSlot,
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
const KOEL_011 = load("koel_koel.json");
const CAPSULE = load("capsule-0.10-drupal.json");
const NO_DETAILS = load("synthetic-no-details.json");

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

function slot(model: Model, pkg: string): PinnedSlot | null {
  const d = details(model, pkg);
  const read = pinnedFacts(finding(model, pkg), d);
  if (read === null) throw new Error(`${pkg} has no S6 facts`);
  return pinnedReleaseSlot(read);
}

function facts(overrides: Partial<PinnedFacts> = {}): PinnedFacts {
  return {
    version: "1.0.0",
    summary: null,
    reason: null,
    hasStableRelease: null,
    lastStableVersion: null,
    lastStableRelease: null,
    lastStableDatedBy: null,
    branchSnapshot: null,
    snapshotTime: null,
    ...overrides,
  };
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
      branchSnapshot: true,
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

  test("an S6 that states nothing, with no details, says nothing: every fact is null", () => {
    const read = pinnedFacts(
      makeFinding({ verdict: "pinned", signals: [makeSignal({ id: "S6", data: { version: "dev-main" } })] }),
      null,
    );
    expect(read).toEqual(facts({ version: "dev-main", summary: "example signal" }));
  });

  test("reads the same facts from the explain data where S6 does not carry them (wallabag 0.11 against 0.13)", () => {
    const pkg = "friendsofsymfony/oauth-server-bundle";
    const old = pinnedFacts(finding(WALLABAG_011, pkg), details(WALLABAG_011, pkg));
    const current = pinnedFacts(finding(WALLABAG_013, pkg), details(WALLABAG_013, pkg));
    expect(old?.reason).toBeNull();
    expect(old).toEqual({ ...current, reason: null });
  });

  test("the lock says whether the version is a branch when S6 names no reason, or one it does not know", () => {
    const s6 = (data: Record<string, unknown>) =>
      makeFinding({ verdict: "pinned", signals: [makeSignal({ id: "S6", data })] });
    expect(readPinnedFacts(s6({}), withLock(lock({ branchSnapshot: false }))).branchSnapshot).toBe(false);
    expect(readPinnedFacts(s6({ reason: "yanked" }), withLock(lock())).branchSnapshot).toBe(true);
    expect(readPinnedFacts(s6({ reason: "no_stable_release" }), withLock(lock())).branchSnapshot).toBe(false);
    expect(readPinnedFacts(s6({}), withLock(lock({ branchSnapshot: null }))).branchSnapshot).toBeNull();
  });

  test("a finding without S6 is not a branch: lockrot fires S6 on every snapshot", () => {
    const none = makeFinding({ verdict: "stale", signals: [makeSignal({ id: "S2" })] });
    expect(readPinnedFacts(none, null).branchSnapshot).toBe(false);
    expect(readPinnedFacts(none, withLock(lock())).branchSnapshot).toBe(false);
    expect(readPinnedFacts(none, withLock(lock())).snapshotTime).toBeNull();
  });

  test("dates a snapshot by S6's own time, else by the lock's only where the lock says it is a branch", () => {
    const f = makeFinding({ verdict: "pinned", signals: [makeSignal({ id: "S6", data: {} })] });
    expect(readPinnedFacts(f, withLock(lock())).snapshotTime).toBe("2024-01-01T00:00:00+00:00");
    expect(readPinnedFacts(f, withLock(lock({ branchSnapshot: false }))).snapshotTime).toBeNull();
    const own = makeFinding({
      verdict: "pinned",
      signals: [makeSignal({ id: "S6", data: { snapshot_time: "2025-01-01T00:00:00+00:00" } })],
    });
    expect(readPinnedFacts(own, withLock(lock())).snapshotTime).toBe("2025-01-01T00:00:00+00:00");
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
    expect(facts?.reason).toBeNull();
    expect(facts?.hasStableRelease).toBeNull();
    expect(facts?.lastStableVersion).toBeNull();
    expect(facts?.snapshotTime).toBeNull();
  });

  test("is null for a finding with no S6 whose verdict is not pinned", () => {
    expect(pinnedFacts(makeFinding({ verdict: "stale" }), null)).toBeNull();
  });

  test("a pinned verdict with no S6 still has facts, the version the finding's own and no branch", () => {
    expect(pinnedFacts(makeFinding({ verdict: "pinned", version: "dev-x" }), null)).toEqual(
      facts({ version: "dev-x", branchSnapshot: false }),
    );
  });
});

describe("pinnedKind", () => {
  test("names the known reasons", () => {
    const snapshot = pinnedFacts(finding(WALLABAG_013, "wallabag/rulerz"), null);
    const untagged = pinnedFacts(finding(EDGES, "acme/untagged"), null);
    expect(snapshot && pinnedKind(snapshot)).toBe("snapshot");
    expect(untagged && pinnedKind(untagged)).toBe("untagged");
  });

  test("without a reason, reads the fields that state the same facts", () => {
    expect(pinnedKind(facts({ branchSnapshot: true }))).toBe("snapshot");
    expect(pinnedKind(facts({ branchSnapshot: false, hasStableRelease: false }))).toBe("untagged");
    expect(pinnedKind(facts({ branchSnapshot: false, hasStableRelease: true }))).toBe("other");
    expect(pinnedKind(facts({ branchSnapshot: false, hasStableRelease: null }))).toBe("other");
  });

  test("a fact no field states is not guessed: nothing said about the branch is other", () => {
    expect(pinnedKind(facts())).toBe("other");
    expect(pinnedKind(facts({ hasStableRelease: false }))).toBe("other");
  });

  test("a reason it does not know is other, whatever the lock says", () => {
    expect(pinnedKind(facts({ reason: { raw: "yanked", known: false }, branchSnapshot: true }))).toBe(
      "other",
    );
  });
});

describe("the answer's pinned clause", () => {
  test("a snapshot of a package with no tagged release (wallabag/rulerz, 0.13)", () => {
    expect(sentence(WALLABAG_013, "wallabag/rulerz")).toBe(
      "Pinned to dev-master, a branch snapshot of a package with no tagged release. You require it directly.",
    );
  });

  test("a snapshot of a tagged package names no tag or date: the Provenance 'newest dated tag' line is the one place (plan B2)", () => {
    // The newest dated tag may be dated by a monorepo parent (`last_stable_dated_by`), and the panel
    // already names it "newest dated tag" once; the answer does not give it a second name or date.
    for (const [model, pkg, version] of [
      [WALLABAG_013, "friendsofsymfony/oauth-server-bundle", "dev-master"],
      [MAUTIC_013, "rector/rector", "dev-main"],
    ] as const) {
      const text = sentence(model, pkg);
      expect(text).toMatch(new RegExp(`^Pinned to ${version}, a branch snapshot rather than a release\\. `));
      expect(text).not.toMatch(/tag|\d{4}-\d{2}-\d{2}/);
    }
  });

  test("a tag another package dates is named nowhere in the answer (last_stable_dated_by)", () => {
    const text = answerText(
      answerParts({
        finding: makeFinding({
          verdict: "pinned",
          signals: [
            makeSignal({
              id: "S6",
              data: {
                version: "dev-main",
                reason: "branch_snapshot",
                has_stable_release: true,
                last_stable_version: "7.1.0",
                last_stable_release: "2026-01-01T00:00:00+00:00",
                last_stable_dated_by: "acme/monorepo",
                snapshot_time: "2026-02-01T00:00:00+00:00",
              },
            }),
          ],
        }),
        details: withLock(lock({ branchSnapshot: true })),
        metadataReplacement: null,
        thresholds: THRESHOLDS,
      }),
    );
    expect(text).toBe(
      "Pinned to dev-main, a branch snapshot rather than a release. You require it directly.",
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

  test("an S6 with no reason, a lock that says not a branch and a repository with no tag is untagged", () => {
    const text = answerText(
      answerParts({
        finding: makeFinding({
          verdict: "pinned",
          signals: [makeSignal({ id: "S6", summary: "no stable release", data: { version: "1.0.0" } })],
        }),
        details: {
          ...withLock(lock({ branchSnapshot: false })),
          metadata: makeMetadata({ hasStableRelease: false }),
        },
        metadataReplacement: null,
        thresholds: THRESHOLDS,
      }),
    );
    expect(text).toBe("Installed 1.0.0, but its repository lists no tag. You require it directly.");
  });

  test("an S6 that states no case, with nothing else that does, quotes its summary", () => {
    const text = answerText(
      answerParts({
        finding: makeFinding({
          verdict: "pinned",
          signals: [makeSignal({ id: "S6", summary: "no stable release", data: { version: "1.0.0" } })],
        }),
        details: null,
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
  const NONE_SNAPSHOT = { label: "release", words: "none, a snapshot" } as const;

  test("never tagged: none, a snapshot, dated by the commit", () => {
    expect(slot(WALLABAG_013, "wallabag/rulerz")).toEqual({
      ...NONE_SNAPSHOT,
      commit: "2023-12-24T00:53:44+00:00",
    });
    expect(slot(KOEL_013, "roave/security-advisories")).toEqual({
      ...NONE_SNAPSHOT,
      commit: "2026-05-22T16:47:49+00:00",
    });
  });

  test("a snapshot of a tagged package or of one with no metadata: a Snapshot slot, never a release", () => {
    expect(slot(MAUTIC_013, "rector/rector")).toEqual({
      label: "snapshot",
      commit: "2026-08-04T09:29:27+00:00",
    });
    expect(slot(WALLABAG_013, "friendsofsymfony/oauth-server-bundle")).toEqual({
      label: "snapshot",
      commit: "2022-03-24T10:22:23+00:00",
    });
    expect(slot(EDGES, "acme/path-lib")).toEqual({ label: "snapshot", commit: "2025-06-01T12:00:00+00:00" });
    // The lock carries no time: no date, and none borrowed from anywhere else.
    expect(slot(MAUTIC_013, "mautic/core-lib")).toEqual({ label: "snapshot", commit: null });
  });

  test("no tag at all, and not a snapshot: none tagged, and no date (acme/untagged's lock time is no release)", () => {
    expect(slot(EDGES, "acme/untagged")).toEqual({ label: "release", words: "none tagged", commit: null });
    expect(slot(EDGES_LOCK_ONLY, "acme/untagged")).toEqual({
      label: "release",
      words: "none tagged",
      commit: null,
    });
  });

  test("a reason it does not know: a snapshot only when the lock says so, else the slot's usual reading", () => {
    const yanked = facts({ reason: { raw: "yanked", known: false } });
    expect(pinnedReleaseSlot({ ...yanked, branchSnapshot: true })).toEqual({
      label: "snapshot",
      commit: null,
    });
    expect(
      pinnedReleaseSlot({ ...yanked, branchSnapshot: true, snapshotTime: "2024-01-01T00:00:00+00:00" }),
    ).toEqual({ label: "snapshot", commit: "2024-01-01T00:00:00+00:00" });
    expect(pinnedReleaseSlot({ ...yanked, branchSnapshot: false })).toBeNull();
    expect(pinnedReleaseSlot(yanked)).toBeNull();
  });

  test("a never-tagged snapshot with no known commit carries a null commit", () => {
    expect(pinnedReleaseSlot(facts({ branchSnapshot: true, hasStableRelease: false }))).toEqual({
      ...NONE_SNAPSHOT,
      commit: null,
    });
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

describe("one reading for every document", () => {
  test.each([
    ["wallabag", WALLABAG_011, WALLABAG_013],
    ["mautic", MAUTIC_011, MAUTIC_013],
  ] as const)(
    "%s: the older and the 0.13 document word every pinned package the same",
    (_name, old, current) => {
      const pinned = current.report.findings.filter((f) => f.verdict === "pinned");
      expect(pinned.length).toBeGreaterThan(0);
      for (const f of pinned) {
        expect(sentence(old, f.package), f.package).toBe(sentence(current, f.package));
        expect(slot(old, f.package), f.package).toEqual(slot(current, f.package));
        const oldFacts = pinnedFacts(finding(old, f.package), details(old, f.package));
        const newFacts = pinnedFacts(f, details(current, f.package));
        expect(oldFacts && pinnedKind(oldFacts), f.package).toBe(newFacts && pinnedKind(newFacts));
      }
    },
  );

  test("an older snapshot of a never-tagged package gets the words and the commit date a 0.13 one gets", () => {
    expect(sentence(WALLABAG_011, "wallabag/rulerz")).toBe(
      "Pinned to dev-master, a branch snapshot of a package with no tagged release. You require it directly.",
    );
    expect(slot(WALLABAG_011, "wallabag/rulerz")).toEqual({
      label: "release",
      words: "none, a snapshot",
      commit: "2023-12-24T00:53:44+00:00",
    });
  });

  test("an older snapshot whose metadata names a tag gets the Snapshot slot a 0.13 one gets", () => {
    expect(slot(MAUTIC_011, "rector/rector")).toEqual({
      label: "snapshot",
      commit: "2026-08-04T09:29:27+00:00",
    });
  });

  test("capsule-0.10-drupal: a snapshot with no repository metadata says nothing about tags", () => {
    expect(slot(CAPSULE, "drupal/core")).toEqual({ label: "snapshot", commit: null });
    expect(sentence(CAPSULE, "drupal/core")).toMatch(
      /^Pinned to dev-main, a branch snapshot rather than a release\. /,
    );
  });

  test("an S6 with no reason and no details states no case (koel 0.11, synthetic-no-details)", () => {
    for (const model of [KOEL_011, NO_DETAILS]) {
      const read = pinnedFacts(finding(model, "roave/security-advisories"), null);
      expect(read && pinnedKind(read)).toBe("other");
      expect(read && pinnedReleaseSlot(read)).toBeNull();
    }
    const current = pinnedFacts(finding(KOEL_013, "roave/security-advisories"), null);
    expect(current && pinnedKind(current)).toBe("snapshot");
  });

  test("snapshotOf gives the release-branches block the commit the slot dates", () => {
    expect(snapshotOf(finding(MAUTIC_011, "rector/rector"), details(MAUTIC_011, "rector/rector"))).toEqual({
      time: "2026-08-04T09:29:27+00:00",
      php: "^7.4|^8.0",
    });
    expect(snapshotOf(finding(EDGES, "acme/untagged"), details(EDGES, "acme/untagged"))).toBeNull();
  });
});

describe("lockTimeLabel", () => {
  test("a branch snapshot's lock time is its commit's date, on every document", () => {
    for (const [model, pkg] of [
      [MAUTIC_013, "rector/rector"],
      [MAUTIC_011, "rector/rector"],
      [WALLABAG_013, "wallabag/rulerz"],
      [WALLABAG_011, "wallabag/rulerz"],
      [EDGES, "acme/path-lib"],
    ] as const) {
      expect(lockTimeLabel(finding(model, pkg), details(model, pkg))).toBe("snapshot dated");
    }
  });

  test("a version with no tag in its repository has a lock time that is neither a release nor a commit", () => {
    expect(lockTimeLabel(finding(EDGES, "acme/untagged"), details(EDGES, "acme/untagged"))).toBe("lock time");
  });

  test("any other version was released then", () => {
    expect(lockTimeLabel(finding(EDGES, "acme/left"), details(EDGES, "acme/left"))).toBe("released");
    expect(lockTimeLabel(makeFinding({ verdict: "stale" }), withLock(lock({ branchSnapshot: false })))).toBe(
      "released",
    );
  });
});
