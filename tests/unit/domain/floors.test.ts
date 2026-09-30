import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOORS_STEPS,
  floorsAnswer,
  floorsDefinition,
  foldWords,
  plain,
  fitsOnceWords,
  moveClause,
  otherFloor,
  readFloors,
  standing,
  type FloorGroup,
  type Floors,
  type FloorsStep,
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

function fixture(
  bundle: string,
  pkg: string,
): { rows: readonly BranchRow[]; floors: Floors; model: Model; installed: string } {
  const model = load(bundle);
  const rows = model.details.get(pkg)?.metadata?.branches;
  if (rows === undefined) throw new Error(`${pkg} has no branches in ${bundle}`);
  const installed = model.report.findings.find((f) => f.package === pkg)?.version ?? "";
  return { rows, floors: readFloors(model.report.run, model.report.absent), model, installed };
}

function sentence(bundle: string, pkg: string): string | null {
  const { rows, floors, installed } = fixture(bundle, pkg);
  const answer = floorsAnswer(rows, floors, installed);
  return answer === null ? null : plain(answer.sentence);
}

function rest(bundle: string, pkg: string): string[] {
  const { rows, floors, installed } = fixture(bundle, pkg);
  return listed(floorsAnswer(rows, floors, installed)?.rest ?? []);
}

