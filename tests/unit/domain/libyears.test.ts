import { describe, expect, test } from "vitest";
import {
  libyearsAtZero,
  libyearsAxisMax,
  libyearsTally,
  libyearsAtZeroMark,
  libyearsItems,
  libyearsReason,
  libyearsRowPhrases,
  libyearsSortKey,
} from "../../../src/domain/libyears";
import type { ExplainMetadata, Finding, LibyearsBlock } from "../../../src/model/types";

// Cases citing a line number are ported from tests/js/lib.test.js, adapted from the wire document's
// snake_case shapes to Model's (e.g. `direct_requirements` -> `directRequirements`, and
// `unmeasured` from a `{reason: count}` object to a `[reason, count][]` list). `libyearsSummary` is
// not ported: DESIGN.md/critic.md D2 record it as dead code the legacy page never called, and
// libyears.ts does not export it (see that file's header comment).
//
// A few legacy cases fed a value of the wrong runtime type into a function whose Model-typed
// parameter no longer admits it at compile time (e.g. `libyears: "0"` where the type is
// `number | null`). Model.normalize() is responsible for guaranteeing that shape before anything in
// domain/ sees it, so those inputs cannot arise from a real document — but the underlying JS
// functions are still defensive against them at runtime, so such cases are kept below with an
// explicit cast, marked "(runtime-only)".

describe("libyearsSortKey", () => {
  test("puts an unmeasured package below every measured one, zero included (lib.test.js:233-237)", () => {
    const rows: Array<Pick<Finding, "libyears">> = [{ libyears: 1.2 }, { libyears: null }, { libyears: 0 }];
    expect(rows.map(libyearsSortKey).sort((a, b) => a - b)).toEqual([-1, 0, 1.2]);
    expect(libyearsSortKey(null)).toBe(-1);
  });

  test("a negative libyears value is not clamped, unlike the -1 sentinel", () => {
    expect(libyearsSortKey({ libyears: -0.5 })).toBe(-0.5);
  });
});

describe("libyearsReason", () => {
  test("names why a finding was not measured, in the block's own words (lib.test.js:240-248)", () => {
    expect(libyearsReason({ libyears: 4.7, version: "dev-main", note: null })).toBe("");
    expect(libyearsReason({ libyears: 0, version: "1.0.0", note: null })).toBe("");
    expect(
      libyearsReason({
        libyears: null,
        version: "dev-main",
        note: "not from a Composer repository, not checked",
      }),
    ).toBe("not from a Composer repository");
    expect(
      libyearsReason({ libyears: null, version: "1.0.0", note: "Repository metadata unavailable: timeout" }),
    ).toBe("metadata unavailable");
    expect(libyearsReason({ libyears: null, version: "dev-main", note: null })).toBe("branch snapshot");
    expect(libyearsReason({ libyears: null, version: "2.x-dev#abc123", note: null })).toBe("branch snapshot");
    expect(libyearsReason({ libyears: null, version: "v1.37.0", note: null })).toBe(
      "no release date lockrot trusts",
    );
    expect(libyearsReason(null)).toBe("");
  });

  test("never turns a missing number into a zero (lib.test.js:260-265)", () => {
    // zero stays measured
    expect(libyearsReason({ libyears: 0, version: "1.0.0", note: null })).toBe("");
  });

  test("(runtime-only) a non-numeric libyears reads as 'not a number in this document' (lib.test.js:263)", () => {
    const finding = { libyears: "4.7", version: "1.0.0", note: null } as unknown as Pick<
      Finding,
      "libyears" | "version" | "note"
    >;
    expect(libyearsReason(finding)).toBe("not a number in this document");
  });

  test("an empty (falsy) note falls through to the version-based fallback, not to 'metadata unavailable'", () => {
    expect(libyearsReason({ libyears: null, version: "1.0.0", note: "" })).toBe(
      "no release date lockrot trusts",
    );
  });

  test("an empty-string version with no note also falls to the version-based fallback", () => {
    expect(libyearsReason({ libyears: null, version: "", note: null })).toBe(
      "no release date lockrot trusts",
    );
  });

  test("a -dev suffix combined with a #ref suffix still reads as a branch snapshot", () => {
    expect(libyearsReason({ libyears: null, version: "1.0-dev#abc123", note: null })).toBe("branch snapshot");
  });

  test("cuts the #-fragment in linear time even for a hostile, hand-crafted version string", () => {
    // A version of N "#" characters followed by a newline makes a backtracking `/#.*$/` (no
    // `m`/`s` flag, so `.` stops at the newline and `$` fails there) retry from every "#" —
    // quadratic in N. 100k characters takes seconds under that regex; a linear cut is instant.
    const hostile = "#".repeat(100_000) + "\n";
    const start = performance.now();
    const reason = libyearsReason({ libyears: null, version: hostile, note: null });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000);
    // Everything from the first "#" onward is cut, same as the regex's intent: an empty version
    // string is neither a dev branch nor a stable one, so it falls to the "no release date" reason.
    expect(reason).toBe("no release date lockrot trusts");
  }, 10_000);
});

