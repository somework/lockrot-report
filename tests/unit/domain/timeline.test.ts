import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agePhrase,
  branchVersionKey,
  sameVersion,
  sortLanes,
  timelineModel,
  type TimelineModel,
} from "../../../src/domain/timeline";
import type { BranchRow, ExplainLock } from "../../../src/model/types";
import { normalize } from "../../../src/model/normalize";

function makeBranch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    branch: "1.x",
    installed: false,
    highest: "1.0.0",
    highestReleased: null,
    highestCommitDate: null,
    newestDated: null,
    newestDatedReleased: null,
    datedBy: null,
    php: null,
    ...overrides,
  };
}

function makeLock(overrides: Partial<ExplainLock> = {}): ExplainLock {
  return {
    php: null,
    released: null,
    repository: null,
    fromComposerRepository: true,
    dev: false,
    branchSnapshot: false,
    type: null,
    ...overrides,
  };
}

const NOW = new Date("2026-09-24T00:00:00.000Z");

/** A real fixture package's branches, lock and installed version, as the page normalizes them. */
function fixture(bundle: string, pkg: string) {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", `${bundle}.json`), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${bundle} failed to normalize`);
  const details = result.model.details.get(pkg);
  const finding = result.model.report.findings.find((f) => f.package === pkg);
  if (details === undefined || finding === undefined) throw new Error(`${pkg} not in ${bundle}`);
  return { branches: details.metadata?.branches ?? [], lock: details.lock, version: finding.version };
}

function model(bundle: string, pkg: string): TimelineModel {
  const { branches, lock, version } = fixture(bundle, pkg);
  const result = timelineModel(branches, lock, version, NOW);
  if (result === null) throw new Error(`${pkg} drew no timeline`);
  return result;
}

/** Each row as a short string: a lane's branch, or "fold:<which>:<count>". */
function rowShape(timeline: TimelineModel): string[] {
  return timeline.rows.map((row) =>
    row.kind === "lane" ? row.lane.branch : `fold:${row.which}:${String(row.lanes.length)}`,
  );
}

describe("branchVersionKey", () => {
  it("reads a branch name as version parts, a wildcard above every number", () => {
    expect(branchVersionKey("0.27.x")).toEqual([0, 27, Infinity]);
    expect(branchVersionKey("11.x")).toEqual([11, Infinity]);
    expect(branchVersionKey("0.0.3")).toEqual([0, 0, 3]);
    expect(branchVersionKey("v2.1")).toEqual([2, 1]);
  });

  it("returns null for a name that is not version-shaped", () => {
    for (const name of ["master", "dev-main", "3.x-dev", "", "release/1.0"]) {
      expect(branchVersionKey(name)).toBeNull();
    }
  });
});

describe("sortLanes", () => {
  it("orders by version, newest first, even when an older branch released last", () => {
    // Arrange: 3.x shipped a maintenance release after 4.x's last one — date order put it on top.
    const lanes = [
      { branch: "3.x", time: 300 },
      { branch: "10.x", time: 100 },
      { branch: "4.x", time: 200 },
      { branch: "0.9.x", time: 50 },
    ];

    // Act
    const { sorted, by } = sortLanes(lanes);

    // Assert: numeric, not lexical ("10.x" above "4.x"), and not by date.
    expect(by).toBe("version");
    expect(sorted.map((lane) => lane.branch)).toEqual(["10.x", "4.x", "3.x", "0.9.x"]);
  });

  it("falls back to date order for every lane when any name is not version-shaped", () => {
    // Arrange
    const lanes = [
      { branch: "2.x", time: 100 },
      { branch: "master", time: 300 },
      { branch: "1.x", time: 200 },
    ];

    // Act
    const { sorted, by } = sortLanes(lanes);

    // Assert
    expect(by).toBe("date");
    expect(sorted.map((lane) => lane.branch)).toEqual(["master", "1.x", "2.x"]);
  });

  it("breaks a version tie on date, then name, whatever the input order", () => {
    // Arrange: "2" and "v2" are the same version.
    const a = [
      { branch: "v2", time: 100 },
      { branch: "2", time: 200 },
    ];

    // Act / Assert
    expect(sortLanes(a).sorted.map((lane) => lane.branch)).toEqual(["2", "v2"]);
    expect(sortLanes([...a].reverse()).sorted.map((lane) => lane.branch)).toEqual(["2", "v2"]);
  });

  it("sorts the 21 meilisearch-php branches (koel_koel) highest version first", () => {
    // Act
    const timeline = model("koel_koel", "meilisearch/meilisearch-php");

    // Assert: "0.10.x" sorts above "0.9.x", which a string sort would not do.
    expect(timeline.sortedBy).toBe("version");
    expect(timeline.lanes.map((lane) => lane.branch).slice(0, 6)).toEqual([
      "1.x",
      "0.27.x",
      "0.26.x",
      "0.25.x",
      "0.24.x",
      "0.23.x",
    ]);
    expect(timeline.lanes.map((lane) => lane.branch).slice(-3)).toEqual(["0.10.x", "0.9.x", "0.8.x"]);
  });
});

