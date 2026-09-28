import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  libyearsAtZero,
  libyearsAxisMax,
  libyearsTally,
  unmeasuredLabel,
  libyearsAtZeroMark,
  libyearsItems,
  libyearsReason,
  libyearsRowPhrases,
  libyearsSortKey,
} from "../../../src/domain/libyears";
import { normalize } from "../../../src/model/normalize";
import type { ExplainMetadata, Finding, LibyearsBlock, Model } from "../../../src/model/types";
import { makeFinding, makeSignal } from "./fixtures";

// "(runtime-only)" cases feed a wrong runtime type through a cast: normalize() rules them out.

function loadBundle(name: string): Model {
  const result = normalize(
    JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", `${name}.json`), "utf8")),
  );
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

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
  const unmeasured = (overrides: Partial<Finding> = {}): Finding =>
    makeFinding({ verdict: "stale", libyears: null, ...overrides });

  test("is empty for a measured finding, zero included", () => {
    expect(libyearsReason(makeFinding({ libyears: 4.7 }))).toBe("");
    expect(libyearsReason(makeFinding({ libyears: 0 }))).toBe("");
    expect(libyearsReason(null)).toBe("");
  });

  test("words the finding's own libyears_unmeasured, an unknown code as written", () => {
    expect(libyearsReason(unmeasured({ libyearsUnmeasured: "branch_snapshot" }))).toBe("branch snapshot");
    expect(libyearsReason(unmeasured({ libyearsUnmeasured: "no_stable_release_date" }))).toBe(
      "no release date lockrot trusts",
    );
    expect(libyearsReason(unmeasured({ libyearsUnmeasured: "not_from_composer_repository" }))).toBe(
      "not from a Composer repository",
    );
    expect(libyearsReason(unmeasured({ libyearsUnmeasured: "metadata_unavailable" }))).toBe(
      "metadata unavailable",
    );
    expect(libyearsReason(unmeasured({ libyearsUnmeasured: "yanked_release" }))).toBe("yanked_release");
  });

  test("says no reason where the finding names none, whatever its note, version or S6 say", () => {
    const s6 = makeSignal({ id: "S6", data: { reason: "branch_snapshot" } });
    expect(libyearsReason(unmeasured())).toBe("");
    expect(libyearsReason(unmeasured({ note: "not from a Composer repository, not checked" }))).toBe("");
    expect(libyearsReason(unmeasured({ note: "Repository metadata unavailable: timeout" }))).toBe("");
    expect(libyearsReason(unmeasured({ version: "dev-main", signals: [s6] }))).toBe("");
  });

  test.each([
    "capsule-0.10-drupal",
    "koel_koel",
    "mautic_mautic",
    "wallabag_wallabag",
    "mini",
    "mini-no-fail-on",
  ])("%s: a document without libyears_unmeasured names no reason for any row", (bundle) => {
    const model = loadBundle(bundle);
    expect(new Set(model.report.findings.map((f) => libyearsReason(f)))).toEqual(new Set([""]));
  });

  test.each([
    ["wallabag_wallabag-0.13", "friendsofsymfony/oauth-server-bundle", "branch snapshot"],
    ["mautic_mautic-0.13", "rector/rector", "branch snapshot"],
    ["mautic_mautic-0.13", "mautic/core-lib", "not from a Composer repository"],
    ["wallabag_offline-strict-0.13", "doctrine/cache", "metadata unavailable"],
    ["mini-0.13-edges", "acme/future-reason", "yanked_release"],
  ])("%s %s: %s", (bundle, pkg, words) => {
    const model = loadBundle(bundle);
    const f = model.report.findings.find((x) => x.package === pkg) ?? null;
    expect(libyearsReason(f)).toBe(words);
  });

  test.each([
    "mautic_mautic-0.13",
    "koel_koel-0.13",
    "koel_koel-all-0.13",
    "wallabag_wallabag-0.13",
    "gh_akaunting_akaunting-0.13",
    "mini-0.13-edges",
    "mini-0.13-edges-lock-only",
    "koel_lock-only-0.13",
    "koel_no-token-unchecked-0.13",
    "wallabag_baseline-older-0.13",
    "wallabag_baseline-self-0.13",
    "wallabag_generate-baseline-0.13",
    "wallabag_offline-strict-0.13",
    "wallabag_offline-strict-unchecked-0.13",
  ])("%s: every unmeasured row has a reason, and they add up to the unmeasured block", (bundle) => {
    const model = loadBundle(bundle);
    const words: Record<string, string> = {
      branch_snapshot: "branch snapshot",
      no_stable_release_date: "no release date lockrot trusts",
      not_from_composer_repository: "not from a Composer repository",
      metadata_unavailable: "metadata unavailable",
    };
    const counted = new Map<string, number>();
    for (const f of model.report.findings) {
      if (f.libyears !== null) continue;
      const why = libyearsReason(f);
      counted.set(why, (counted.get(why) ?? 0) + 1);
    }
    const expected = new Map<string, number>();
    for (const [reason, count] of model.report.libyears?.unmeasured ?? []) {
      if (count > 0) expected.set(words[reason] ?? reason, count);
    }
    expect(counted).toEqual(expected);
  });
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
      "not behind the newest release, v1.2.4",
    );
    expect(libyearsAtZero({ libyears: 0, version: "v1.1.9" }, meta)).toBe(
      "not behind the newest release, v1.2.4",
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
    expect(libyearsAtZero({ libyears: 0, version: "" }, meta)).toBe("not behind the newest release, v1.2.4");
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

describe("unmeasuredLabel", () => {
  test("says a reason key in words, and 'stable' as 'dated', since a pre-release counts", () => {
    expect(unmeasuredLabel("no_stable_release_date")).toBe("no dated release");
    expect(unmeasuredLabel("branch_snapshot")).toBe("branch snapshot");
    expect(unmeasuredLabel("not_from_composer_repository")).toBe("not from composer repository");
    expect(unmeasuredLabel("a_new_reason")).toBe("a new reason");
    expect(unmeasuredLabel("constructor")).toBe("constructor");
  });
});
