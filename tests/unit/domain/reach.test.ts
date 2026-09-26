import { describe, expect, it } from "vitest";
import { waysIn } from "../../../src/domain/reach";
import { makeFinding } from "./fixtures";

describe("waysIn", () => {
  it("is empty for a direct finding, whatever its direct dependents say", () => {
    // Arrange: a direct finding's own direct_dependents lists itself and its other requirers.
    const finding = makeFinding({ direct: true, directDependents: ["acme/widget", "a/one"] });

    // Act / Assert
    expect(waysIn(finding)).toEqual([]);
  });

  it("leads with the chain's first hop, then every other direct dependent once, never itself", () => {
    // Arrange
    const finding = makeFinding({
      direct: false,
      chain: ["b/two", "x/mid", "acme/widget"],
      directDependents: ["a/one", "b/two", "acme/widget", "a/one"],
    });

    // Act / Assert
    expect(waysIn(finding)).toEqual(["b/two", "a/one"]);
  });

  it("falls back to the direct dependents when the chain is only the package", () => {
    const finding = makeFinding({ direct: false, chain: ["acme/widget"], directDependents: ["a/one"] });
    expect(waysIn(finding)).toEqual(["a/one"]);
  });

  it("is empty when nothing reaches it", () => {
    expect(waysIn(makeFinding({ direct: false, chain: [], directDependents: [] }))).toEqual([]);
  });
});
