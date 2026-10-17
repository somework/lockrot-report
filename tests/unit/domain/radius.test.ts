import { describe, expect, it } from "vitest";
import {
  FOLD_SINGLES,
  isRowOpen,
  isSinglesOpen,
  pulledTree,
  radiusAnswer,
  radiusCountPhrase,
  radiusLayout,
  radiusRows,
  rowKey,
  type RadiusExposure,
  type RadiusFinding,
  type RadiusSource,
} from "../../../src/domain/radius";

function finding(pkg: string, extra: Partial<RadiusFinding> = {}): RadiusFinding {
  return {
    package: pkg,
    version: "1.0.0",
    direct: true,
    dev: false,
    verdict: "abandoned",
    rank: 1,
    ...extra,
  };
}

const pulled = (pkg: string, extra: Partial<RadiusFinding> = {}): RadiusFinding =>
  finding(pkg, { direct: false, ...extra });

/** An `exposure[]` entry whose S7 names `members`, each by its chain from `pkg`. */
function entry(
  pkg: string,
  members: readonly (readonly string[])[],
  flagged = members.length,
): RadiusExposure {
  return {
    package: pkg,
    flagged,
    members: members.map((hops) => ({ package: hops.at(-1) ?? "", chain: [pkg, ...hops] })),
  };
}

function source(
  findings: readonly RadiusFinding[],
  exposure: readonly RadiusExposure[],
  unattributed: readonly string[] = [],
): RadiusSource {
  return { report: { exposure, unattributed: unattributed.map((p) => ({ package: p })), findings } };
}

const CLOSED = { disclosure: {}, pkg: null, narrow: false } as const;

describe("radiusRows", () => {
  it("lists what the requirement's S7 names, its own flag kept apart", () => {
    const parent = finding("acme/parent");
    const child = pulled("acme/child");
    const model = source([parent, child], [entry("acme/parent", [["acme/child"]], 99)]);

    const [row] = radiusRows(model, [parent, child]);

    expect(row?.pulled.map((f) => f.package)).toEqual(["acme/child"]);
    expect(row?.count).toBe(1);
    expect(row?.self?.package).toBe("acme/parent");
    expect(row?.exposure).toBe(99);
  });

  it("lists under each requirement whose S7 names it, never by the first hop of its own chain", () => {
    const deep = pulled("acme/deep");
    const model = source(
      [deep],
      [entry("acme/bundle", [["acme/lib", "acme/deep"]]), entry("acme/lib", [["acme/deep"]])],
    );

    const [bundle, lib] = radiusRows(model, [deep]);

    expect(bundle?.pulled.map((f) => f.package)).toEqual(["acme/deep"]);
    expect(lib?.pulled.map((f) => f.package)).toEqual(["acme/deep"]);
  });

  it("takes version and dev from the requirement's own finding, and null without one", () => {
    const own = finding("acme/own", { version: "2.3.4", dev: true });
    const model = source([own], [entry("acme/own", []), entry("acme/none", [])]);

    const [withOwn, without] = radiusRows(model, []);

    expect([withOwn?.version, withOwn?.dev]).toEqual(["2.3.4", true]);
    expect([without?.version, without?.dev]).toEqual([null, false]);
  });
});

describe("radiusLayout", () => {
  it("keeps exposure[]'s order, never a count of its own", () => {
    const flagged = ["a/1", "b/1", "b/2", "c/1"].map((name) => pulled(name));
    const model = source(flagged, [
      entry("a/parent", [["a/1"]], 1),
      entry("b/parent", [["b/1"], ["b/2"]], 2),
      entry("c/parent", [["c/1"]], 1),
    ]);

    const layout = radiusLayout(model, flagged);

    expect(layout.rows.map((r) => r.package)).toEqual(["a/parent", "b/parent", "c/parent"]);
    expect(layout.lead).toEqual(layout.rows);
    expect(layout.singles).toEqual([]);
  });

  it("folds four or more trailing one-each rows under the rows that list more", () => {
    const names = ["p1", "p2", "p3", "p4"];
    const flagged = [pulled("big/1"), pulled("big/2"), ...names.map((n) => pulled(`x/${n}`))];
    const model = source(flagged, [
      entry("big/parent", [["big/1"], ["big/2"]]),
      ...names.map((n) => entry(`v/${n}`, [[`x/${n}`]])),
    ]);

    const layout = radiusLayout(model, flagged);

    expect(layout.lead.map((r) => r.package)).toEqual(["big/parent"]);
    expect(layout.singles.map((r) => r.package)).toEqual(names.map((n) => `v/${n}`));
  });

  it("keeps a requirement whose S7 names no finding, with lockrot's count", () => {
    const model = source([], [entry("acme/lib", [["acme/unknown"]], 3)]);

    const layout = radiusLayout(model, []);

    expect(layout.rows.map((r) => [r.package, r.count, r.unfiltered, r.exposure])).toEqual([
      ["acme/lib", 0, 0, 3],
    ]);
  });

  it("names the flagged direct requirements exposure[] leaves out, and none of them is a row", () => {
    const alone = finding("acme/alone");
    const model = source([alone], [entry("acme/lib", [])]);

    const layout = radiusLayout(model, [alone]);

    expect(layout.unlisted.map((f) => f.package)).toEqual(["acme/alone"]);
    expect(layout.exposureCount).toBe(1);
  });

  it("lists an unattributed package on the layout's list, in its order", () => {
    const shared = pulled("acme/shared");
    const model = source([shared], [entry("acme/lib", [])], ["acme/shared", "acme/ghost"]);

    expect(radiusLayout(model, [shared]).unattributed).toEqual([shared]);
    expect(radiusLayout(model, [], [shared]).unattributed).toEqual([]);
  });
});

