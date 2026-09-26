import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOLD_OTHER,
  FOLD_SELF,
  FOLD_SINGLES,
  isFoldOpen,
  isRowOpen,
  placedOnRadius,
  pulledTree,
  radiusAnswer,
  radiusCountPhrase,
  radiusLayout,
  radiusListed,
  radiusRowOrder,
  radiusRows,
  radiusShownCount,
  rowKey,
  vendorPhrase,
  verdictMix,
} from "../../../src/domain/radius";
import { population } from "../../../src/domain/filters";
import { normalize } from "../../../src/model/normalize";
import { makeFinding, makeModel } from "./fixtures";
import type { Finding, Model } from "../../../src/model/types";

function modelWithExposure(model: Model, exposure: readonly { package: string; flagged: number }[]): Model {
  return { ...model, report: { ...model.report, exposure } };
}

function load(name: string): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", `${name}.json`), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name}.json failed to normalize`);
  return result.model;
}

/** A transitive package whose chain runs `chain` and on to itself. */
function pulled(pkg: string, chain: readonly string[], extra: Partial<Finding> = {}): Finding {
  return makeFinding({
    package: pkg,
    direct: false,
    chain: [...chain, pkg],
    directDependents: chain.slice(0, 1),
    ...extra,
  });
}

const CLOSED = { disclosure: {}, pkg: null, narrow: false } as const;

describe("radiusRows", () => {
  it("counts only the rows it lists, the parent's own flag kept apart (critic.md M24/M25 fix)", () => {
    // Arrange: acme/parent is itself flagged and pulls in one child — legacy counted 2 over one row.
    const parent = makeFinding({ package: "acme/parent", chain: ["acme/parent"] });
    const child = pulled("acme/child", ["acme/parent"]);
    const model = modelWithExposure(makeModel([parent, child]), [{ package: "acme/parent", flagged: 99 }]);

    // Act
    const [row] = radiusRows(model, [parent, child]);

    // Assert
    expect(row?.count).toBe(1);
    expect(row?.pulled.map((f) => f.package)).toEqual(["acme/child"]);
    expect(row?.self?.package).toBe("acme/parent");
    expect(row?.exposure).toBe(99);
  });

  it("excludes the direct requirement itself from its own list", () => {
    const parent = makeFinding({ package: "acme/parent", chain: ["acme/parent"] });
    const model = modelWithExposure(makeModel([parent]), [{ package: "acme/parent", flagged: 1 }]);

    expect(radiusRows(model, [parent])[0]?.pulled).toEqual([]);
  });

  it("names what a requirement reaches but another row lists, and which row that is", () => {
    // Arrange: acme/bundle requires acme/lib; acme/deep's recorded chain starts at acme/lib, but
    // its direct_dependents name both.
    const deep = pulled("acme/deep", ["acme/lib"], { directDependents: ["acme/lib", "acme/bundle"] });
    const model = modelWithExposure(makeModel([deep]), [
      { package: "acme/bundle", flagged: 1 },
      { package: "acme/lib", flagged: 1 },
    ]);

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
    const other = makeFinding({ package: "acme/other", direct: true, directDependents: ["acme/bundle"] });
    const model = modelWithExposure(makeModel([other]), [{ package: "acme/bundle", flagged: 0 }]);

    expect(radiusRows(model, [other])[0]?.elsewhere).toEqual([]);
  });

  it.each(["wallabag_wallabag", "mautic_mautic", "koel_koel"])(
    "on %s, listed + reached elsewhere is lockrot's own exposure count for every requirement",
    (corpus) => {
      const model = load(corpus);

      const rows = radiusRows(model, population(model, "radius"));

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((r) => [r.package, r.count + r.elsewhere.length])).toEqual(
        rows.map((r) => [r.package, r.exposure]),
      );
    },
  );
});

