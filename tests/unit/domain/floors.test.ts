import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  floorsDefinition,
  floorsList,
  floorsSentence,
  foldWords,
  plain,
  moveClause,
  readFloors,
  standing,
  type FloorGroup,
  type Floors,
} from "../../../src/domain/floors";
import { normalize } from "../../../src/model/normalize";
import type { BranchRow, Model } from "../../../src/model/types";

function load(bundle: string): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", `${bundle}.json`), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${bundle} failed to normalize`);
  return result.model;
}

function fixture(bundle: string, pkg: string): { rows: readonly BranchRow[]; floors: Floors; model: Model } {
  const model = load(bundle);
  const rows = model.details.get(pkg)?.metadata?.branches;
  if (rows === undefined) throw new Error(`${pkg} has no branches in ${bundle}`);
  return { rows, floors: readFloors(model.report.run, model.report.absent), model };
}

function sentence(bundle: string, pkg: string): string | null {
  const { rows, floors } = fixture(bundle, pkg);
  const parts = floorsSentence(rows, floors);
  return parts === null ? null : plain(parts);
}

function listed(groups: readonly FloorGroup[]): string[] {
  return groups.map((g) => {
    const names = g.items.map((item) =>
      item.kind === "run"
        ? `${item.from} – ${item.to} (${String(item.count)})`
        : `${item.branch}${item.yours ? " (yours)" : ""}`,
    );
    return `${names.join(", ")}: ${plain(g.words)}`;
  });
}

function row(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    branch: "1.x",
    installed: false,
    highest: "1.0.0",
    highestReleased: null,
    highestCommitDate: null,
    newestDated: null,
    newestDatedReleased: null,
    datedBy: null,
    php: "^8.1",
    admitsTargetPhp: true,
    admitsProjectPhp: true,
    phpBlockedBy: null,
    missesTargetPhp: null,
    missesProjectPhp: null,
    floorFields: true,
    ...overrides,
  };
}

const BOTH: Floors = { project: ">=8.2", target: "8.4", noProjectFloor: false };
const TARGET_ONLY: Floors = { project: null, target: "8.4", noProjectFloor: true };

describe("readFloors", () => {
  it("quotes both as written; a null project_php names no floor, an absent one says nothing", () => {
    const run = load("mautic_mautic-0.13").report.run;
    expect(readFloors(run, [])).toEqual({ project: null, target: run.targetPhp, noProjectFloor: true });
    expect(readFloors(run, ["run.project_php"]).noProjectFloor).toBe(false);
    const wallabag = load("wallabag_wallabag-0.13").report.run;
    expect(readFloors(wallabag, [])).toEqual({ project: ">=8.2", target: "8.4", noProjectFloor: false });
  });
});

describe("standing: four states per field", () => {
  it("true admits, false misses with the way as written, null is no answer, absent is nothing", () => {
    expect(standing(row(), BOTH)).toEqual({ kind: "admits", blockedBy: null });
    expect(standing(row({ admitsProjectPhp: false, missesProjectPhp: "needs_newer" }), BOTH)).toEqual({
      kind: "misses",
      misses: [{ floor: "project", code: "needs_newer" }],
      blockedBy: null,
    });
    expect(standing(row({ admitsTargetPhp: null }), BOTH)).toEqual({ kind: "unanswered" });
    expect(standing(row({ floorFields: false }), BOTH)).toBeNull();
  });

  it("a false never reads as null: one floor missed beside a null still misses", () => {
    const st = standing(row({ admitsTargetPhp: null, admitsProjectPhp: false }), BOTH);
    expect(st?.kind).toBe("misses");
  });

  it("php null records no requirement; a run naming no floor reads nothing", () => {
    expect(standing(row({ php: null }), BOTH)).toEqual({ kind: "unrecorded" });
    expect(standing(row(), { project: null, target: null, noProjectFloor: false })).toBeNull();
  });

  it("an unknown php_blocked_by is kept as written; project and target are the floors themselves", () => {
    expect(standing(row({ phpBlockedBy: "extension" }), BOTH)).toEqual({
      kind: "admits",
      blockedBy: "extension",
    });
    expect(standing(row({ phpBlockedBy: "project" }), BOTH)).toEqual({ kind: "admits", blockedBy: null });
  });

  it("the project floor is not read when the run names none, whatever the row says", () => {
    expect(standing(row({ admitsProjectPhp: null }), TARGET_ONLY)).toEqual({
      kind: "admits",
      blockedBy: null,
    });
  });
});