describe("under a filter (PD-RADIUS-6)", () => {
  const parent = finding("acme/parent");
  const a = pulled("acme/a");
  const b = pulled("acme/b", { verdict: "stale" });
  const other = pulled("zeta/x");
  const all = [parent, a, b, other];
  const model = source(all, [
    entry("acme/parent", [["acme/a"], ["acme/b"]]),
    entry("zeta/root", [["zeta/x"]]),
  ]);

  it("keeps each row's unfiltered count beside the filtered one, and says it is narrowed", () => {
    const layout = radiusLayout(model, [parent, a], all);

    expect(layout.narrowed).toBe(true);
    expect(layout.rows.map((r) => [r.package, r.count, r.unfiltered])).toEqual([["acme/parent", 1, 2]]);
    expect([layout.unfilteredTotal, layout.unfilteredRows]).toEqual([3, 2]);
  });

  it("keeps a flagged requirement whose packages the filter hides, still counting them", () => {
    const layout = radiusLayout(model, [parent], all);

    expect(layout.rows.map((r) => [r.package, r.count, r.unfiltered])).toEqual([["acme/parent", 0, 2]]);
  });

  it("is not narrowed when the filter keeps every flagged package", () => {
    const layout = radiusLayout(model, all, all);

    expect(layout.narrowed).toBe(false);
    expect(layout.rows.every((r) => r.count === r.unfiltered)).toBe(true);
  });
});

describe("radiusCountPhrase", () => {
  it("keeps the plain count when exposure[] names every flagged direct requirement", () => {
    const parent = finding("acme/parent");
    const model = source([parent], [entry("acme/parent", [])]);

    expect(radiusCountPhrase(radiusLayout(model, [parent]))).toBe("1 of 1 direct requirement");
  });

  const listed = [pulled("x/1"), pulled("y/1")];
  const left = [finding("u/1"), finding("u/2")];
  const everything = [...listed, ...left];
  const model = source(everything, [entry("a/p", [["x/1"]]), entry("b/p", [["y/1"]])]);

  it("says which list it counts and adds the flagged direct requirements with nothing flagged counted under them", () => {
    const layout = radiusLayout(model, everything, everything);

    expect(radiusCountPhrase(layout)).toBe(
      "2 of 2 direct requirements on the exposure list, plus 2 of 2 flagged ones with nothing flagged counted under them",
    );
  });

  it("counts the left-out ones a filter keeps against all of them", () => {
    const layout = radiusLayout(model, [left[0] as RadiusFinding], everything);

    expect(radiusCountPhrase(layout)).toMatch(
      /, plus 1 of 2 flagged ones with nothing flagged counted under them$/,
    );
  });
});