describe("libyearsAtZeroMark", () => {
  const meta: Pick<ExplainMetadata, "lastStableVersion"> = { lastStableVersion: "v1.2.4" };

  test("says libyearsAtZero's two readings in the words a printed table has room for", () => {
    expect(libyearsAtZeroMark({ libyears: 0, version: "v1.2.4" }, meta)).toBe("newest");
    expect(libyearsAtZeroMark({ libyears: 0, version: "v1.2.4" }, null)).toBe("newest");
    expect(libyearsAtZeroMark({ libyears: 0, version: "v1.1.9" }, meta)).toBe("not behind v1.2.4");
  });

  test("is null wherever libyearsAtZero is: a value that is not exactly zero, or no finding", () => {
    expect(libyearsAtZeroMark({ libyears: 0.025, version: "v1.2.3" }, meta)).toBeNull();
    expect(libyearsAtZeroMark({ libyears: null, version: "v1.2.3" }, meta)).toBeNull();
    expect(libyearsAtZeroMark(null, meta)).toBeNull();
  });
});

describe("libyearsAtZero", () => {
  const meta: Pick<ExplainMetadata, "lastStableVersion"> = { lastStableVersion: "v1.2.4" };

  test("reads the value, not the 0.0 it rounds to (lib.test.js:269-276)", () => {
    expect(libyearsAtZero({ libyears: 0, version: "v1.2.4" }, meta)).toBe(
      "the installed release is the newest",
    );
    expect(libyearsAtZero({ libyears: 0, version: "v1.3.0-beta1" }, meta)).toBe(
      "not behind the newest stable, v1.2.4",
    );
    expect(libyearsAtZero({ libyears: 0, version: "v1.1.9" }, meta)).toBe(
      "not behind the newest stable, v1.2.4",
    );
    expect(libyearsAtZero({ libyears: 0, version: "v1.2.4" }, null)).toBe(
      "the installed release is the newest",
    );
    expect(libyearsAtZero({ libyears: 0.025, version: "v1.2.3" }, meta)).toBeNull();
    expect(libyearsAtZero({ libyears: null, version: "v1.2.3" }, meta)).toBeNull();
    expect(libyearsAtZero(null, meta)).toBeNull();
  });

  test("(runtime-only) the string '0' is not the number 0 (lib.test.js:275)", () => {
    const finding = { libyears: "0", version: "v1.2.3" } as unknown as Pick<Finding, "libyears" | "version">;
    expect(libyearsAtZero(finding, meta)).toBeNull();
  });

  test("a meta with no last stable version (null or empty) names nothing to compare against", () => {
    expect(libyearsAtZero({ libyears: 0, version: "v1.2.4" }, { lastStableVersion: null })).toBe(
      "the installed release is the newest",
    );
    expect(libyearsAtZero({ libyears: 0, version: "v1.2.4" }, { lastStableVersion: "" })).toBe(
      "the installed release is the newest",
    );
  });

  test("an empty-string installed version is still comparable to a named newest", () => {
    expect(libyearsAtZero({ libyears: 0, version: "" }, meta)).toBe("not behind the newest stable, v1.2.4");
  });

  test("a negative libyears is not the exact-zero sentinel either", () => {
    expect(libyearsAtZero({ libyears: -0.5, version: "v1.0.0" }, meta)).toBeNull();
  });
});