describe("timelineModel / rows and folds", () => {
  it("meilisearch-php: every newer branch, yours, then the 16 older in one fold", () => {
    // Act
    const timeline = model("koel_koel", "meilisearch/meilisearch-php");

    // Assert
    expect(rowShape(timeline)).toEqual(["1.x", "0.27.x", "0.26.x", "0.25.x", "0.24.x", "fold:older:16"]);
    expect(timeline.mine?.branch).toBe("0.24.x");
    expect(timeline.newerCount).toBe(4);
    expect(timeline.top).toMatchObject({ branch: "1.x", newest: true, label: "v1.17.0" });
  });

  it("brick/math (mautic_mautic): more than four newer branches fold between the newest and yours", () => {
    // Act
    const timeline = model("mautic_mautic", "brick/math");

    // Assert
    expect(rowShape(timeline)).toEqual(["1.x", "fold:between:9", "0.11.x", "fold:older:10"]);
    expect(timeline.newerCount).toBe(10);
  });

  it("fewer than three older branches keep their own rows: a fold would cost as much as it hides", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "2.x", highestReleased: "2026-01-01T00:00:00Z" }),
      makeBranch({ branch: "1.x", installed: true, highestReleased: "2022-01-01T00:00:00Z" }),
      makeBranch({ branch: "0.9.x", highestReleased: "2020-01-01T00:00:00Z" }),
      makeBranch({ branch: "0.8.x", highestReleased: "2019-01-01T00:00:00Z" }),
    ];

    // Act
    const two = timelineModel(branches, null, "v1.0.0", NOW);
    const three = timelineModel(
      [...branches, makeBranch({ branch: "0.7.x", highestReleased: "2018-01-01T00:00:00Z" })],
      null,
      "v1.0.0",
      NOW,
    );

    // Assert
    expect(two && rowShape(two)).toEqual(["2.x", "1.x", "0.9.x", "0.8.x"]);
    expect(three && rowShape(three)).toEqual(["2.x", "1.x", "fold:older:3"]);
  });

  it("predis/predis (koel_koel): its two older branches stay two rows, not a '2 older' fold", () => {
    // Act
    const timeline = model("koel_koel", "predis/predis");

    // Assert
    expect(rowShape(timeline)).toEqual(["3.x", "2.x", "1.x", "0.8.x", "0.7.x"]);
  });

  it("daverandom/resume (koel_koel): two releases, the installed one on top, no newest marker", () => {
    // Act
    const timeline = model("koel_koel", "daverandom/resume");

    // Assert: the newest lane is the reader's own — nothing newer to point at.
    expect(rowShape(timeline)).toEqual(["0.0.3", "0.0.2"]);
    expect(timeline.releasesOnly).toBe(true);
    expect(timeline.newerCount).toBe(0);
    expect(timeline.lanes.some((lane) => lane.newest)).toBe(false);
  });

  it("rector/rector (mautic_mautic): a dev-main snapshot gets its own row from the lock, above the newest branch", () => {
    // Act
    const timeline = model("mautic_mautic", "rector/rector");

    // Assert
    expect(rowShape(timeline)).toEqual(["dev-main", "2.x", "fold:older:20"]);
    expect(timeline.mine).toMatchObject({
      branch: "dev-main",
      snapshot: true,
      installed: true,
      date: "2026-08-04T09:29:27+00:00",
      php: "^7.4|^8.0",
    });
  });

  it("draws a snapshot next to a single release branch (friendsofsymfony/oauth-server-bundle, wallabag)", () => {
    // Act
    const timeline = model("wallabag_wallabag", "friendsofsymfony/oauth-server-bundle");

    // Assert: one dated branch alone would draw nothing; with the snapshot there are two rows.
    expect(rowShape(timeline)).toEqual(["dev-master", "1.x"]);
  });

  it("draws nothing below two rows", () => {
    // Arrange
    const oneDated = [
      makeBranch({ highestReleased: "2020-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "2.x" }),
    ];

    // Act / Assert
    expect(timelineModel(oneDated, null, "1.0.0", NOW)).toBeNull();
    expect(timelineModel([], null, "1.0.0", NOW)).toBeNull();
    // A snapshot with no date of its own adds no row either.
    expect(timelineModel(oneDated, makeLock({ branchSnapshot: true }), "dev-main", NOW)).toBeNull();
  });

  it("with no installed branch and no snapshot, shows the newest and folds the rest", () => {
    // Arrange
    const branches = ["4.x", "3.x", "2.x", "1.x"].map((branch, index) =>
      makeBranch({ branch, highestReleased: `${String(2024 - index)}-01-01T00:00:00Z` }),
    );

    // Act
    const timeline = timelineModel(branches, null, "v9.9.9", NOW);

    // Assert
    expect(timeline && rowShape(timeline)).toEqual(["4.x", "fold:older:3"]);
    expect(timeline?.mine).toBeNull();
  });
});

