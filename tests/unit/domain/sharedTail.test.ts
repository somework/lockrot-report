import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clampsNames, fanInDots, scaleSlots, sharedTail } from "../../../src/domain/sharedTail";
import { radiusLayout } from "../../../src/domain/radius";
import { population } from "../../../src/domain/filters";
import { normalize } from "../../../src/model/normalize";
import type { Finding, Model, UnattributedEntry } from "../../../src/model/types";
import { makeFinding, makeModel } from "./fixtures";

function load(name: string): Model {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "bundles", `${name}.json`), "utf8"),
  ) as unknown;
  const result = normalize(raw);
  if (!result.ok) throw new Error(`${name}.json failed to normalize`);
  return result.model;
}

function withShared(
  findings: readonly Finding[],
  unattributed: readonly UnattributedEntry[],
  extra: { maxFanIn?: number | null; includeDev?: boolean | null } = {},
): Model {
  const model = makeModel([...findings]);
  const maxFanIn = extra.maxFanIn === undefined ? 8 : extra.maxFanIn;
  return {
    ...model,
    report: {
      ...model.report,
      exposureRule: maxFanIn === null ? null : { maxFanIn },
      includeDev: extra.includeDev === undefined ? true : extra.includeDev,
      unattributed,
    },
  };
}

const a = makeFinding({ package: "acme/a", verdict: "stale", direct: false });
const b = makeFinding({ package: "acme/b", verdict: "abandoned", direct: false });
const c = makeFinding({ package: "acme/c", verdict: "stale", direct: false });

describe("sharedTail (lockrot 0.13.0 `unattributed`)", () => {
  it("draws nothing for an empty list or a document without one", () => {
    expect(sharedTail(withShared([a], []), [a])).toBeNull();
    expect(sharedTail(makeModel([a]), [a])).toBeNull();
  });

  it("draws nothing when the filter hides every entry's package", () => {
    const model = withShared([a], [{ package: "acme/a", verdict: "stale", fanIn: 9 }]);

    expect(sharedTail(model, [])).toBeNull();
  });

  it("keeps the entry's own verdict as written, an unknown one included", () => {
    const model = withShared([a], [{ package: "acme/a", verdict: "quantum-flux", fanIn: 9 }]);

    expect(sharedTail(model, [a])?.entries.map((e) => [e.finding.package, e.verdict, e.fanIn])).toEqual([
      ["acme/a", "quantum-flux", 9],
    ]);
  });

  it("orders the entries most shared first, an unreadable fan_in last, ties in the document's order", () => {
    const model = withShared(
      [a, b, c],
      [
        { package: "acme/a", verdict: "stale", fanIn: 9 },
        { package: "acme/b", verdict: "abandoned", fanIn: null },
        { package: "acme/c", verdict: "stale", fanIn: 97 },
      ],
    );

    expect(sharedTail(model, [a, b, c])?.entries.map((e) => e.finding.package)).toEqual([
      "acme/c",
      "acme/a",
      "acme/b",
    ]);
  });

  it("names each package once when the list repeats one", () => {
    const model = withShared(
      [a],
      [
        { package: "acme/a", verdict: "stale", fanIn: 9 },
        { package: "acme/a", verdict: "stale", fanIn: 12 },
      ],
    );

    expect(sharedTail(model, [a])?.entries.map((e) => e.fanIn)).toEqual([9]);
  });

  it("says require-dev is not counted only when include_dev is false, never for null or true", () => {
    const entry = [{ package: "acme/a", verdict: "stale", fanIn: 9 }];

    expect(sharedTail(withShared([a], entry, { includeDev: false }), [a])?.devLeftOut).toBe(true);
    expect(sharedTail(withShared([a], entry, { includeDev: true }), [a])?.devLeftOut).toBe(false);
    expect(sharedTail(withShared([a], entry, { includeDev: null }), [a])?.devLeftOut).toBe(false);
  });

  it("quotes exposure_rule.max_fan_in, and has no limit when the rule is null", () => {
    const entry = [{ package: "acme/a", verdict: "stale", fanIn: 9 }];

    expect(sharedTail(withShared([a], entry), [a])?.maxFanIn).toBe(8);
    expect(sharedTail(withShared([a], entry, { maxFanIn: null }), [a])?.maxFanIn).toBeNull();
  });

  it("gives the fan_in range only when every entry's fan_in is readable", () => {
    const both = withShared(
      [a, b],
      [
        { package: "acme/a", verdict: "stale", fanIn: 11 },
        { package: "acme/b", verdict: "abandoned", fanIn: 9 },
      ],
    );
    const oneUnread = withShared(
      [a, b],
      [
        { package: "acme/a", verdict: "stale", fanIn: 11 },
        { package: "acme/b", verdict: "abandoned", fanIn: null },
      ],
    );

    expect(sharedTail(both, [a, b])?.fanIn).toEqual({ low: 9, high: 11 });
    expect(sharedTail(oneUnread, [a, b])?.fanIn).toBeNull();
  });

  it.each([
    ["gh_akaunting_akaunting-0.13", [["league/config", "stale", 9]], true],
    ["mini-0.13-edges", [["acme/shared-util", "stale", 9]], false],
    [
      "wallabag_generate-baseline-0.13",
      [
        ["doctrine/cache", "abandoned", 11],
        ["symfony/security-guard", "abandoned", 9],
      ],
      false,
    ],
  ])("on %s reads lockrot's own entries", (corpus, expected, devLeftOut) => {
    const model = load(corpus);
    const layout = radiusLayout(model, population(model, "radius"));

    const tail = sharedTail(model, layout.unattributed);

    expect(tail?.entries.map((e) => [e.finding.package, e.verdict, e.fanIn])).toEqual(expected);
    expect(tail?.maxFanIn).toBe(8);
    expect(tail?.devLeftOut).toBe(devLeftOut);
  });

  it.each(["koel_koel-0.13", "wallabag_wallabag-0.13", "wallabag_wallabag", "koel_koel"])(
    "on %s (nothing unattributed, or a document before the list) there is no tail",
    (corpus) => {
      const model = load(corpus);

      expect(sharedTail(model, radiusLayout(model, population(model, "radius")).unattributed)).toBeNull();
    },
  );
});

