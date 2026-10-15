import { describe, expect, it } from "vitest";
import {
  FOLD_OTHER,
  FOLD_SELF,
  FOLD_SINGLES,
  isFoldOpen,
  isRowOpen,
  pulledTree,
  radiusAnswer,
  radiusCountPhrase,
  radiusLayout,
  radiusRows,
  rowKey,
  type RadiusFinding,
  type RadiusSource,
} from "../../../src/domain/radius";

type Exposure = readonly { package: string; flagged: number }[];

function finding(pkg: string, extra: Partial<RadiusFinding> = {}): RadiusFinding {
  return {
    package: pkg,
    version: "1.0.0",
    chain: [],
    direct: true,
    dev: false,
    directDependents: [],
    verdict: "abandoned",
    rank: 1,
    ...extra,
  };
}

/** A transitive package whose chain runs `chain` and on to itself. */
function pulled(pkg: string, chain: readonly string[], extra: Partial<RadiusFinding> = {}): RadiusFinding {
  return finding(pkg, {
    direct: false,
    chain: [...chain, pkg],
    directDependents: chain.slice(0, 1),
    ...extra,
  });
}

function source(
  findings: readonly RadiusFinding[],
  exposure: Exposure,
  unattributed: readonly string[] = [],
): RadiusSource {
  return { report: { exposure, unattributed: unattributed.map((p) => ({ package: p })), findings } };
}

const CLOSED = { disclosure: {}, pkg: null, narrow: false } as const;

describe("radiusRows", () => {
  it("counts only the rows it lists, the parent's own flag kept apart", () => {
    // Arrange: acme/parent is itself flagged and pulls in one child.
    const parent = finding("acme/parent", { chain: ["acme/parent"] });
    const child = pulled("acme/child", ["acme/parent"]);
    const model = source([parent, child], [{ package: "acme/parent", flagged: 99 }]);

    // Act
    const [row] = radiusRows(model, [parent, child]);

    // Assert
    expect(row?.count).toBe(1);
    expect(row?.pulled.map((f) => f.package)).toEqual(["acme/child"]);
    expect(row?.self?.package).toBe("acme/parent");
    expect(row?.exposure).toBe(99);
  });

  it("excludes the direct requirement itself from its own list", () => {
    const parent = finding("acme/parent", { chain: ["acme/parent"] });
    const model = source([parent], [{ package: "acme/parent", flagged: 1 }]);

    expect(radiusRows(model, [parent])[0]?.pulled).toEqual([]);
  });

  it("names what a requirement reaches but another row lists, and which row that is", () => {
    // Arrange: acme/bundle requires acme/lib; acme/deep's recorded chain starts at acme/lib, but
    // its direct_dependents name both.
    const deep = pulled("acme/deep", ["acme/lib"], { directDependents: ["acme/lib", "acme/bundle"] });
    const model = source(
      [deep],
      [
        { package: "acme/bundle", flagged: 1 },
        { package: "acme/lib", flagged: 1 },
      ],
    );

    // Act
    const [bundle, lib] = radiusRows(model, [deep]);

    // Assert
    expect(bundle?.count).toBe(0);
    expect(bundle?.elsewhere.map((e) => [e.finding.package, e.listedUnder])).toEqual([
      ["acme/deep", "acme/lib"],
    ]);
    expect(lib?.count).toBe(1);
    expect(lib?.elsewhere).toEqual([]);
  });

  it("never counts a flagged direct requirement as reached elsewhere", () => {
    const other = finding("acme/other", { direct: true, directDependents: ["acme/bundle"] });
    const model = source([other], [{ package: "acme/bundle", flagged: 0 }]);

    expect(radiusRows(model, [other])[0]?.elsewhere).toEqual([]);
  });

  it("takes version and dev from the requirement's own finding, and null without one", () => {
    const own = finding("acme/own", { version: "2.3.4", dev: true });
    const model = source(
      [own],
      [
        { package: "acme/own", flagged: 0 },
        { package: "acme/none", flagged: 0 },
      ],
    );

    const [withOwn, without] = radiusRows(model, []);

    expect([withOwn?.version, withOwn?.dev]).toEqual(["2.3.4", true]);
    expect([without?.version, without?.dev]).toEqual([null, false]);
  });
});