describe("radiusLayout", () => {
  it("ranks by count, exposure order on ties, and keeps a short list unfolded", () => {
    const model = modelWithExposure(makeModel([]), [
      { package: "a/parent", flagged: 1 },
      { package: "b/parent", flagged: 2 },
      { package: "c/parent", flagged: 1 },
    ]);
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
    const model = modelWithExposure(makeModel([]), [
      { package: "big/parent", flagged: 2 },
      ...names.map((n) => ({ package: `v/${n}`, flagged: 1 })),
    ]);
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
    const lonely = makeFinding({ package: "acme/lonely", chain: ["acme/lonely"] });
    const deep = pulled("acme/deep", ["acme/lib"], {
      directDependents: ["acme/lib", "acme/bundle", "acme/kit"],
    });
    const alone = makeFinding({ package: "acme/alone", chain: ["acme/alone"] });
    const model = modelWithExposure(makeModel([lonely, deep, alone]), [
      { package: "acme/lib", flagged: 1 },
      { package: "acme/lonely", flagged: 0 },
      { package: "acme/bundle", flagged: 1 },
      { package: "acme/kit", flagged: 1 },
      { package: "acme/quiet", flagged: 0 },
    ]);

    const layout = radiusLayout(model, [lonely, deep, alone]);

    expect(layout.selfOnly.map((r) => r.package)).toEqual(["acme/lonely"]);
    expect(layout.throughOther.map((r) => r.package)).toEqual(["acme/bundle", "acme/kit"]);
    expect(layout.receipt).toEqual([
      { finding: deep, listedUnder: "acme/lib", behind: ["acme/bundle", "acme/kit"] },
    ]);
    expect(layout.unlisted.map((f) => f.package)).toEqual(["acme/alone"]);
    expect(layout.exposureCount).toBe(5);
    // The footnote names acme/alone with a link to its detail, so the tab lists it too.
    expect([...radiusListed(layout)].sort()).toEqual(["acme/alone", "acme/deep", "acme/lonely"]);
  });
});

describe("placedOnRadius (PD-RAIL-1)", () => {
  it("is exactly what the layout names: listed packages, flagged requirements with a row, the footnote", () => {
    const parent = makeFinding({ package: "acme/parent", chain: ["acme/parent"] });
    const child = pulled("acme/child", ["acme/parent"]);
    const alone = makeFinding({ package: "acme/alone", chain: ["acme/alone"] });
    const model = modelWithExposure(makeModel([parent, child, alone]), [
      { package: "acme/parent", flagged: 1 },
    ]);

    const placed = placedOnRadius(model, [parent, child, alone]);

    expect(placed.map((f) => f.package)).toEqual(["acme/parent", "acme/child", "acme/alone"]);
    expect(new Set(placed.map((f) => f.package))).toEqual(
      radiusListed(radiusLayout(model, [parent, child, alone])),
    );
  });
});

describe("under a filter (PD-RADIUS-6)", () => {
  const parent = makeFinding({ package: "acme/parent", direct: true, chain: ["acme/parent"] });
  const a = pulled("acme/a", ["acme/parent"], { verdict: "abandoned" });
  const b = pulled("acme/b", ["acme/parent"], { verdict: "stale" });
  const other = pulled("zeta/x", ["zeta/root"]);
  const model = modelWithExposure(makeModel([parent, a, b, other]), [
    { package: "acme/parent", flagged: 2 },
    { package: "zeta/root", flagged: 1 },
  ]);
  const all = [parent, a, b, other];

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

  it("counts every requirement the tab names, the 'through rows above' tail included", () => {
    const wallabag = load("wallabag_wallabag");
    const layout = radiusLayout(wallabag, population(wallabag, "radius"));

    expect(radiusShownCount(layout)).toBe(29);
  });
});

describe("radiusCountPhrase", () => {
  it("keeps the plain count when exposure[] names every flagged direct requirement", () => {
    const parent = makeFinding({ package: "acme/parent", direct: true, chain: ["acme/parent"] });
    const model = modelWithExposure(makeModel([parent]), [{ package: "acme/parent", flagged: 0 }]);

    expect(radiusCountPhrase(radiusLayout(model, [parent]))).toBe("1 of 1 direct requirement");
  });

  it("says which list it counts and adds the flagged direct requirements with nothing flagged counted under them", () => {
    // wallabag: exposure[] names 29 requirements; 8 flagged direct requirements are not on it.
    const wallabag = load("wallabag_wallabag");
    const all = population(wallabag, "radius");

    const layout = radiusLayout(wallabag, all, all);

    expect(layout.unfilteredUnlisted).toBe(8);
    expect(layout.unlisted).toHaveLength(8);
    expect(radiusCountPhrase(layout)).toBe(
      "29 of 29 direct requirements on the exposure list, plus 8 of 8 flagged ones with nothing flagged counted under them",
    );
  });

  it("counts the left-out ones a filter keeps against all of them", () => {
    const wallabag = load("wallabag_wallabag");
    const all = population(wallabag, "radius");
    const silent = all.filter((f) => f.verdict === "silent");

    const layout = radiusLayout(wallabag, silent, all);

    expect(layout.unfilteredUnlisted).toBe(8);
    expect(radiusCountPhrase(layout)).toMatch(
      /, plus 2 of 8 flagged ones with nothing flagged counted under them$/,
    );
  });
});