describe("fanInDots: one dot per direct requirement, up to twice the limit", () => {
  it("fills the dots up to the limit and draws the rest hollow", () => {
    expect(fanInDots(9, 8)).toEqual({ filled: 8, hollow: 1, clipped: false });
    expect(fanInDots(16, 8)).toEqual({ filled: 8, hollow: 8, clipped: false });
  });

  it("stops at twice the limit and says it stopped, so a fan_in of 97 keeps one line", () => {
    expect(fanInDots(97, 8)).toEqual({ filled: 8, hollow: 8, clipped: true });
  });

  it("draws a fan_in at or under the limit all filled", () => {
    expect(fanInDots(3, 8)).toEqual({ filled: 3, hollow: 0, clipped: false });
  });

  it("keeps at least one dot past a limit of 0", () => {
    expect(fanInDots(5, 0)).toEqual({ filled: 0, hollow: 1, clipped: true });
  });
});

describe("scaleSlots: the width every entry's dots share", () => {
  it("is the largest fan_in drawn, never more than twice the limit", () => {
    expect(scaleSlots([9], 8)).toBe(9);
    expect(scaleSlots([11, 9], 8)).toBe(11);
    expect(scaleSlots([97, 9], 8)).toBe(16);
  });

  it("leaves room past the limit even when no fan_in is readable", () => {
    expect(scaleSlots([null], 8)).toBe(9);
    expect(scaleSlots([], 8)).toBe(9);
  });
});

describe("clampsNames: a list of requirements longer than the dots", () => {
  it("clamps past twice the limit, and past 16 when the report states no limit", () => {
    expect(clampsNames(16, 8)).toBe(false);
    expect(clampsNames(17, 8)).toBe(true);
    expect(clampsNames(16, null)).toBe(false);
    expect(clampsNames(97, null)).toBe(true);
  });
});