describe("unattributed packages (`unattributed`, counted under no requirement)", () => {
  // acme/shared lies on acme/lib's recorded chain and is reached from acme/bundle too, but lockrot
  // counts it under no requirement: more than max_fan_in direct requirements reach it.
  const shared = pulled("acme/shared", ["acme/lib", "acme/mid"], {
    directDependents: ["acme/lib", "acme/bundle"],
  });
  const own = pulled("acme/own", ["acme/lib"]);
  const exposure = [
    { package: "acme/lib", flagged: 1 },
    { package: "acme/bundle", flagged: 0 },
  ];
  const before = source([own, shared], exposure);
  const after = source([own, shared], exposure, ["acme/shared"]);

  it("with nothing unattributed, a shared package is listed under its chain's first row", () => {
    const [lib, bundle] = radiusRows(before, [own, shared]);

    expect(lib?.pulled.map((f) => f.package)).toEqual(["acme/own", "acme/shared"]);
    expect(bundle?.elsewhere.map((e) => e.finding.package)).toEqual(["acme/shared"]);
    expect(radiusLayout(before, [own, shared]).unattributed).toEqual([]);
  });

  it("is listed under no row and reached elsewhere by none, so each row adds up to exposure[].flagged", () => {
    const [lib, bundle] = radiusRows(after, [own, shared]);

    expect(lib?.pulled.map((f) => f.package)).toEqual(["acme/own"]);
    expect([lib?.count, lib?.unfiltered, lib?.elsewhere]).toEqual([1, 1, []]);
    expect(bundle?.elsewhere).toEqual([]);
    expect([lib?.count, bundle?.count]).toEqual([1, 0]);
  });

  it("stays off the receipt and the unfiltered totals, and is on the layout's unattributed list", () => {
    const layout = radiusLayout(after, [own, shared]);

    expect(layout.receipt).toEqual([]);
    expect(layout.throughOther).toEqual([]);
    expect([layout.unfilteredTotal, layout.unfilteredRows]).toEqual([1, 1]);
    expect(layout.unattributed).toEqual([shared]);
  });

  it("follows the filter: one the filter hides is not on the layout's list", () => {
    const layout = radiusLayout(after, [own], [own, shared]);

    expect(layout.unattributed).toEqual([]);
    expect(layout.narrowed).toBe(true);
    expect([layout.unfilteredTotal, layout.ranked.map((r) => r.unfiltered)]).toEqual([1, [1]]);
  });

  it("ignores an entry naming a package the report has no finding for", () => {
    const stray = source([own, shared], exposure, ["acme/ghost"]);

    expect(radiusLayout(stray, [own, shared]).unattributed).toEqual([]);
    expect(radiusRows(stray, [own, shared])[0]?.pulled.map((f) => f.package)).toEqual([
      "acme/own",
      "acme/shared",
    ]);
  });

  it("keeps an unattributed package out of every row, receipt and tail of a fuller layout", () => {
    const layout = radiusLayout(after, [own, shared], [own, shared]);

    const inRows = [...layout.ranked, ...layout.selfOnly, ...layout.throughOther].flatMap((r) => [
      ...r.pulled.map((f) => f.package),
      ...r.elsewhere.map((e) => e.finding.package),
    ]);
    expect(inRows).not.toContain("acme/shared");
    expect(layout.receipt.map((r) => r.finding.package)).not.toContain("acme/shared");
  });
});

describe("radiusLayout", () => {
  it("ranks by count, exposure order on ties, and keeps a short list unfolded", () => {
    const model = source(
      [],
      [
        { package: "a/parent", flagged: 1 },
        { package: "b/parent", flagged: 2 },
        { package: "c/parent", flagged: 1 },
      ],
    );
    const flagged = [
      pulled("a/1", ["a/parent"]),
      pulled("b/1", ["b/parent"]),
      pulled("b/2", ["b/parent"]),
      pulled("c/1", ["c/parent"]),
    ];

    const layout = radiusLayout(model, flagged);

    expect(layout.ranked.map((r) => r.package)).toEqual(["b/parent", "a/parent", "c/parent"]);
    expect(layout.lead).toEqual(layout.ranked);
    expect(layout.singles).toEqual([]);
  });

  it("folds four or more one-each rows under the rows that list more", () => {
    const names = ["p1", "p2", "p3", "p4"];
    const model = source(
      [],
      [{ package: "big/parent", flagged: 2 }, ...names.map((n) => ({ package: `v/${n}`, flagged: 1 }))],
    );
    const flagged = [
      pulled("big/1", ["big/parent"]),
      pulled("big/2", ["big/parent"]),
      ...names.map((n) => pulled(`x/${n}`, [`v/${n}`])),
    ];

    const layout = radiusLayout(model, flagged);

    expect(layout.lead.map((r) => r.package)).toEqual(["big/parent"]);
    expect(layout.singles.map((r) => r.package)).toEqual(names.map((n) => `v/${n}`));
  });

  it("sorts rows that list nothing into the two tails, and drops those with nothing at all", () => {
    const lonely = finding("acme/lonely", { chain: ["acme/lonely"] });
    const deep = pulled("acme/deep", ["acme/lib"], {
      directDependents: ["acme/lib", "acme/bundle", "acme/kit"],
    });
    const alone = finding("acme/alone", { chain: ["acme/alone"] });
    const model = source(
      [lonely, deep, alone],
      [
        { package: "acme/lib", flagged: 1 },
        { package: "acme/lonely", flagged: 0 },
        { package: "acme/bundle", flagged: 1 },
        { package: "acme/kit", flagged: 1 },
        { package: "acme/quiet", flagged: 0 },
      ],
    );

    const layout = radiusLayout(model, [lonely, deep, alone]);

    expect(layout.selfOnly.map((r) => r.package)).toEqual(["acme/lonely"]);
    expect(layout.throughOther.map((r) => r.package)).toEqual(["acme/bundle", "acme/kit"]);
    expect(layout.receipt).toEqual([
      { finding: deep, listedUnder: "acme/lib", behind: ["acme/bundle", "acme/kit"] },
    ]);
    expect(layout.unlisted.map((f) => f.package)).toEqual(["acme/alone"]);
    expect(layout.exposureCount).toBe(5);
  });
});