describe("floorsSentence: level 0, from yours up", () => {
  it("scheb/2fa-bundle: the newest needs a newer PHP than your require.php; the rest from yours up admit both", () => {
    expect(sentence("wallabag_wallabag-0.13", "scheb/2fa-bundle")).toBe(
      "Yours, 7.x and 6.x admit your require.php (>=8.2) and PHP 8.4; 8.x needs a newer PHP than your require.php.",
    );
  });

  it("plank/laravel-mediable: counts only the newer branches and yours, never the older ones that admit", () => {
    expect(sentence("gh_akaunting_akaunting-0.13", "plank/laravel-mediable")).toBe(
      "Yours admits your require.php (^8.1) and PHP 8.4; 7.x and 6.x need a newer PHP than your require.php.",
    );
  });

  it("acme/left: an unknown blocker as written, apart; yours names the release its php comes from", () => {
    expect(sentence("mini-0.13-edges", "acme/left")).toBe(
      "Against your require.php (^8.3) and PHP 8.4: 3.x and 2.x admit both but are blocked by extension; yours, in 1.9.0, needs a newer PHP than your require.php.",
    );
  });

  it("sentry/sentry: yours is the newest and admits both, so older misses stay at level 1", () => {
    expect(sentence("koel_koel-all-0.13", "sentry/sentry")).toBe(
      "Yours, the newest, admits your require.php (>=8.3) and PHP 8.4.",
    );
  });

  it("friendsofsymfony/oauth-server-bundle: a snapshot is no branch row, so the one branch is named", () => {
    expect(sentence("wallabag_wallabag-0.13", "friendsofsymfony/oauth-server-bundle")).toBe(
      "Against your require.php (>=8.2) and PHP 8.4: 1.x stops before both.",
    );
  });

  it("rector/rector: no project floor, said once; every branch counted against the target", () => {
    expect(sentence("mautic_mautic-0.13", "rector/rector")).toBe(
      "The project names no PHP floor. 14 branches admit PHP 8.4; 7 stop before it.",
    );
  });

  it("acme/floors: more than two kinds of miss among the newer are counted, the one missing each differently named", () => {
    expect(sentence("mini-0.13-edges", "acme/floors")).toBe(
      "Against your require.php (^8.3) and PHP 8.4: none of the 5 newer branches admits both, 6.x missing the two in different ways; yours, in 1.4.0, stops before both.",
    );
  });

  it("an older report draws nothing: its rows carry none of the fields", () => {
    expect(sentence("wallabag_wallabag", "scheb/2fa-bundle")).toBeNull();
  });

  it("a miss with a way lockrot added later is shown as written, never guessed", () => {
    const rows = [row({ installed: true, admitsTargetPhp: false, missesTargetPhp: "straddles" })];
    expect(plain(floorsSentence(rows, BOTH) ?? [])).toBe(
      "Against your require.php (>=8.2) and PHP 8.4: yours, the newest, does not admit PHP 8.4 (lockrot: straddles).",
    );
  });

  it("a null way is 'does not admit', and two floors missed alike with no way admit neither", () => {
    const rows = [
      row({ branch: "2.x", admitsTargetPhp: false }),
      row({ branch: "1.x", installed: true, admitsTargetPhp: false, admitsProjectPhp: false }),
    ];
    expect(plain(floorsSentence(rows, BOTH) ?? [])).toBe(
      "Against your require.php (>=8.2) and PHP 8.4: 2.x does not admit PHP 8.4; yours admits neither.",
    );
  });

  it("two floors missed in two ways name both, the project's first", () => {
    const rows = [
      row({
        installed: true,
        admitsTargetPhp: false,
        missesTargetPhp: "stops_before",
        admitsProjectPhp: false,
        missesProjectPhp: "needs_newer",
      }),
    ];
    expect(plain(floorsSentence(rows, BOTH) ?? [])).toBe(
      "Against your require.php (>=8.2) and PHP 8.4: yours, the newest, needs a newer PHP than your require.php and stops before PHP 8.4.",
    );
  });

  it("never opens on a branch name: the floors lead instead", () => {
    const rows = [
      row({ branch: "2.x" }),
      row({ branch: "1.x", installed: true, admitsTargetPhp: false, missesTargetPhp: "skips" }),
    ];
    expect(plain(floorsSentence(rows, TARGET_ONLY) ?? [])).toBe(
      "The project names no PHP floor. Against PHP 8.4: 2.x admits it; yours skips it.",
    );
  });

  it("with one floor, a miss reads against it without naming it again", () => {
    const rows = [
      row({ branch: "2.x", admitsTargetPhp: false, missesTargetPhp: "needs_newer" }),
      row({ installed: true }),
    ];
    expect(plain(floorsSentence(rows, TARGET_ONLY) ?? [])).toBe(
      "The project names no PHP floor. Yours admits PHP 8.4; 2.x needs a newer PHP.",
    );
  });

  it("unanswered and unrecorded rows say so, and never count as admitting", () => {
    const rows = [
      row({ branch: "3.x", php: null }),
      row({ branch: "2.x", admitsProjectPhp: null }),
      row({ installed: true }),
    ];
    expect(plain(floorsSentence(rows, BOTH) ?? [])).toBe(
      "Yours admits your require.php (>=8.2) and PHP 8.4; 3.x records no PHP requirement; 2.x has no answer from lockrot.",
    );
  });
});