describe("verdictMix and vendorPhrase", () => {
  it("counts verdicts most common first, verdict order on ties", () => {
    const list = [
      makeFinding({ package: "a/1", verdict: "stale" }),
      makeFinding({ package: "a/2", verdict: "abandoned" }),
      makeFinding({ package: "a/3", verdict: "stale" }),
      makeFinding({ package: "a/4", verdict: "left-behind" }),
    ];

    expect(verdictMix(list)).toEqual([
      { verdict: "stale", count: 2 },
      { verdict: "abandoned", count: 1 },
      { verdict: "left-behind", count: 1 },
    ]);
  });

  it("says 'all hoa/*' for one vendor, names up to three parts, and gives up when too spread", () => {
    const hoa = ["a", "b", "c"].map((n) => makeFinding({ package: `hoa/${n}` }));
    const three = [...hoa, makeFinding({ package: "x/one" }), makeFinding({ package: "y/two" })];
    const spread = ["a/1", "b/1", "c/1", "d/1", "e/1"].map((p) => makeFinding({ package: p }));

    expect(vendorPhrase(hoa)).toEqual({ parts: [{ text: "hoa/*", count: 3 }], others: 0, all: true });
    expect(vendorPhrase(three)?.parts.map((p) => p.text)).toEqual(["hoa/*", "x/one", "y/two"]);
    expect(vendorPhrase(spread)).toBeNull();
  });
});

describe("pulledTree", () => {
  it("hangs each package under the nearest listed hop of its chain, naming unflagged hops as via", () => {
    // Arrange: root → ruler → compiler → iterator; root → ruler → (unflagged) glue → math.
    const parent = "w/root";
    const ruler = pulled("h/ruler", [parent]);
    const compiler = pulled("h/compiler", [parent, "h/ruler"]);
    const iterator = pulled("h/iterator", [parent, "h/ruler", "h/compiler"]);
    const math = pulled("h/math", [parent, "h/ruler", "h/glue"]);
    const model = modelWithExposure(makeModel([]), [{ package: parent, flagged: 4 }]);
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
});

describe("radiusAnswer", () => {
  it("names the fewest rows that hold half the listed packages, at most three", () => {
    const model = modelWithExposure(makeModel([]), [
      { package: "a/p", flagged: 3 },
      { package: "b/p", flagged: 2 },
      { package: "c/p", flagged: 2 },
      { package: "d/q", flagged: 0 },
    ]);
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
    const model = modelWithExposure(makeModel([]), [{ package: "a/p", flagged: 0 }]);

    expect(radiusAnswer(radiusLayout(model, []))).toBeNull();
  });
});

describe("what is open (PD-RADIUS-3)", () => {
  const names = ["p1", "p2", "p3", "p4"];
  const model = modelWithExposure(makeModel([]), [
    { package: "big/parent", flagged: 2 },
    ...names.map((n) => ({ package: `v/${n}`, flagged: 1 })),
  ]);
  const flagged = [
    pulled("big/1", ["big/parent"]),
    pulled("big/2", ["big/parent"]),
    ...names.map((n) => pulled(`x/${n}`, [`v/${n}`])),
  ];
  const layout = radiusLayout(model, flagged);

  it("starts every row closed and the one-each fold open, except on a phone", () => {
    expect(radiusRowOrder(layout, CLOSED)).toEqual(["big/parent", ...names.map((n) => `v/${n}`)]);
    expect(radiusRowOrder(layout, { ...CLOSED, narrow: true })).toEqual(["big/parent"]);
  });

  it("opens the row and fold that list the open package, and lists its packages after it", () => {
    const input = { disclosure: {}, pkg: "x/p3", narrow: true };

    expect(isFoldOpen(layout, FOLD_SINGLES, input)).toBe(true);
    expect(radiusRowOrder(layout, input)).toEqual(["big/parent", "v/p1", "v/p2", "v/p3", "x/p3", "v/p4"]);
  });

  it("follows what the reader opened or closed over any default", () => {
    const layoutRow = layout.lead[0];
    if (!layoutRow) throw new Error("no row");
    const input = {
      disclosure: { [rowKey("big/parent")]: true, [FOLD_SINGLES]: false },
      pkg: "x/p1",
      narrow: false,
    };

    expect(isRowOpen(layoutRow, input)).toBe(true);
    expect(radiusRowOrder(layout, input)).toEqual(["big/parent", "big/1", "big/2"]);
    expect(isFoldOpen(layout, FOLD_SELF, input)).toBe(false);
    expect(isFoldOpen(layout, FOLD_OTHER, input)).toBe(false);
  });
});