describe("timelineModel / topReleasedLast", () => {
  it("is true when the highest version also released last", () => {
    // Act
    const timeline = model("koel_koel", "meilisearch/meilisearch-php");

    // Assert
    expect(timeline.topReleasedLast).toBe(true);
  });

  it("is false when a maintenance branch shipped after the highest one, so it is not called newest", () => {
    // Arrange: 3.x's last release (2025) is later than 4.x's (2023); version order still puts 4.x first.
    const branches = [
      makeBranch({ branch: "3.x", installed: true, highestReleased: "2025-06-01T00:00:00Z" }),
      makeBranch({ branch: "4.x", highestReleased: "2023-01-01T00:00:00Z" }),
    ];

    // Act
    const timeline = timelineModel(branches, null, "v3.0.0", NOW);

    // Assert
    expect(timeline?.top.branch).toBe("4.x");
    expect(timeline?.topReleasedLast).toBe(false);
  });

  it("is always true in date order, where the first row is the latest release by definition", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "master", highestReleased: "2026-01-01T00:00:00Z" }),
      makeBranch({ branch: "1.x", installed: true, highestReleased: "2020-01-01T00:00:00Z" }),
    ];

    // Act / Assert
    expect(timelineModel(branches, null, "v1.0.0", NOW)?.topReleasedLast).toBe(true);
  });
});

describe("timelineModel / the shared axis", () => {
  it("starts on 1 January of the oldest date's year and ends at now, folded lanes included", () => {
    // Act
    const timeline = model("koel_koel", "meilisearch/meilisearch-php");

    // Assert: the oldest lane (0.8.x, 2020-01-07) sits a week into the axis; the axis starts at
    // 2020-01-01 whether or not its lane is folded, so opening the fold never rescales it.
    const oldest = timeline.lanes[timeline.lanes.length - 1];
    expect(oldest?.branch).toBe("0.8.x");
    expect(oldest?.x).toBeGreaterThan(0);
    expect(oldest?.x).toBeLessThan(1);
    expect(timeline.ticks[0]).toEqual({ x: 0, year: 2020 });
    for (const lane of timeline.lanes) {
      expect(lane.x).toBeGreaterThanOrEqual(0);
      expect(lane.x).toBeLessThanOrEqual(100);
    }
  });

  it("clamps a date after now to the today edge", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "2.x", highestReleased: "2027-01-01T00:00:00Z" }),
      makeBranch({ branch: "1.x", highestReleased: "2020-01-01T00:00:00Z" }),
    ];

    // Act
    const timeline = timelineModel(branches, null, "1.0.0", NOW);

    // Assert
    expect(timeline?.lanes[0]?.x).toBe(100);
  });

  it("labels at most two years, none in the right-hand zone the today label owns", () => {
    // Act
    const timeline = model("wallabag_wallabag", "spomky-labs/otphp");

    // Assert: 2014..2026 in steps of six; 2026 itself would sit under "today".
    expect(timeline.ticks.map((tick) => tick.year)).toEqual([2014, 2020]);
  });

  it("places a threshold N years before now on the same axis, or null when it falls off it", () => {
    // Act
    const timeline = model("koel_koel", "meilisearch/meilisearch-php");
    const three = timeline.xOfYearsAgo(3);
    const five = timeline.xOfYearsAgo(5);

    // Assert
    expect(three).not.toBeNull();
    expect(five).not.toBeNull();
    expect(five ?? 0).toBeLessThan(three ?? 0);
    expect(timeline.xOfYearsAgo(10)).toBeNull(); // before 2020-01-01
    expect(timeline.xOfYearsAgo(0)).toBeNull(); // today is the rule itself
  });
});