describe("libyearsItems", () => {
  test("are the footer's items after the number, one string each (lib.test.js:206-209)", () => {
    const block: LibyearsBlock = {
      total: 8.07,
      directRequirements: 4.71,
      measured: 2,
      unmeasured: [["branch_snapshot", 1]],
      furthestBehind: { package: "smalot/pdfparser", version: "v1.1.0", libyears: 4.7 },
    };
    expect(libyearsItems(block)).toEqual([
      "across 2 of 3 packages",
      "4.7 from direct requirements",
      "furthest behind smalot/pdfparser v1.1.0 at 4.7",
    ]);
    expect(
      libyearsItems({ total: 0, directRequirements: 0, measured: 0, unmeasured: [], furthestBehind: null }),
    ).toEqual(["nothing to measure"]);
    expect(libyearsItems(null)).toEqual([]);
  });

  test("the 'all N packages' scope when nothing was unmeasured, and 'the one package' when N is 1 (lib.test.js:219-220, via libyearsSummary there)", () => {
    expect(
      libyearsItems({ total: 0, directRequirements: 0, measured: 20, unmeasured: [], furthestBehind: null }),
    ).toEqual(["across all 20 packages"]);
    expect(
      libyearsItems({
        total: 1,
        directRequirements: 1,
        measured: 1,
        unmeasured: [],
        furthestBehind: { package: "a/a", version: "1.0.0", libyears: 1 },
      }),
    ).toEqual(["across the one package", "1.0 from direct requirements", "furthest behind a/a 1.0.0 at 1.0"]);
  });

  test("'none of the N packages' and 'the one package could not be measured' (lib.test.js:225-226, via libyearsSummary there)", () => {
    expect(
      libyearsItems({
        total: 0,
        directRequirements: 0,
        measured: 0,
        unmeasured: [["branch_snapshot", 2]],
        furthestBehind: null,
      }),
    ).toEqual(["none of the 2 packages could be measured"]);
    expect(
      libyearsItems({
        total: 0,
        directRequirements: 0,
        measured: 0,
        unmeasured: [["branch_snapshot", 1]],
        furthestBehind: null,
      }),
    ).toEqual(["the one package could not be measured"]);
  });

  test("never turns a missing number into a zero (lib.test.js:260-262)", () => {
    const block: LibyearsBlock = {
      total: null,
      directRequirements: null,
      measured: 2,
      unmeasured: [],
      furthestBehind: { package: "a/a", version: "1.0.0", libyears: null as unknown as number },
    };
    expect(libyearsItems(block)).toEqual(["across all 2 packages", "furthest behind a/a 1.0.0"]);
  });
});

