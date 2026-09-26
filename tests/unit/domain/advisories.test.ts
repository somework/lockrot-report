import { describe, expect, it } from "vitest";
import {
  advisoriesOf,
  advisoryCheckIncomplete,
  advisoryPackages,
  allAdvisories,
  fixLadder,
  fixShapeOf,
  groupAdvisories,
  passesAdvisoryRail,
  sevTone,
  sortAdvisories,
} from "../../../src/domain/advisories";
import type { Model } from "../../../src/model/types";
import { EMPTY_FILTERS } from "../../../src/state/types";
import { makeAdvisory, makeFinding, makeModel } from "./fixtures";

describe("advisoriesOf", () => {
  it("returns the finding's already-flattened advisories", () => {
    // Arrange
    const advisory = makeAdvisory({ id: "GHSA-1" });
    const finding = makeFinding({ advisories: [advisory] });

    // Act
    const result = advisoriesOf(finding);

    // Assert
    expect(result).toEqual([advisory]);
  });

  it("returns an empty list for a finding with no advisories", () => {
    // Arrange
    const finding = makeFinding({ advisories: [] });

    // Act
    const result = advisoriesOf(finding);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("sevTone", () => {
  it("maps the four named tiers to their own tone", () => {
    // Arrange / Act / Assert
    expect(sevTone("critical")).toBe("crit");
    expect(sevTone("high")).toBe("high");
    expect(sevTone("medium")).toBe("med");
    expect(sevTone("low")).toBe("low");
  });

  it("falls back to low for unrated", () => {
    // Arrange / Act / Assert
    expect(sevTone("unrated")).toBe("low");
  });
});

describe("fixLadder", () => {
  it("returns one rung per distinct fixed_by version", () => {
    // Arrange
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: "2.0.0", fixedOnBranch: true }),
        makeAdvisory({ id: "b", fixedBy: "3.0.0", fixedOnBranch: false }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert
    expect(ladder).toEqual([
      { version: "2.0.0", onBranch: true, n: 1 },
      { version: "3.0.0", onBranch: false, n: 1 },
    ]);
  });

  it("counts advisories that share a fixed_by into one rung", () => {
    // Arrange
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: "2.0.0", fixedOnBranch: true }),
        makeAdvisory({ id: "b", fixedBy: "2.0.0", fixedOnBranch: true }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert
    expect(ladder).toEqual([{ version: "2.0.0", onBranch: true, n: 2 }]);
  });

  it("buckets advisories with no fix listed together, distinct from any real version", () => {
    // Arrange
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: null, fixedOnBranch: false }),
        makeAdvisory({ id: "b", fixedBy: null, fixedOnBranch: false }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert
    expect(ladder).toEqual([{ version: null, onBranch: false, n: 2 }]);
  });

  it("puts an on-branch rung before an off-branch rung regardless of count", () => {
    // Arrange
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: "3.0.0", fixedOnBranch: false }),
        makeAdvisory({ id: "b", fixedBy: "3.0.0", fixedOnBranch: false }),
        makeAdvisory({ id: "c", fixedBy: "1.5.0", fixedOnBranch: true }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert
    expect(ladder[0]).toEqual({ version: "1.5.0", onBranch: true, n: 1 });
    expect(ladder[1]).toEqual({ version: "3.0.0", onBranch: false, n: 2 });
  });

  it("orders ties by advisory-arrival order, not JS's numeric-key-first object order (M33)", () => {
    // Arrange: an integer-like fixed_by ("2") would sort ahead of "1.9.0" under Object.keys, even
    // though "1.9.0" appeared first in the advisory list; a Map must not reproduce that.
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: "1.9.0", fixedOnBranch: true }),
        makeAdvisory({ id: "b", fixedBy: "2", fixedOnBranch: true }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert: both rungs are on-branch with n:1, a tie the sort leaves in first-seen order.
    expect(ladder).toEqual([
      { version: "1.9.0", onBranch: true, n: 1 },
      { version: "2", onBranch: true, n: 1 },
    ]);
  });

  it("keeps the first advisory's fixed_on_branch flag when a bucket disagrees on it (M33)", () => {
    // Arrange
    const finding = makeFinding({
      advisories: [
        makeAdvisory({ id: "a", fixedBy: "2.0.0", fixedOnBranch: true }),
        makeAdvisory({ id: "b", fixedBy: "2.0.0", fixedOnBranch: false }),
      ],
    });

    // Act
    const ladder = fixLadder(finding);

    // Assert
    expect(ladder).toEqual([{ version: "2.0.0", onBranch: true, n: 2 }]);
  });
});

describe("fixShapeOf", () => {
  it("is none when no fix is listed", () => {
    // Arrange / Act / Assert
    expect(fixShapeOf(makeAdvisory({ fixedBy: null }))).toBe("none");
  });

  it("is branch when the fix is on the installed branch", () => {
    // Arrange / Act / Assert
    expect(fixShapeOf(makeAdvisory({ fixedBy: "2.0.1", fixedOnBranch: true }))).toBe("branch");
  });

  it("is move when the fix requires a branch move", () => {
    // Arrange / Act / Assert
    expect(fixShapeOf(makeAdvisory({ fixedBy: "3.0.0", fixedOnBranch: false }))).toBe("move");
  });
});