describe("under a filter (PD-RADIUS-6)", () => {
  const parent = finding("acme/parent", { direct: true, chain: ["acme/parent"] });
  const a = pulled("acme/a", ["acme/parent"], { verdict: "abandoned" });
  const b = pulled("acme/b", ["acme/parent"], { verdict: "stale" });
  const other = pulled("zeta/x", ["zeta/root"]);
  const all = [parent, a, b, other];
  const model = source(all, [
    { package: "acme/parent", flagged: 2 },
    { package: "zeta/root", flagged: 1 },
  ]);

  it("keeps each row's unfiltered count beside the filtered one, and says it is narrowed", () => {
    const layout = radiusLayout(model, [parent, a], all);

    expect(layout.narrowed).toBe(true);
    expect(layout.ranked.map((r) => [r.package, r.count, r.unfiltered])).toEqual([["acme/parent", 1, 2]]);
    expect([layout.unfilteredTotal, layout.unfilteredRows]).toEqual([3, 2]);
  });

  it("sorts a flagged row whose packages the filter hides into the self tail, still counting them", () => {
    const layout = radiusLayout(model, [parent], all);

    expect(layout.ranked).toEqual([]);
    expect(layout.selfOnly.map((r) => [r.package, r.count, r.unfiltered])).toEqual([["acme/parent", 0, 2]]);
    // Nothing ranks above it, so the tail is the list: open by default.
    expect(isFoldOpen(layout, FOLD_SELF, CLOSED)).toBe(true);
  });

  it("is not narrowed when the filter keeps every flagged package", () => {
    const layout = radiusLayout(model, all, all);

    expect(layout.narrowed).toBe(false);
    expect(layout.ranked.every((r) => r.count === r.unfiltered)).toBe(true);
  });
});

describe("radiusCountPhrase", () => {
  it("keeps the plain count when exposure[] names every flagged direct requirement", () => {
    const parent = finding("acme/parent", { direct: true, chain: ["acme/parent"] });
    const model = source([parent], [{ package: "acme/parent", flagged: 0 }]);

    expect(radiusCountPhrase(radiusLayout(model, [parent]))).toBe("1 of 1 direct requirement");
  });

  // Two requirements on the exposure list, each listing one package, and two flagged direct
  // requirements the list leaves out.
  const listed = [pulled("x/1", ["a/p"]), pulled("y/1", ["b/p"])];
  const left = [finding("u/1"), finding("u/2")];
  const everything = [...listed, ...left];
  const model = source(everything, [
    { package: "a/p", flagged: 1 },
    { package: "b/p", flagged: 1 },
  ]);

  it("says which list it counts and adds the flagged direct requirements with nothing flagged counted under them", () => {
    const layout = radiusLayout(model, everything, everything);

    expect(layout.unfilteredUnlisted).toBe(2);
    expect(layout.unlisted).toHaveLength(2);
    expect(radiusCountPhrase(layout)).toBe(
      "2 of 2 direct requirements on the exposure list, plus 2 of 2 flagged ones with nothing flagged counted under them",
    );
  });

  it("counts the left-out ones a filter keeps against all of them", () => {
    const layout = radiusLayout(model, [left[0] as RadiusFinding], everything);

    expect(layout.unfilteredUnlisted).toBe(2);
    expect(radiusCountPhrase(layout)).toMatch(
      /, plus 1 of 2 flagged ones with nothing flagged counted under them$/,
    );
  });
});