describe("floorsList: level 1, every branch named", () => {
  it("rector/rector: contiguous runs are compressed, none cut", () => {
    const { rows, floors } = fixture("mautic_mautic-0.13", "rector/rector");
    expect(listed(floorsList(rows, floors))).toEqual([
      "2.x – 0.8.x (14): admit PHP 8.4",
      "0.7.x – 0.1.x (7): stop before PHP 8.4",
    ]);
  });

  it("sentry/sentry: yours breaks a run and is marked; every miss group is named in full", () => {
    const { rows, floors } = fixture("koel_koel-all-0.13", "sentry/sentry");
    expect(listed(floorsList(rows, floors))).toEqual([
      "4.x (yours), 3.x, 0.22.x – 0.1.x (22): admit both",
      "2.x, 1.x: stop before both",
    ]);
  });

  it("acme/floors: an unknown way is quoted as written, apart from the sentence", () => {
    const { rows, floors } = fixture("mini-0.13-edges", "acme/floors");
    expect(listed(floorsList(rows, floors))).toEqual([
      "6.x: needs a newer PHP than your require.php and stops before PHP 8.4",
      "5.x: skips both",
      "4.x: admits no PHP version",
      "3.x: needs a newer PHP than both",
      "2.x: stops before PHP 8.4",
      "1.x (yours): stops before both",
      "0.x: skips your require.php and does not admit PHP 8.4 (lockrot: straddles)",
    ]);
  });

  it("an older report lists nothing", () => {
    const { rows, floors } = fixture("wallabag_wallabag", "scheb/2fa-bundle");
    expect(floorsList(rows, floors)).toEqual([]);
  });
});

describe("foldWords: a closed fold says what it hides", () => {
  it("alike misses in words, the floors named in a cell", () => {
    const { rows, floors } = fixture("wallabag_wallabag-0.13", "phpunit/php-timer");
    expect(foldWords(rows.slice(5), floors)).toBe("3 stop before both");
    const rector = fixture("mautic_mautic-0.13", "rector/rector");
    expect(foldWords(rector.rows.slice(1), rector.floors)).toBe("7 stop before PHP 8.4");
  });

  it("mixed misses are counted; a fold with none says nothing", () => {
    const { rows, floors } = fixture("mini-0.13-edges", "acme/floors");
    expect(foldWords(rows.slice(1, 5), floors)).toBe("4 do not admit both");
    expect(foldWords([row(), row()], BOTH)).toBeNull();
    expect(foldWords([row({ floorFields: false })], BOTH)).toBeNull();
  });
});

describe("floorsDefinition", () => {
  it("defines php, admits and the project's lowest PHP only when the project names one", () => {
    expect(plain(floorsDefinition(BOTH))).toContain("counts from the lowest PHP it allows");
    expect(plain(floorsDefinition(BOTH))).toContain("lockrot does not test it");
    expect(plain(floorsDefinition(TARGET_ONLY))).not.toContain("require.php");
  });
});

describe("moveClause: S8 quoted, the newest's reason from its own row", () => {
  function clause(bundle: string, pkg: string): string | null {
    const { rows, model } = fixture(bundle, pkg);
    const data = model.report.findings
      .find((f) => f.package === pkg)
      ?.signals.find((s) => s.id === "S8")?.data;
    const parts = moveClause(data, rows);
    return parts === null ? null : plain(parts);
  }

  it("a branch within reach, and why the newest is not", () => {
    expect(clause("wallabag_wallabag-0.13", "scheb/2fa-bundle")).toBe(
      "; 7.x fits your require.php, 8.x needs a newer PHP",
    );
  });

  it("none within reach", () => {
    expect(clause("gh_akaunting_akaunting-0.13", "plank/laravel-mediable")).toBe(
      "; no newer branch fits your require.php",
    );
  });

  it("a floor this page does not know, as written", () => {
    expect(clause("mini-0.13-edges", "acme/left")).toBe("; no newer branch fits ext-sodium >=2 (extension)");
  });

  it("the newest within reach, or a document that does not say, keeps the older sentence", () => {
    expect(clause("koel_koel-0.13", "jwilsson/spotify-web-api-php")).toBeNull();
    expect(moveClause({ newest_within_reach: null }, [])).toBeNull();
    expect(moveClause({ branch: "5.x", newest_branch: "8.x" }, [])).toBeNull();
  });

  it("an older report's S8 says the reach, its rows not the way: less said, the same sentence", () => {
    expect(clause("wallabag_wallabag", "scheb/2fa-bundle")).toBe(
      "; 7.x fits your require.php, 8.x does not admit it",
    );
  });

  it("a target floor names the target PHP", () => {
    const data = {
      newest_within_reach: false,
      newest_branch: "9.x",
      reachable_branch: "7.x",
      floor_source: "target",
      floor_php: "8.4",
    };
    const rows = [row({ branch: "9.x", admitsTargetPhp: false, missesTargetPhp: "stops_before" })];
    expect(plain(moveClause(data, rows) ?? [])).toBe("; 7.x fits PHP 8.4, 9.x stops before it");
  });
});