describe("sortAdvisories", () => {
  it("sorts ascending by severity rank", () => {
    // Arrange
    const items = ["low", "critical", "medium"] as const;

    // Act
    const sorted = sortAdvisories(items, (severity) => severity);

    // Assert
    expect(sorted).toEqual(["critical", "medium", "low"]);
  });

  it("puts unrated last, not first (fixes critic.md C1)", () => {
    // Arrange
    const items = ["unrated", "critical"] as const;

    // Act
    const sorted = sortAdvisories(items, (severity) => severity);

    // Assert
    expect(sorted).toEqual(["critical", "unrated"]);
  });

  it("keeps document order for items tied on severity (stable sort)", () => {
    // Arrange: two "high" items in a specific arrival order.
    const items = [
      { id: "first", severity: "high" as const },
      { id: "second", severity: "high" as const },
    ];

    // Act
    const sorted = sortAdvisories(items, (item) => item.severity);

    // Assert
    expect(sorted.map((item) => item.id)).toEqual(["first", "second"]);
  });
});

describe("allAdvisories", () => {
  it("pairs every advisory with its own finding, across all findings", () => {
    // Arrange
    const advisoryA = makeAdvisory({ id: "a", severity: "high" });
    const advisoryB = makeAdvisory({ id: "b", severity: "critical" });
    const findingA = makeFinding({ package: "acme/a", advisories: [advisoryA] });
    const findingB = makeFinding({ package: "acme/b", advisories: [advisoryB] });
    const model = makeModel([findingA, findingB]);

    // Act
    const pairs = allAdvisories(model);

    // Assert: sorted by severity, critical first, each paired with its own finding.
    expect(pairs).toEqual([
      { advisory: advisoryB, finding: findingB },
      { advisory: advisoryA, finding: findingA },
    ]);
  });

  it("returns an empty list when no finding carries an advisory", () => {
    // Arrange
    const model = makeModel([makeFinding({ advisories: [] })]);

    // Act
    const pairs = allAdvisories(model);

    // Assert
    expect(pairs).toEqual([]);
  });
});

describe("passesAdvisoryRail", () => {
  // The one definition SearchBar's count line and ui/views/order.ts's row order both call, so the
  // two can never disagree about which advisories the rail's sev/fix selections keep (quality
  // finding: this check used to be hand-duplicated in both places).

  it("passes everything when no sev or fix filter is selected", () => {
    const advisory = makeAdvisory({ severity: "critical", fixedBy: null });
    expect(passesAdvisoryRail(EMPTY_FILTERS, advisory)).toBe(true);
  });

  it("keeps only an advisory whose severity is in the sev filter", () => {
    const filters = { ...EMPTY_FILTERS, sev: ["low"] };
    expect(passesAdvisoryRail(filters, makeAdvisory({ severity: "low" }))).toBe(true);
    expect(passesAdvisoryRail(filters, makeAdvisory({ severity: "critical" }))).toBe(false);
  });

  it("keeps only an advisory whose fix shape is in the fix filter", () => {
    const filters = { ...EMPTY_FILTERS, fix: ["branch"] };
    expect(passesAdvisoryRail(filters, makeAdvisory({ fixedBy: "1.0.1", fixedOnBranch: true }))).toBe(true);
    expect(passesAdvisoryRail(filters, makeAdvisory({ fixedBy: "2.0.0", fixedOnBranch: false }))).toBe(false);
    expect(passesAdvisoryRail(filters, makeAdvisory({ fixedBy: null }))).toBe(false);
  });

  it("requires both a sev and a fix filter to pass when both are set", () => {
    const filters = { ...EMPTY_FILTERS, sev: ["critical"], fix: ["none"] };
    expect(passesAdvisoryRail(filters, makeAdvisory({ severity: "critical", fixedBy: null }))).toBe(true);
    // Matches sev but not fix.
    expect(passesAdvisoryRail(filters, makeAdvisory({ severity: "critical", fixedBy: "1.0.0" }))).toBe(false);
    // Matches fix but not sev.
    expect(passesAdvisoryRail(filters, makeAdvisory({ severity: "low", fixedBy: null }))).toBe(false);
  });
});