describe("pulledTree", () => {
  it("hangs each package under the nearest listed hop of its S7 chain, naming unflagged hops as via", () => {
    // root → ruler → compiler → iterator; root → ruler → (unflagged) glue → math.
    const ruler = pulled("h/ruler", { rank: 1 });
    const compiler = pulled("h/compiler", { rank: 2 });
    const iterator = pulled("h/iterator", { rank: 3 });
    const math = pulled("h/math", { rank: 4 });
    const model = source(
      [],
      [
        entry("w/root", [
          ["h/ruler"],
          ["h/ruler", "h/compiler"],
          ["h/ruler", "h/compiler", "h/iterator"],
          ["h/ruler", "h/glue", "h/math"],
        ]),
      ],
    );
    const [row] = radiusRows(model, [iterator, math, compiler, ruler]);
    if (!row) throw new Error("no row");

    expect(pulledTree(row).map((n) => [n.finding.package, n.depth, n.via, n.last, n.rails])).toEqual([
      ["h/ruler", 0, [], true, []],
      ["h/compiler", 1, [], false, [false]],
      ["h/iterator", 2, [], true, [false, true]],
      ["h/math", 1, ["h/glue"], true, [false]],
    ]);
  });

  it("orders siblings by rank, not by name", () => {
    const first = pulled("zzz/first", { rank: 1 });
    const second = pulled("aaa/second", { rank: 2 });
    const [row] = radiusRows(source([], [entry("w/root", [["aaa/second"], ["zzz/first"]])]), [second, first]);
    if (!row) throw new Error("no row");

    expect(pulledTree(row).map((n) => n.finding.package)).toEqual(["zzz/first", "aaa/second"]);
  });
});

describe("radiusAnswer", () => {
  it("names the fewest rows, in exposure[] order, that hold half the listed packages, at most three", () => {
    const flagged = ["a/1", "a/2", "a/3", "b/1", "b/2", "c/1", "c/2"].map((name) => pulled(name));
    const model = source(flagged, [
      entry("a/p", [["a/1"], ["a/2"], ["a/3"]]),
      entry("b/p", [["b/1"], ["b/2"]]),
      entry("c/p", [["c/1"], ["c/2"]]),
    ]);

    const answer = radiusAnswer(radiusLayout(model, flagged));

    expect(answer?.top.map((r) => r.package)).toEqual(["a/p", "b/p"]);
    expect(answer).toMatchObject({ held: 5, total: 7, rows: 3, exposureCount: 3 });
  });

  it("is null when no row lists a finding", () => {
    expect(radiusAnswer(radiusLayout(source([], [entry("a/p", [["x/1"]])]), []))).toBeNull();
  });
});

describe("what is open (PD-RADIUS-3)", () => {
  const names = ["p1", "p2", "p3", "p4"];
  const flagged = [pulled("big/1"), pulled("big/2"), ...names.map((n) => pulled(`x/${n}`))];
  const layout = radiusLayout(
    source(flagged, [
      entry("big/parent", [["big/1"], ["big/2"]]),
      ...names.map((n) => entry(`v/${n}`, [[`x/${n}`]])),
    ]),
    flagged,
  );
  const bigRow = layout.lead[0];
  if (!bigRow) throw new Error("no row");

  it("starts every row closed and the one-each fold open, except on a phone", () => {
    expect(isRowOpen(layout, bigRow, CLOSED)).toBe(false);
    expect(isSinglesOpen(layout, CLOSED)).toBe(true);
    expect(isSinglesOpen(layout, { ...CLOSED, narrow: true })).toBe(false);
  });

  it("opens the row and fold that list the open package", () => {
    const input = { disclosure: {}, pkg: "x/p3", narrow: true };
    const p3 = layout.singles.find((row) => row.package === "v/p3");
    if (!p3) throw new Error("no row");

    expect(isSinglesOpen(layout, input)).toBe(true);
    expect(isRowOpen(layout, p3, input)).toBe(true);
    expect(isRowOpen(layout, bigRow, input)).toBe(false);
  });

  it("opens one row for a package S7 lists under several: one the reader opened, else the first", () => {
    const shared = pulled("x/shared");
    const both = radiusLayout(
      source([shared], [entry("a/first", [["x/shared"]]), entry("b/second", [["x/shared"]])]),
      [shared],
    );
    const [first, second] = both.rows;
    if (!first || !second) throw new Error("no rows");
    const byLink = { disclosure: {}, pkg: "x/shared", narrow: false };
    const opened = { ...byLink, disclosure: { [rowKey("b/second")]: true } };

    expect([isRowOpen(both, first, byLink), isRowOpen(both, second, byLink)]).toEqual([true, false]);
    expect([isRowOpen(both, first, opened), isRowOpen(both, second, opened)]).toEqual([false, true]);
  });

  it("follows what the reader opened or closed over any default", () => {
    const input = {
      disclosure: { [rowKey("big/parent")]: true, [FOLD_SINGLES]: false },
      pkg: "x/p1",
      narrow: false,
    };

    expect(isRowOpen(layout, bigRow, input)).toBe(true);
    expect(isSinglesOpen(layout, input)).toBe(false);
  });
});
