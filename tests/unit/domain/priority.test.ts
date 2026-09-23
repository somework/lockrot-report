import { describe, expect, it } from "vitest";
import { PRIORITY_BASE, priorityWhy } from "../../../src/domain/priority";
import { makeFinding, makeSignal } from "./fixtures";

describe("priorityWhy", () => {
  it("returns no steps when the priority is none", () => {
    // Arrange
    const finding = makeFinding({ verdict: "ok", priority: "none" });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([]);
  });

  it("returns no steps for a verdict with no PRIORITY_BASE entry, even if priority is not none", () => {
    // Arrange: unknown/finished/ok have no base entry; a foreign document could still set a
    // non-none priority on one of them.
    const finding = makeFinding({ verdict: "unknown", priority: "low" });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([]);
  });

  it("starts the ladder at the verdict's PRIORITY_BASE", () => {
    // Arrange
    const finding = makeFinding({ verdict: "stale", priority: "medium", direct: true, dev: false });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([{ text: "stale starts at medium", to: "medium" }]);
  });

  it("steps down once for a transitive finding", () => {
    // Arrange
    const finding = makeFinding({ verdict: "pinned", priority: "medium", direct: false, dev: false });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([
      { text: "pinned starts at high", to: "high" },
      { text: "nothing requires it directly, one step down", to: "medium" },
    ]);
  });

  it("steps down twice for a transitive dev finding", () => {
    // Arrange
    const finding = makeFinding({ verdict: "pinned", priority: "low", direct: false, dev: true });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([
      { text: "pinned starts at high", to: "high" },
      { text: "nothing requires it directly, one step down", to: "medium" },
      { text: "development only, one step down", to: "low" },
    ]);
  });

  it("floors a step-down at low, never reaching none", () => {
    // Arrange: stale already starts at medium; transitive and dev both apply.
    const finding = makeFinding({ verdict: "stale", priority: "low", direct: false, dev: true });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps.at(-1)).toEqual({ text: "development only, one step down", to: "low" });
  });

  it("steps up once when the finding has an unfixable advisory", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "left-behind",
      priority: "critical",
      direct: true,
      dev: false,
      evidence: "no fix expected on 2.x",
    });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([
      { text: "left-behind starts at high", to: "high" },
      { text: "an advisory no release will fix, one step up", to: "critical" },
    ]);
  });

  it("clamps the step-up ceiling at critical instead of implying a level beyond it (M30 fix)", () => {
    // Arrange: abandoned already starts at critical; the no-fix-expected step still applies.
    const finding = makeFinding({
      verdict: "abandoned",
      priority: "critical",
      direct: true,
      dev: false,
      evidence: "no fix expected",
    });

    // Act
    const steps = priorityWhy(finding);

    // Assert: the step still reports the text "one step up", but the value it lands on stays
    // critical — legacy only ever showed the document's own priority here, never a recomputed one.
    expect(steps).toEqual([
      { text: "abandoned starts at critical", to: "critical" },
      { text: "an advisory no release will fix, one step up", to: "critical" },
    ]);
  });

  it("ignores an S7 summary's unrelated wording when deciding the step-up (M31 fix)", () => {
    // Arrange
    const s7 = makeSignal({ id: "S7", summary: "pulls in a package with no fix expected downstream" });
    const finding = makeFinding({
      verdict: "silent",
      priority: "critical",
      direct: true,
      dev: false,
      evidence: "old release; pulls in a package with no fix expected downstream",
      signals: [s7],
    });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([{ text: "silent starts at critical", to: "critical" }]);
  });

  it("covers every PRIORITY_BASE verdict with an entry", () => {
    // Arrange / Act / Assert
    expect(Object.keys(PRIORITY_BASE).sort()).toEqual(
      ["abandoned", "left-behind", "old-promise", "pinned", "silent", "stale"].sort(),
    );
  });

  it("gives no inherited Object.prototype member for a prototype-pollution verdict", () => {
    // A plain `{}` literal inherits from Object.prototype, so a verdict of "constructor" or
    // "__proto__" would otherwise resolve to a real (non-nullish) value and enter the ladder. A
    // non-literal key forces TS through the `Record<string, KnownPriority>` index signature instead
    // of a named `Object.prototype` method's own type (`.toString` otherwise reads as a method).
    const pollutionIds: readonly string[] = ["constructor", "__proto__", "toString", "hasOwnProperty"];
    for (const id of pollutionIds) {
      expect(PRIORITY_BASE[id]).toBeUndefined();
    }

    const finding = makeFinding({ verdict: "constructor", priority: "high" });
    expect(priorityWhy(finding)).toEqual([]);
  });
});