describe("advisoryCheckIncomplete", () => {
  // PD-LEDGER-1 (DESIGN.md §5): whether AdvisoryLedger's "no advisory" reads as a clean check or an
  // incomplete one. Not exercised through allAdvisories()/a finding at all — this reads only the
  // run-wide facts (`network_failures`, `notes`) the schema actually carries for a whole-lock check.

  it("is false when the run recorded no network failure and no matching note", () => {
    // Arrange
    const model = makeModel([]);

    // Act / Assert
    expect(advisoryCheckIncomplete(model)).toBe(false);
  });

  it("is true when the report says a network failure occurred", () => {
    // Arrange
    const base = makeModel([]);
    const model: Model = { ...base, report: { ...base.report, networkFailures: true } };

    // Act / Assert
    expect(advisoryCheckIncomplete(model)).toBe(true);
  });

  it("is true when a note names the advisory check, case-insensitively", () => {
    // Arrange
    const base = makeModel([]);
    const model: Model = {
      ...base,
      report: {
        ...base.report,
        notes: ["this run was --offline; the security ADVISORY check could not run"],
      },
    };

    // Act / Assert
    expect(advisoryCheckIncomplete(model)).toBe(true);
  });

  it("is true when a note names the audit check instead", () => {
    // Arrange: verdicts.md's own wording for one way this check is skipped ("needs Composer 2.4").
    const base = makeModel([]);
    const model: Model = {
      ...base,
      report: {
        ...base.report,
        notes: ["composer audit needs Composer 2.4 or newer; advisories were not checked"],
      },
    };

    // Act / Assert
    expect(advisoryCheckIncomplete(model)).toBe(true);
  });

  it("ignores a note about something else entirely", () => {
    // Arrange: mini.json's own notes — about repository activity and a non-Composer package, not
    // the advisory check.
    const base = makeModel([]);
    const model: Model = {
      ...base,
      report: {
        ...base.report,
        notes: [
          "GitHub did not answer for 3 repositories (private, renamed or removed); repository activity missing",
          "1 package is not from a Composer repository and was not checked",
        ],
      },
    };

    // Act / Assert
    expect(advisoryCheckIncomplete(model)).toBe(false);
  });
});

describe("groupAdvisories", () => {
  it("groups pairs by fix shape in the fixed branch/move/none order", () => {
    // Arrange
    const finding = makeFinding();
    const branchAdvisory = makeAdvisory({ id: "a", fixedBy: "1.0.1", fixedOnBranch: true });
    const moveAdvisory = makeAdvisory({ id: "b", fixedBy: "2.0.0", fixedOnBranch: false });
    const noneAdvisory = makeAdvisory({ id: "c", fixedBy: null });
    const pairs = [
      { advisory: moveAdvisory, finding },
      { advisory: noneAdvisory, finding },
      { advisory: branchAdvisory, finding },
    ];

    // Act
    const groups = groupAdvisories(pairs);

    // Assert
    expect(groups.map((group) => group.shape)).toEqual(["branch", "move", "none"]);
    expect(groups[0]?.advisories).toEqual([{ advisory: branchAdvisory, finding }]);
  });

  it("omits a group with nothing in it", () => {
    // Arrange
    const finding = makeFinding();
    const branchAdvisory = makeAdvisory({ id: "a", fixedBy: "1.0.1", fixedOnBranch: true });
    const pairs = [{ advisory: branchAdvisory, finding }];

    // Act
    const groups = groupAdvisories(pairs);

    // Assert
    expect(groups).toHaveLength(1);
    expect(groups[0]?.shape).toBe("branch");
  });

  it("returns no groups for an empty list", () => {
    // Arrange / Act
    const groups = groupAdvisories([]);

    // Assert
    expect(groups).toEqual([]);
  });
});

describe("advisoryPackages", () => {
  it("lists each package once, in the advisories' order, with its distinct fix versions verbatim", () => {
    // Arrange: two advisories on one package share a fix, a third names none.
    const otphp = makeFinding({ package: "spomky-labs/otphp" });
    const other = makeFinding({ package: "acme/other" });
    const pairs = [
      { advisory: makeAdvisory({ id: "A", fixedBy: "11.5.0" }), finding: otphp },
      { advisory: makeAdvisory({ id: "B", fixedBy: "11.5.0" }), finding: otphp },
      { advisory: makeAdvisory({ id: "C", fixedBy: null }), finding: other },
    ];

    // Act
    const packages = advisoryPackages(pairs);

    // Assert
    expect(packages).toEqual([
      { package: "spomky-labs/otphp", fixedBy: ["11.5.0"], someUnfixed: false },
      { package: "acme/other", fixedBy: [], someUnfixed: true },
    ]);
  });

  it("marks a package whose advisories name a fix for some but not all", () => {
    // Arrange
    const finding = makeFinding({ package: "acme/mixed" });
    const pairs = [
      { advisory: makeAdvisory({ id: "A", fixedBy: "2.0.1" }), finding },
      { advisory: makeAdvisory({ id: "B", fixedBy: null }), finding },
      { advisory: makeAdvisory({ id: "C", fixedBy: "1.9.9" }), finding },
    ];

    // Act
    const [entry] = advisoryPackages(pairs);

    // Assert: never compared or ranked, just listed in the order the advisories give them.
    expect(entry).toEqual({ package: "acme/mixed", fixedBy: ["2.0.1", "1.9.9"], someUnfixed: true });
  });
});
