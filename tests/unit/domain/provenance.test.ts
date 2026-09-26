import { describe, expect, it } from "vitest";
import type { Model, PackageDetails } from "../../../src/model/types";
import {
  NO_FACTS_FOR_PACKAGE,
  NO_FACTS_IN_FILE,
  NOT_FROM_COMPOSER,
  provenance,
  quietUnread,
} from "../../../src/domain/provenance";
import { makeFinding, makeMetadata, makeModel, makeSignal } from "./fixtures";

const LOCK = {
  php: null,
  released: null,
  repository: null,
  fromComposerRepository: true,
  dev: false,
  branchSnapshot: false,
  type: null,
};

function withDetails(model: Model, entries: Record<string, Partial<PackageDetails>>): Model {
  const details = new Map(
    Object.entries(entries).map(([name, entry]) => [
      name,
      { metadata: null, lock: LOCK, activity: null, repositoryLink: null, ...entry },
    ]),
  );
  return { ...model, details };
}

const S4 = makeSignal({
  id: "S4",
  level: "high",
  data: { last_push: "2018-06-25T10:20:17+00:00", repo: "DaveRandom/Resume", host: "github.com", years: 8.2 },
});

describe("provenance — package metadata", () => {
  it("reads the metadata and its own date when the file carries it", () => {
    const finding = makeFinding({ dataDate: "2026-01-01T00:00:00Z" });
    const metadata = makeMetadata({ dataDate: "2026-02-02T00:00:00Z" });
    const model = withDetails(makeModel([finding]), { [finding.package]: { metadata } });
    expect(provenance(model, finding).metadata).toEqual({
      kind: "read",
      metadata,
      asOf: "2026-02-02T00:00:00Z",
    });
  });

  it("says a package from outside a Composer repository has no metadata, from the lock entry", () => {
    const finding = makeFinding();
    const model = withDetails(makeModel([finding]), {
      [finding.package]: { lock: { ...LOCK, fromComposerRepository: false } },
    });
    expect(provenance(model, finding).metadata).toEqual({
      kind: "missing",
      asOf: null,
      reason: NOT_FROM_COMPOSER,
    });
  });

  it("tells a file that explains no package from one that only skips this one", () => {
    const finding = makeFinding({ dataDate: "2026-09-24T00:00:00Z" });
    const empty = makeModel([finding]);
    expect(provenance(empty, finding).metadata).toEqual({
      kind: "missing",
      asOf: "2026-09-24T00:00:00Z",
      reason: NO_FACTS_IN_FILE,
    });
    const other = withDetails(empty, { "other/pkg": {} });
    expect(provenance(other, finding).metadata).toMatchObject({ reason: NO_FACTS_FOR_PACKAGE });
  });

  it("says none was recorded when the entry is there and the package is from a Composer repository", () => {
    const finding = makeFinding();
    const model = withDetails(makeModel([finding]), { [finding.package]: {} });
    expect(provenance(model, finding).metadata).toMatchObject({ reason: "none recorded for this package" });
  });
});

describe("provenance — repository activity", () => {
  it("reads the activity block when the file carries one", () => {
    const finding = makeFinding();
    const activity = {
      forge: "GitHub",
      repository: "acme/widget",
      archived: false,
      pushedAt: null,
      fetchedAt: null,
      fromCache: false,
    };
    const model = withDetails(makeModel([finding]), { [finding.package]: { activity } });
    expect(provenance(model, finding).activity).toEqual({ kind: "read", activity });
  });

  it("reads a fired S4's own data when the file has no details, S3 quiet meaning not archived", () => {
    const finding = makeFinding({ signals: [S4] });
    expect(provenance(makeModel([finding]), finding).activity).toEqual({
      kind: "signal",
      from: ["S4"],
      host: "github.com",
      repository: "DaveRandom/Resume",
      lastPush: "2018-06-25T10:20:17+00:00",
      archived: false,
    });
  });

  it("names both checks when S3 fired too, and says archived", () => {
    const s3 = makeSignal({ id: "S3", level: "high", data: { repo: "acme/widget", host: "github.com" } });
    const finding = makeFinding({ signals: [s3] });
    expect(provenance(makeModel([finding]), finding).activity).toEqual({
      kind: "signal",
      from: ["S3"],
      host: "github.com",
      repository: "acme/widget",
      lastPush: null,
      archived: true,
    });
  });

  it("says why there is none: no facts, not from a Composer repository, S10, or nothing recorded", () => {
    const finding = makeFinding();
    expect(provenance(makeModel([finding]), finding).activity).toEqual({
      kind: "missing",
      reason: NO_FACTS_IN_FILE,
    });

    const notComposer = withDetails(makeModel([finding]), {
      [finding.package]: { lock: { ...LOCK, fromComposerRepository: false } },
    });
    expect(provenance(notComposer, finding).activity).toEqual({ kind: "missing", reason: NOT_FROM_COMPOSER });

    const s10 = makeSignal({ id: "S10", data: { unchecked: [{ reason: "offline", blocks: ["S3", "S4"] }] } });
    const blocked = makeFinding({ signals: [s10] });
    const blockedModel = withDetails(makeModel([blocked]), { [blocked.package]: {} });
    expect(provenance(blockedModel, blocked).activity).toEqual({
      kind: "missing",
      reason: "none — S10 says S3 and S4 could not run",
    });

    const plain = withDetails(makeModel([finding]), { [finding.package]: {} });
    expect(provenance(plain, finding).activity).toEqual({
      kind: "missing",
      reason: "none recorded for this package",
    });
  });
});

describe("quietUnread", () => {
  it("names the quiet S3/S4 of a package the file holds no activity for, and why", () => {
    const finding = makeFinding({ signals: [makeSignal({ id: "S6", level: "warn" })] });
    const notComposer = withDetails(makeModel([finding]), {
      [finding.package]: { lock: { ...LOCK, fromComposerRepository: false } },
    });
    expect(quietUnread(notComposer, finding)).toEqual({
      ids: ["S3", "S4"],
      because: "the package is not from a Composer repository",
    });
    expect(quietUnread(makeModel([finding]), finding)).toEqual({
      ids: ["S3", "S4"],
      because: "the file explains no package",
    });
    const plain = withDetails(makeModel([finding]), { [finding.package]: {} });
    expect(quietUnread(plain, finding)?.because).toBe("none is recorded for this package");
  });

  it("is null when activity is on file, from the details or a fired S3/S4", () => {
    const finding = makeFinding();
    const activity = {
      forge: "GitHub",
      repository: "acme/widget",
      archived: false,
      pushedAt: null,
      fetchedAt: null,
      fromCache: false,
    };
    const read = withDetails(makeModel([finding]), { [finding.package]: { activity } });
    expect(quietUnread(read, finding)).toBeNull();
    const fired = makeFinding({ signals: [S4] });
    expect(quietUnread(makeModel([fired]), fired)).toBeNull();
  });

  it("leaves out an activity check that could not run: S10 already says so", () => {
    const s10 = makeSignal({ id: "S10", data: { unchecked: [{ reason: "offline", blocks: ["S4"] }] } });
    const finding = makeFinding({ signals: [s10] });
    const model = withDetails(makeModel([finding]), { [finding.package]: {} });
    expect(quietUnread(model, finding)?.ids).toEqual(["S3"]);
  });
});
