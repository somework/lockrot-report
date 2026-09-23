import { describe, expect, it } from "vitest";
import { radiusCards } from "../../../src/domain/radius";
import { makeFinding, makeModel } from "./fixtures";
import type { Model } from "../../../src/model/types";

function modelWithExposure(model: Model, exposure: readonly { package: string; flagged: number }[]): Model {
  return { ...model, report: { ...model.report, exposure } };
}

describe("radiusCards", () => {
  it("counts only the rows it lists, not the parent on top of them (critic.md M24/M25 fix)", () => {
    // Arrange: "acme/parent" is itself flagged AND pulls in one child — legacy's count would have
    // been pulled.length + 1 = 2 over a single drawn row.
    const parent = makeFinding({ package: "acme/parent", chain: [] });
    const child = makeFinding({ package: "acme/child", chain: ["acme/parent"] });
    const model = modelWithExposure(makeModel([parent, child]), [{ package: "acme/parent", flagged: 99 }]);

    // Act
    const cards = radiusCards(model, [parent, child]);

    // Assert
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ package: "acme/parent", count: 1, parentFlagged: true });
    expect(cards[0]?.pulled).toEqual([{ package: "acme/child", verdict: child.verdict }]);
  });

  it("still shows a card for a flagged parent that pulls in nothing, with count 0 (M25's 'flagged itself')", () => {
    // Arrange
    const parent = makeFinding({ package: "acme/lonely", chain: [] });
    const model = modelWithExposure(makeModel([parent]), [{ package: "acme/lonely", flagged: 1 }]);

    // Act
    const cards = radiusCards(model, [parent]);

    // Assert
    expect(cards).toEqual([
      { package: "acme/lonely", count: 0, parentFlagged: true, meterPercent: 0, pulled: [] },
    ]);
  });

  it("drops a direct requirement that is neither flagged nor pulls anything in", () => {
    // Arrange
    const unrelated = makeFinding({ package: "acme/unrelated", chain: [] });
    const model = modelWithExposure(makeModel([unrelated]), [{ package: "acme/quiet", flagged: 0 }]);

    // Act
    const cards = radiusCards(model, [unrelated]);

    // Assert
    expect(cards).toEqual([]);
  });

  it("excludes the direct requirement itself from its own pulled list", () => {
    // Arrange: a (hypothetical, malformed) chain that names the requirement itself must not count.
    const parent = makeFinding({ package: "acme/parent", chain: ["acme/parent"] });
    const model = modelWithExposure(makeModel([parent]), [{ package: "acme/parent", flagged: 1 }]);

    // Act
    const cards = radiusCards(model, [parent]);

    // Assert
    expect(cards[0]?.pulled).toEqual([]);
  });

  it("sorts descending by count, keeping exposure order on ties (stable sort)", () => {
    // Arrange
    const a1 = makeFinding({ package: "a/1", chain: ["a/parent"] });
    const b1 = makeFinding({ package: "b/1", chain: ["b/parent"] });
    const b2 = makeFinding({ package: "b/2", chain: ["b/parent"] });
    const parentA = makeFinding({ package: "a/parent", chain: [] });
    const parentB = makeFinding({ package: "b/parent", chain: [] });
    const model = modelWithExposure(makeModel([]), [
      { package: "a/parent", flagged: 1 },
      { package: "b/parent", flagged: 2 },
    ]);

    // Act
    const cards = radiusCards(model, [parentA, parentB, a1, b1, b2]);

    // Assert: b/parent pulls 2, a/parent pulls 1 — descending puts b/parent first.
    expect(cards.map((c) => c.package)).toEqual(["b/parent", "a/parent"]);
  });

  it("scales meterPercent to the largest card's count", () => {
    // Arrange
    const small = makeFinding({ package: "small/parent", chain: [] });
    const smallChild = makeFinding({ package: "small/child", chain: ["small/parent"] });
    const big = makeFinding({ package: "big/parent", chain: [] });
    const bigChildren = [1, 2, 3, 4].map((n) =>
      makeFinding({ package: `big/child${String(n)}`, chain: ["big/parent"] }),
    );
    const model = modelWithExposure(makeModel([]), [
      { package: "small/parent", flagged: 1 },
      { package: "big/parent", flagged: 4 },
    ]);

    // Act
    const cards = radiusCards(model, [small, smallChild, big, ...bigChildren]);
    const bigCard = cards.find((c) => c.package === "big/parent");
    const smallCard = cards.find((c) => c.package === "small/parent");

    // Assert
    expect(bigCard?.meterPercent).toBe(100);
    expect(smallCard?.meterPercent).toBe(25);
  });
});