function said(rows: readonly BranchRow[], floors: Floors, installed = "1.0.0"): string {
  return plain(floorsAnswer(rows, floors, installed)?.sentence ?? []);
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
      unanswered: [],
      blockedBy: null,
    });
    expect(standing(row({ admitsTargetPhp: null }), BOTH)).toEqual({
      kind: "unanswered",
      floors: ["target"],
    });
    expect(standing(row({ floorFields: false }), BOTH)).toBeNull();
  });

  it("a false never reads as null, and the null beside it is kept as no answer", () => {
    expect(standing(row({ admitsTargetPhp: null, admitsProjectPhp: false }), BOTH)).toEqual({
      kind: "misses",
      misses: [{ floor: "project", code: null }],
      unanswered: ["target"],
      blockedBy: null,
    });
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

describe("floorsAnswer: level 0, yours first, then the newer branches", () => {
  it("scheb/2fa-bundle: the newest says how it misses require.php's lowest PHP and what it waits for; what it admits is left to level 1", () => {
    expect(sentence("wallabag_wallabag-0.13", "scheb/2fa-bundle")).toBe(
      "Yours, 7.x and 6.x admit your require.php (>=8.2) and PHP 8.4; 8.x needs a newer PHP than your require.php allows at its lowest — it fits once your require.php starts higher.",
    );
    expect(rest("wallabag_wallabag-0.13", "scheb/2fa-bundle")).toEqual([
      "8.x: needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
    ]);
  });

  it("plank/laravel-mediable: counts only the newer branches and yours; the older ones wait at level 1", () => {
    expect(sentence("gh_akaunting_akaunting-0.13", "plank/laravel-mediable")).toBe(
      "Yours admits your require.php (^8.1) and PHP 8.4; 7.x and 6.x need a newer PHP than your require.php allows at its lowest — they fit once your require.php starts higher.",
    );
    expect(rest("gh_akaunting_akaunting-0.13", "plank/laravel-mediable")).toEqual([
      "7.x, 6.x: need a newer PHP than your require.php allows at its lowest but admit PHP 8.4 — they fit once your require.php starts higher",
      "0.1.x – 4.x (7): admit both",
    ]);
  });

  it("acme/left: yours at the release its php comes from, its full standing at level 1; an unknown blocker as written, apart", () => {
    expect(sentence("mini-0.13-edges", "acme/left")).toBe(
      "Yours (as of 1.9.0) needs a newer PHP than your require.php (^8.3) allows at its lowest — it fits once your require.php starts higher; 3.x and 2.x are blocked by extension.",
    );
    expect(rest("mini-0.13-edges", "acme/left")).toEqual([
      "3.x, 2.x: admit both but are blocked by extension",
      "1.x (yours): needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
      "0.x: has no php recorded, so neither could be checked",
    ]);
  });

  it("sentry/sentry: yours is the newest and admits both, so older misses stay at level 1", () => {
    expect(sentence("koel_koel-all-0.13", "sentry/sentry")).toBe(
      "Yours, the newest, admits your require.php (>=8.3) and PHP 8.4.",
    );
    expect(rest("koel_koel-all-0.13", "sentry/sentry")).toEqual([
      "3.x, 0.1.x – 0.22.x (22): admit both",
      "2.x, 1.x: stop before both",
    ]);
  });

  it("friendsofsymfony/oauth-server-bundle: a snapshot is no branch row; the one branch, fully said, leaves no level 1", () => {
    expect(sentence("wallabag_wallabag-0.13", "friendsofsymfony/oauth-server-bundle")).toBe(
      "Against your require.php (>=8.2) and PHP 8.4: 1.x stops before both.",
    );
    expect(rest("wallabag_wallabag-0.13", "friendsofsymfony/oauth-server-bundle")).toEqual([]);
  });

  it("rector/rector: no project floor, said once; every branch counted, so level 1 names them all", () => {
    expect(sentence("mautic_mautic-0.13", "rector/rector")).toBe(
      "The project names no PHP floor. 14 branches admit PHP 8.4; 7 stop before it.",
    );
    expect(rest("mautic_mautic-0.13", "rector/rector")).toEqual([
      "0.8.x – 2.x (14): admit PHP 8.4",
      "0.1.x – 0.7.x (7): stop before PHP 8.4",
    ]);
  });

  it("acme/floors: more than two kinds of miss among the newer are counted; how each misses is level 1's", () => {
    expect(sentence("mini-0.13-edges", "acme/floors")).toBe(
      "Yours stops before your require.php (^8.3) and PHP 8.4; no newer branch admits both.",
    );
    expect(rest("mini-0.13-edges", "acme/floors")).toEqual([
      "6.x: needs a newer PHP than your require.php allows at its lowest and stops before PHP 8.4",
      "5.x: skips both",
      "4.x: admits no PHP version",
      "3.x: needs a newer PHP than both",
      "2.x: stops before PHP 8.4 but admits your require.php",
      "0.x: skips the lowest PHP your require.php allows and does not admit PHP 8.4 (lockrot: straddles)",
    ]);
  });

  it("an older report draws nothing: its rows carry none of the fields", () => {
    expect(sentence("wallabag_wallabag", "scheb/2fa-bundle")).toBeNull();
  });

  it("a miss with a way lockrot added later is shown as written, never guessed", () => {
    const rows = [row({ installed: true, admitsTargetPhp: false, missesTargetPhp: "straddles" })];
    expect(said(rows, BOTH)).toBe("Yours, the newest, does not admit PHP 8.4 (lockrot: straddles).");
  });

  it("a null way is 'does not admit', never 'misses'; two floors missed alike with no way admit neither", () => {
    const rows = [
      row({ branch: "2.x", admitsTargetPhp: false }),
      row({ branch: "1.x", installed: true, admitsTargetPhp: false, admitsProjectPhp: false }),
    ];
    expect(said(rows, BOTH)).toBe(
      "Yours admits neither your require.php (>=8.2) nor PHP 8.4; 2.x does not admit PHP 8.4.",
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
    expect(said(rows, BOTH)).toBe(
      "Yours, the newest, needs a newer PHP than your require.php (>=8.2) allows at its lowest and stops before PHP 8.4.",
    );
  });

  it("yours names the release its php comes from only when that is not the version installed", () => {
    const rows = [
      row({ installed: true, newestDated: "1.9.0", admitsTargetPhp: false, missesTargetPhp: "skips" }),
    ];
    expect(said(rows, BOTH, "1.4.0")).toBe("Yours (as of 1.9.0) skips PHP 8.4.");
    expect(said(rows, BOTH, "1.9.0")).toBe("Yours, the newest, skips PHP 8.4.");
    const admitting = [row({ installed: true, newestDated: "1.9.0" })];
    expect(said(admitting, BOTH, "1.4.0")).toBe(
      "Yours, the newest, admits your require.php (>=8.2) and PHP 8.4.",
    );
  });

  it("never opens on a branch name: without yours the floors lead", () => {
    const rows = [
      row({ branch: "2.x" }),
      row({ branch: "1.x", admitsTargetPhp: false, missesTargetPhp: "skips" }),
    ];
    expect(said(rows, TARGET_ONLY)).toBe(
      "The project names no PHP floor. Against PHP 8.4: 2.x admits it; 1.x skips it.",
    );
  });

  it("with one floor, later clauses say it; a newer PHP always names what it is newer than", () => {
    const rows = [
      row({ branch: "2.x", admitsTargetPhp: false, missesTargetPhp: "needs_newer" }),
      row({ branch: "1.x", installed: true, admitsTargetPhp: false, missesTargetPhp: "skips" }),
    ];
    expect(said(rows, TARGET_ONLY)).toBe(
      "The project names no PHP floor. Yours skips PHP 8.4; 2.x needs a newer PHP than 8.4.",
    );
  });

  it("unanswered and unrecorded rows say so, and never count as admitting", () => {
    const rows = [
      row({ branch: "3.x", php: null }),
      row({ branch: "2.x", admitsProjectPhp: null }),
      row({ installed: true }),
    ];
    expect(said(rows, BOTH)).toBe(
      "Yours admits your require.php (>=8.2) and PHP 8.4; 3.x has no php recorded, so neither could be checked; 2.x has no answer for your require.php.",
    );
  });

  it("a floor with no answer beside a miss is named as no answer, never dropped", () => {
    const rows = [
      row({
        installed: true,
        admitsProjectPhp: null,
        admitsTargetPhp: false,
        missesTargetPhp: "stops_before",
      }),
    ];
    expect(said(rows, BOTH)).toBe(
      "Yours, the newest, stops before PHP 8.4 and has no answer for your require.php (>=8.2).",
    );
    const newer = [
      row({ branch: "2.x", admitsProjectPhp: null, admitsTargetPhp: false, missesTargetPhp: "stops_before" }),
      row({ installed: true }),
    ];
    expect(said(newer, BOTH)).toBe(
      "Yours admits your require.php (>=8.2) and PHP 8.4; 2.x stops before PHP 8.4 and has no answer for your require.php.",
    );
  });
});

describe("floorsAnswer: the shorter steps where the full sentence would take a third line", () => {
  function at(step: FloorsStep, bundle: string, pkg: string): { sentence: string; rest: string[] } {
    const { rows, floors, installed } = fixture(bundle, pkg);
    const answer = floorsAnswer(rows, floors, installed, step);
    return { sentence: plain(answer?.sentence ?? []), rest: listed(answer?.rest ?? []) };
  }

  it("unquoted: require.php's constraint is left to level 1's definitions; nothing else moves", () => {
    expect(at("unquoted", "mini-0.13-edges", "acme/left")).toEqual({
      sentence:
        "Yours (as of 1.9.0) needs a newer PHP than your require.php allows at its lowest; 3.x and 2.x are blocked by extension.",
      rest: rest("mini-0.13-edges", "acme/left"),
    });
    expect(at("unquoted", "wallabag_wallabag-0.13", "friendsofsymfony/oauth-server-bundle").sentence).toBe(
      "Against your require.php and PHP 8.4: 1.x stops before both.",
    );
  });

  it("first: the first clause that says a miss, alone and unquoted; every other branch on level 1's list", () => {
    expect(at("first", "wallabag_wallabag-0.13", "phpunit/php-timer")).toEqual({
      sentence: "9.x and 8.x need a newer PHP than your require.php allows at its lowest.",
      rest: [
        "9.x, 8.x: need a newer PHP than your require.php allows at its lowest but admit PHP 8.4 — they fit once your require.php starts higher",
        "7.x, 6.x, 5.x (yours), 2.x: admit both",
        "4.x, 3.x, 1.x: stop before both",
      ],
    });
    expect(at("first", "mini-0.13-edges", "acme/left")).toEqual({
      sentence: "Yours (as of 1.9.0) needs a newer PHP than your require.php allows at its lowest.",
      rest: rest("mini-0.13-edges", "acme/left"),
    });
    expect(at("first", "wallabag_wallabag-0.13", "scheb/2fa-bundle")).toEqual({
      sentence: "8.x needs a newer PHP than your require.php allows at its lowest.",
      rest: [
        "8.x: needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
        "7.x, 6.x, 5.x (yours): admit both",
      ],
    });
  });

  it("first: with no clause that misses, the first clause alone", () => {
    expect(at("first", "koel_koel-all-0.13", "sentry/sentry").sentence).toBe(
      "Yours, the newest, admits your require.php and PHP 8.4.",
    );
  });

  it("every step keeps why the newest branch does not fit, the last resort too", () => {
    for (const step of FLOORS_STEPS) {
      expect(at(step, "wallabag_wallabag-0.13", "scheb/2fa-bundle").sentence, step).toContain(
        "8.x needs a newer PHP than your require.php",
      );
    }
  });

  it("first: a newer branch the full sentence said in full moves to level 1's list", () => {
    const rows = [
      row({ branch: "2.x" }),
      row({ branch: "1.x", installed: true, admitsTargetPhp: false, missesTargetPhp: "skips" }),
    ];
    expect(said(rows, BOTH)).toBe("Yours skips PHP 8.4; 2.x admits your require.php (>=8.2) and PHP 8.4.");
    expect(listed(floorsAnswer(rows, BOTH, "1.0.0")?.rest ?? [])).toEqual([
      "1.x (yours): skips PHP 8.4 but admits your require.php",
    ]);
    const first = floorsAnswer(rows, BOTH, "1.0.0", "first");
    expect(plain(first?.sentence ?? [])).toBe("Yours skips PHP 8.4.");
    expect(listed(first?.rest ?? [])).toEqual([
      "2.x: admits both",
      "1.x (yours): skips PHP 8.4 but admits your require.php",
    ]);
  });

  it("plain: what a miss waits for moves to level 1's list; the constraint stays quoted", () => {
    expect(at("plain", "wallabag_wallabag-0.13", "scheb/2fa-bundle")).toEqual({
      sentence:
        "Yours, 7.x and 6.x admit your require.php (>=8.2) and PHP 8.4; 8.x needs a newer PHP than your require.php allows at its lowest.",
      rest: [
        "8.x: needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
      ],
    });
  });

  it("missing: only the clauses that say a miss, the first of them quoting; the rows that admit wait at level 1", () => {
    expect(at("missing", "wallabag_wallabag-0.13", "scheb/2fa-bundle")).toEqual({
      sentence:
        "8.x needs a newer PHP than your require.php (>=8.2) allows at its lowest — it fits once your require.php starts higher.",
      rest: [
        "8.x: needs a newer PHP than your require.php allows at its lowest but admits PHP 8.4 — it fits once your require.php starts higher",
        "7.x, 6.x, 5.x (yours): admit both",
      ],
    });
    expect(at("missing-plain", "wallabag_wallabag-0.13", "scheb/2fa-bundle").sentence).toBe(
      "8.x needs a newer PHP than your require.php (>=8.2) allows at its lowest.",
    );
    expect(at("missing-unquoted", "wallabag_wallabag-0.13", "scheb/2fa-bundle")).toEqual({
      sentence: "8.x needs a newer PHP than your require.php allows at its lowest.",
      rest: at("missing", "wallabag_wallabag-0.13", "scheb/2fa-bundle").rest,
    });
  });

  it("missing: with no clause that misses, the first clause stands alone, quoted", () => {
    expect(at("missing", "koel_koel-all-0.13", "sentry/sentry")).toEqual({
      sentence: "Yours, the newest, admits your require.php (>=8.3) and PHP 8.4.",
      rest: at("first", "koel_koel-all-0.13", "sentry/sentry").rest,
    });
  });

  it("a run naming no project floor has no constraint to leave", () => {
    expect(at("unquoted", "mautic_mautic-0.13", "rector/rector").sentence).toBe(
      sentence("mautic_mautic-0.13", "rector/rector"),
    );
  });
});

describe("floorsAnswer: level 1, every branch the sentence left", () => {
  it("contiguous runs are compressed oldest first, as the fold rows read, and none is cut", () => {
    expect(rest("wallabag_wallabag-0.13", "phpunit/php-timer")).toEqual([
      "9.x, 8.x: need a newer PHP than your require.php allows at its lowest but admit PHP 8.4 — they fit once your require.php starts higher",
      "4.x, 3.x, 1.x: stop before both",
      "2.x: admits both",
    ]);
  });

  it("jwilsson: a group of older branches past a gap starts a new run", () => {
    expect(rest("koel_koel-0.13", "jwilsson/spotify-web-api-php")).toEqual([
      "4.x, 0.1.x – 0.10.x (10): admit both",
      "1.x – 3.x (3): stop before both",
    ]);
  });

  it("an older report lists nothing", () => {
    expect(rest("wallabag_wallabag", "scheb/2fa-bundle")).toEqual([]);
  });
});

describe("foldWords: a closed fold says what it hides", () => {
  it("alike misses in words, the floors named in a cell", () => {
    const { rows, floors } = fixture("wallabag_wallabag-0.13", "phpunit/php-timer");
    expect(foldWords(rows.slice(5), floors)).toBe("3 stop before both");
    const rector = fixture("mautic_mautic-0.13", "rector/rector");
    expect(foldWords(rector.rows.slice(1), rector.floors)).toBe("7 stop before PHP 8.4");
  });

  it("rows each missing the same one of two floors say it, never that they admit only the other", () => {
    const { rows, floors } = fixture("wallabag_wallabag-0.13", "phpunit/php-timer");
    expect(foldWords(rows.slice(0, 2), floors)).toBe("2 miss your require.php");
  });

  it("mixed misses are counted as missing one or both; a fold with none says nothing", () => {
    const { rows, floors } = fixture("mini-0.13-edges", "acme/floors");
    expect(foldWords(rows.slice(1, 5), floors)).toBe("4 miss one or both");
    expect(foldWords([row(), row()], BOTH)).toBeNull();
    expect(foldWords([row({ floorFields: false })], BOTH)).toBeNull();
  });
});

describe("fitsOnceWords: what a row missing only require.php's lowest PHP waits for", () => {
  const needs = { floor: "project" as const, code: "needs_newer" };

  it("only a single needs_newer against the project, with nothing unanswered or blocked", () => {
    const one = { kind: "misses" as const, misses: [needs], unanswered: [], blockedBy: null };
    expect(plain(fitsOnceWords(one, false))).toBe(" — it fits once your require.php starts higher");
    expect(plain(fitsOnceWords(one, true))).toBe(" — they fit once your require.php starts higher");
    expect(fitsOnceWords({ ...one, unanswered: ["target"] }, false)).toEqual([]);
    expect(fitsOnceWords({ ...one, blockedBy: "extension" }, false)).toEqual([]);
    expect(
      fitsOnceWords({ ...one, misses: [needs, { floor: "target", code: "stops_before" }] }, false),
    ).toEqual([]);
  });

  it("no other way, no target, no null or unknown way: nothing is promised", () => {
    const miss = (floor: "project" | "target", code: string | null) => ({
      kind: "misses" as const,
      misses: [{ floor, code }],
      unanswered: [],
      blockedBy: null,
    });
    expect(fitsOnceWords(miss("project", "stops_before"), false)).toEqual([]);
    expect(fitsOnceWords(miss("project", null), false)).toEqual([]);
    expect(fitsOnceWords(miss("project", "straddles"), false)).toEqual([]);
    expect(fitsOnceWords(miss("target", "needs_newer"), false)).toEqual([]);
    expect(fitsOnceWords({ kind: "admits", blockedBy: null }, false)).toEqual([]);
  });
});

describe("the project's floor missed in each way, against its lowest PHP", () => {
  it("stops before, skips, a null way and an unknown one name the lowest PHP require.php allows", () => {
    const way = (code: string | null) =>
      said([row({ installed: true, admitsProjectPhp: false, missesProjectPhp: code })], BOTH);
    expect(way("stops_before")).toBe(
      "Yours, the newest, stops before the lowest PHP your require.php (>=8.2) allows.",
    );
    expect(way("skips")).toBe("Yours, the newest, skips the lowest PHP your require.php (>=8.2) allows.");
    expect(way(null)).toBe(
      "Yours, the newest, does not admit the lowest PHP your require.php (>=8.2) allows.",
    );
    expect(way("straddles")).toBe(
      "Yours, the newest, does not admit the lowest PHP your require.php (>=8.2) allows (lockrot: straddles).",
    );
    expect(way("unsatisfiable")).toBe("Yours, the newest, admits no PHP version.");
  });
});

describe("floorsDefinition", () => {
  it("defines php, admits and the project's lowest PHP only when the project names one", () => {
    expect(plain(floorsDefinition(BOTH))).toContain("counts from the lowest PHP it allows");
    expect(plain(floorsDefinition(BOTH))).toContain("lockrot does not test it");
    expect(plain(floorsDefinition(TARGET_ONLY))).not.toContain("require.php");
  });
});

describe("moveClause: S8 quoted in the words its ledger why uses", () => {
  function clause(bundle: string, pkg: string): string | null {
    const { model } = fixture(bundle, pkg);
    const data = model.report.findings
      .find((f) => f.package === pkg)
      ?.signals.find((s) => s.id === "S8")?.data;
    const parts = moveClause(data);
    return parts === null ? null : plain(parts);
  }

  it("names the newest branch that fits; why the newest does not is Release branches' to say", () => {
    expect(clause("wallabag_wallabag-0.13", "scheb/2fa-bundle")).toBe(
      "; 7.x is the newest that fits your require.php",
    );
    expect(clause("mini-0.13-edges-lock-only", "acme/left")).toBe("; 2.x is the newest that fits PHP 8.4");
  });

  it("none within reach, against S8's floor: known in the sentence's names, unknown as written, none unnamed", () => {
    expect(clause("gh_akaunting_akaunting-0.13", "plank/laravel-mediable")).toBe(
      "; no newer branch fits your require.php",
    );
    expect(clause("mini-0.13-edges", "acme/left")).toBe("; no newer branch fits the extension floor");
    expect(
      plain(moveClause({ newest_within_reach: false, newest_branch: "3.x", floor_source: "target" }) ?? []),
    ).toBe("; no newer branch fits the target PHP");
    expect(
      plain(moveClause({ newest_within_reach: false, newest_branch: "3.x", floor_source: null }) ?? []),
    ).toBe("; no newer branch fits");
  });

  it("the newest within reach, or a document that does not say, keeps the older sentence", () => {
    expect(clause("koel_koel-0.13", "jwilsson/spotify-web-api-php")).toBeNull();
    expect(moveClause({ newest_within_reach: null, newest_branch: "8.x" })).toBeNull();
    expect(moveClause({ branch: "5.x", newest_branch: "8.x" })).toBeNull();
    expect(moveClause({ newest_within_reach: false })).toBeNull();
  });

  it("an older report's S8 reads the same", () => {
    expect(clause("wallabag_wallabag", "scheb/2fa-bundle")).toBe(
      "; 7.x is the newest that fits your require.php",
    );
  });
});

describe("otherFloor: S8's floor when it is neither of the run's own", () => {
  function s8(bundle: string, pkg: string): Readonly<Record<string, unknown>> | undefined {
    return load(bundle)
      .report.findings.find((f) => f.package === pkg)
      ?.signals.find((s) => s.id === "S8")?.data;
  }

  it("an unknown source and its floor, both as written (mini acme/left)", () => {
    expect(otherFloor(s8("mini-0.13-edges", "acme/left"))).toEqual({
      source: "extension",
      php: "ext-sodium >=2",
    });
  });

  it("the project's or the target's floor is the sentence's own, so nothing more is said", () => {
    expect(otherFloor(s8("wallabag_wallabag-0.13", "scheb/2fa-bundle"))).toBeNull();
    expect(otherFloor(s8("mini-0.13-edges-lock-only", "acme/left"))).toBeNull();
  });

  it("null, absent or empty source or floor says nothing, and never stands for a default", () => {
    expect(otherFloor({ floor_source: "extension", floor_php: null })).toBeNull();
    expect(otherFloor({ floor_source: null, floor_php: ">=2" })).toBeNull();
    expect(otherFloor({ floor_php: ">=2" })).toBeNull();
    expect(otherFloor({ floor_source: "extension", floor_php: "" })).toBeNull();
    expect(otherFloor(undefined)).toBeNull();
  });

  it("is said at level 1, as its own sentence tied to no row; level 0 keeps to its two lines", () => {
    const { rows, floors, installed, model } = fixture("mini-0.13-edges", "acme/left");
    const data = model.report.findings
      .find((f) => f.package === "acme/left")
      ?.signals.find((s) => s.id === "S8")?.data;
    const definition = floorsDefinition(floors, otherFloor(data));
    expect(plain(definition)).toMatch(/ lockrot reads the extension floor as ext-sodium >=2\.$/);
    expect(definition.filter((p) => p.kind === "code").map((p) => p.text)).toEqual([
      "require.php (^8.3)",
      "extension",
      "ext-sodium >=2",
    ]);
    expect(plain(floorsAnswer(rows, floors, installed)?.sentence ?? [])).toBe(
      "Yours (as of 1.9.0) needs a newer PHP than your require.php (^8.3) allows at its lowest — it fits once your require.php starts higher; 3.x and 2.x are blocked by extension.",
    );
    expect(plain(floorsDefinition(floors))).not.toContain("ext-sodium");
  });
});