describe("libyearsRowPhrases", () => {
  test("returns no phrases for an unmeasured finding, whatever the metadata says", () => {
    expect(
      libyearsRowPhrases(
        { libyears: null, version: "v1.0.0" },
        {
          hasStableRelease: true,
          lastStableRelease: "2020-01-01",
          lastStableVersion: "v2.0.0",
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([]);
  });

  test("returns no phrases for a measured finding with no metadata at all", () => {
    expect(libyearsRowPhrases({ libyears: 1.5, version: "v1.0.0" }, null)).toEqual([]);
  });

  test("names the newest release with its date when both are known", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: true,
          lastStableRelease: "2020-01-01",
          lastStableVersion: "v2.0.0",
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([{ text: "newest v2.0.0 released ", date: "2020-01-01" }]);
  });

  test("names the newest release without a date when the newest itself carries none and there is no stable release to fall back to", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: false,
          lastStableRelease: null,
          lastStableVersion: "v2.0.0",
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([{ text: "newest v2.0.0" }]);
  });

  test("the undated-newest lower bound wins even at libyears exactly 0, ahead of libyearsAtZero", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 0, version: "v1.0.0" },
        {
          hasStableRelease: true,
          lastStableRelease: null,
          lastStableVersion: "v2.0.0",
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([{ text: "at least: the newest release is undated, measured to the newest dated one above" }]);
  });

  test("falls to libyearsAtZero's wording when the value is exactly 0 and the newest is dated", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 0, version: "v1.0.0" },
        {
          hasStableRelease: false,
          lastStableRelease: null,
          lastStableVersion: "v1.0.0",
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([{ text: "the installed release is the newest" }]);
  });

  test("has no 'why' phrase at all when there is no newest to name", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: false,
          lastStableRelease: null,
          lastStableVersion: null,
          installedRelease: null,
          installedReleaseDatedBy: null,
        },
      ),
    ).toEqual([]);
  });

  test("adds the split-package addendum with a date when the installed release is dated", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: false,
          lastStableRelease: null,
          lastStableVersion: null,
          installedRelease: "2021-05-01",
          installedReleaseDatedBy: "monorepo/parent",
        },
      ),
    ).toEqual([{ text: "installed release dated by monorepo/parent, ", date: "2021-05-01" }]);
  });

  test("adds the split-package addendum without a date when the installed release itself is undated", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: false,
          lastStableRelease: null,
          lastStableVersion: null,
          installedRelease: null,
          installedReleaseDatedBy: "monorepo/parent",
        },
      ),
    ).toEqual([{ text: "installed release dated by monorepo/parent" }]);
  });

  test("carries both phrases, in order, when both apply", () => {
    expect(
      libyearsRowPhrases(
        { libyears: 1.5, version: "v1.0.0" },
        {
          hasStableRelease: true,
          lastStableRelease: "2020-01-01",
          lastStableVersion: "v2.0.0",
          installedRelease: "2021-05-01",
          installedReleaseDatedBy: "monorepo/parent",
        },
      ),
    ).toEqual([
      { text: "newest v2.0.0 released ", date: "2020-01-01" },
      { text: "installed release dated by monorepo/parent, ", date: "2021-05-01" },
    ]);
  });
});

describe("libyearsTally (PD-PACKAGES-1)", () => {
  test("splits the listed packages into behind, not behind (exactly zero) and unmeasured", () => {
    const tally = libyearsTally([{ libyears: 1.2 }, { libyears: 0.01 }, { libyears: 0 }, { libyears: null }]);
    expect(tally).toEqual({ behind: 2, current: 1, unmeasured: 1 });
  });

  test("is all zeros for an empty list", () => {
    expect(libyearsTally([])).toEqual({ behind: 0, current: 0, unmeasured: 0 });
  });
});

describe("libyearsAxisMax (PD-PACKAGES-1)", () => {
  test("rounds the largest measured value up to a whole year", () => {
    expect(libyearsAxisMax([{ libyears: 5.8 }, { libyears: 0.3 }, { libyears: null }])).toBe(6);
    expect(libyearsAxisMax([{ libyears: 4 }])).toBe(4);
  });

  test("is at least one year, so a list of small values still has a scale", () => {
    expect(libyearsAxisMax([{ libyears: 0.2 }])).toBe(1);
  });

  test("is null when nothing is behind: no bar, no scale to caption", () => {
    expect(libyearsAxisMax([{ libyears: 0 }, { libyears: null }])).toBeNull();
    expect(libyearsAxisMax([])).toBeNull();
  });
});