describe("timelineModel / label and date pairing (critic.md M26 fix)", () => {
  it("labels an undated highest tag's commit date with the SAME tag, not a different one's date", () => {
    // Arrange: "2.x" has no highest_released (a shared-commit tag) but a commit date for that same
    // highest tag, and a *different*, later-dated newest_dated tag that must not be used.
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({
        branch: "2.x",
        highest: "2.4.0",
        highestCommitDate: "2020-06-01T00:00:00.000Z",
        newestDated: "2.3.0",
        newestDatedReleased: "2021-09-01T00:00:00.000Z",
      }),
    ];

    // Act
    const lane = timelineModel(branches, null, "1.0.0", NOW)?.lanes.find((l) => l.branch === "2.x");

    // Assert
    expect(lane).toMatchObject({ label: "2.4.0", date: "2020-06-01T00:00:00.000Z" });
  });

  it("falls back to the newest DATED tag, labelled with ITS OWN version", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({
        branch: "3.x",
        highest: "3.1.0",
        newestDated: "3.0.0",
        newestDatedReleased: "2019-05-01T00:00:00.000Z",
      }),
    ];

    // Act
    const lane = timelineModel(branches, null, "1.0.0", NOW)?.lanes.find((l) => l.branch === "3.x");

    // Assert
    expect(lane).toMatchObject({ label: "3.0.0", date: "2019-05-01T00:00:00.000Z" });
  });

  it("drops a branch with no usable date at all", () => {
    // Arrange
    const branches = [
      makeBranch({ branch: "1.x", highestReleased: "2018-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "2.x", highestReleased: "2020-01-01T00:00:00.000Z" }),
      makeBranch({ branch: "0.1.x", highest: "0.1.0" }),
    ];

    // Act / Assert
    expect(timelineModel(branches, null, "1.0.0", NOW)?.lanes.map((lane) => lane.branch)).toEqual([
      "2.x",
      "1.x",
    ]);
  });
});

describe("sameVersion (PD-TIMELINE-3, DESIGN.md §5)", () => {
  it("matches a branch name against its tag's bare 'v' prefix", () => {
    expect(sameVersion("0.0.3", "v0.0.3")).toBe(true);
    expect(sameVersion("v0.0.3", "0.0.3")).toBe(true);
    expect(sameVersion("1.x", "1.x")).toBe(true);
  });

  it("does not match a real branch name against a different tag's version", () => {
    expect(sameVersion("5.x", "v5.7.1")).toBe(false);
  });
});

describe("agePhrase", () => {
  const ago = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  it("says days under a week, weeks under two months, months under a year, then years", () => {
    expect(agePhrase(ago(1), NOW)).toBe("1 day");
    expect(agePhrase(ago(6), NOW)).toBe("6 days");
    expect(agePhrase(ago(7), NOW)).toBe("1 week");
    expect(agePhrase(ago(51), NOW)).toBe("7 weeks");
    expect(agePhrase(ago(110), NOW)).toBe("4 months");
    expect(agePhrase(ago(1500), NOW)).toBe("4.1 years");
  });

  it("never says zero or a negative span for a date at or after now", () => {
    expect(agePhrase(NOW.toISOString(), NOW)).toBe("1 day");
    expect(agePhrase(ago(-30), NOW)).toBe("1 day");
  });
});