describe("pulledTree", () => {
  it("hangs each package under the nearest listed hop of its chain, naming unflagged hops as via", () => {
    // Arrange: root → ruler → compiler → iterator; root → ruler → (unflagged) glue → math.
    const parent = "w/root";
    const ruler = pulled("h/ruler", [parent], { rank: 1 });
    const compiler = pulled("h/compiler", [parent, "h/ruler"], { rank: 2 });
    const iterator = pulled("h/iterator", [parent, "h/ruler", "h/compiler"], { rank: 3 });
    const math = pulled("h/math", [parent, "h/ruler", "h/glue"], { rank: 4 });
    const model = source([], [{ package: parent, flagged: 4 }]);
    const [row] = radiusRows(model, [iterator, math, compiler, ruler]);
    if (!row) throw new Error("no row");

    // Act
    const tree = pulledTree(row);

    // Assert
    expect(tree.map((n) => [n.finding.package, n.depth, n.via, n.last, n.rails])).toEqual([
      ["h/ruler", 0, [], true, []],
      ["h/compiler", 1, [], false, [false]],
      ["h/iterator", 2, [], true, [false, true]],
      ["h/math", 1, ["h/glue"], true, [false]],
    ]);
  });

  it("orders siblings by rank, not by name", () => {
    const first = pulled("zzz/first", ["w/root"], { rank: 1 });
    const second = pulled("aaa/second", ["w/root"], { rank: 2 });
    const [row] = radiusRows(source([], [{ package: "w/root", flagged: 2 }]), [second, first]);
    if (!row) throw new Error("no row");

    expect(pulledTree(row).map((n) => n.finding.package)).toEqual(["zzz/first", "aaa/second"]);
  });
});

describe("radiusAnswer", () => {
  it("names the fewest rows that hold half the listed packages, at most three", () => {
    const model = source(
      [],
      [
        { package: "a/p", flagged: 3 },
        { package: "b/p", flagged: 2 },
        { package: "c/p", flagged: 2 },
        { package: "d/q", flagged: 0 },
      ],
    );
    const flagged = [
      pulled("a/1", ["a/p"]),
      pulled("a/2", ["a/p"]),
      pulled("a/3", ["a/p"]),
      pulled("b/1", ["b/p"]),
      pulled("b/2", ["b/p"]),
      pulled("c/1", ["c/p"]),
      pulled("c/2", ["c/p"]),
    ];

    const answer = radiusAnswer(radiusLayout(model, flagged));

    expect(answer?.top.map((r) => r.package)).toEqual(["a/p", "b/p"]);
    expect(answer).toMatchObject({ held: 5, total: 7, rows: 3, exposureCount: 4 });
  });

  it("is null when no row lists anything", () => {
    const model = source([], [{ package: "a/p", flagged: 0 }]);

    expect(radiusAnswer(radiusLayout(model, []))).toBeNull();
  });
});

describe("what is open (PD-RADIUS-3)", () => {
  const names = ["p1", "p2", "p3", "p4"];
  const model = source(
    [],
    [{ package: "big/parent", flagged: 2 }, ...names.map((n) => ({ package: `v/${n}`, flagged: 1 }))],
  );
  const flagged = [
    pulled("big/1", ["big/parent"]),
    pulled("big/2", ["big/parent"]),
    ...names.map((n) => pulled(`x/${n}`, [`v/${n}`])),
  ];
  const layout = radiusLayout(model, flagged);
  const bigRow = layout.lead[0];
  if (!bigRow) throw new Error("no row");

  it("starts every row closed and the one-each fold open, except on a phone", () => {
    expect(isRowOpen(bigRow, CLOSED)).toBe(false);
    expect(layout.singles.some((row) => isRowOpen(row, CLOSED))).toBe(false);
    expect(isFoldOpen(layout, FOLD_SINGLES, CLOSED)).toBe(true);
    expect(isFoldOpen(layout, FOLD_SINGLES, { ...CLOSED, narrow: true })).toBe(false);
  });

  it("opens the row and fold that list the open package", () => {
    const input = { disclosure: {}, pkg: "x/p3", narrow: true };
    const p3 = layout.singles.find((row) => row.package === "v/p3");
    if (!p3) throw new Error("no row");

    expect(isFoldOpen(layout, FOLD_SINGLES, input)).toBe(true);
    expect(isRowOpen(p3, input)).toBe(true);
    expect(isRowOpen(bigRow, input)).toBe(false);
  });

  it("follows what the reader opened or closed over any default", () => {
    const input = {
      disclosure: { [rowKey("big/parent")]: true, [FOLD_SINGLES]: false },
      pkg: "x/p1",
      narrow: false,
    };

    expect(isRowOpen(bigRow, input)).toBe(true);
    expect(isFoldOpen(layout, FOLD_SINGLES, input)).toBe(false);
    expect(isFoldOpen(layout, FOLD_SELF, input)).toBe(false);
    expect(isFoldOpen(layout, FOLD_OTHER, input)).toBe(false);
  });
});
