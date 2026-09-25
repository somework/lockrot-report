import { describe, expect, it } from "vitest";
import { PRIORITY_BASE, priorityWhy } from "../../../src/domain/priority";
import { makeAdvisory, makeFinding, makeSignal } from "./fixtures";

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

  it("returns every rule in Priority::of()'s order, the ones that did not apply included", () => {
    // Arrange
    const finding = makeFinding({ verdict: "stale", priority: "medium", direct: true, dev: false });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps).toEqual([
      { rule: "verdict", text: "Stale packages start at medium.", applied: true, to: "medium" },
      { rule: "reach", text: "You require it directly: no step down.", applied: false, to: "medium" },
      { rule: "dev", text: "Needed in production: no step down.", applied: false, to: "medium" },
      { rule: "advisory", text: "No security advisory: no step up.", applied: false, to: "medium" },
    ]);
  });

  it("steps down once for a transitive finding, naming the first hop of its chain", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "pinned",
      priority: "medium",
      direct: false,
      dev: false,
      chain: ["vendor/direct", "acme/widget"],
    });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps[1]).toEqual({
      rule: "reach",
      text: "Only reached through vendor/direct: one step down.",
      applied: true,
      to: "medium",
    });
    expect(steps.map((s) => s.to)).toEqual(["high", "medium", "medium", "medium"]);
  });

  it("says 'another package' when a transitive finding carries no chain", () => {
    // Arrange
    const finding = makeFinding({ verdict: "pinned", priority: "medium", direct: false, chain: [] });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps[1]?.text).toBe("Only reached through another package: one step down.");
  });

  it("steps down twice for a transitive dev finding", () => {
    // Arrange
    const finding = makeFinding({ verdict: "pinned", priority: "low", direct: false, dev: true });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps.map((s) => [s.rule, s.applied, s.to])).toEqual([
      ["verdict", true, "high"],
      ["reach", true, "medium"],
      ["dev", true, "low"],
      ["advisory", false, "low"],
    ]);
    expect(steps[2]?.text).toBe("Installed for development only: one step down.");
  });

  it("floors a step-down at low, never reaching none", () => {
    // Arrange: stale already starts at medium; transitive and dev both apply.
    const finding = makeFinding({ verdict: "stale", priority: "low", direct: false, dev: true });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps.map((s) => s.to)).toEqual(["medium", "low", "low", "low"]);
    expect(steps[2]?.applied).toBe(true);
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
    expect(steps.at(-1)).toEqual({
      rule: "advisory",
      text: "An advisory with no fix coming: one step up.",
      applied: true,
      to: "critical",
    });
  });

  it("says an advisory had a fix when there is one and the step did not apply", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "left-behind",
      priority: "high",
      advisories: [makeAdvisory({ fixedBy: "2.0.1" })],
      evidence: "1 security advisory affects 1.0.0; fixed by 2.0.1",
    });

    // Act
    const steps = priorityWhy(finding);

    // Assert
    expect(steps.at(-1)).toEqual({
      rule: "advisory",
      text: "Its advisories have a fix: no step up.",
      applied: false,
      to: "high",
    });
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

    // Assert: the rule still fired (applied, "one step up"), but the value it lands on stays
    // critical — legacy only ever showed the document's own priority here, never a recomputed one.
    expect(steps.at(-1)).toMatchObject({
      text: "An advisory with no fix coming: one step up.",
      applied: true,
      to: "critical",
    });
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
    expect(steps.at(-1)).toMatchObject({ rule: "advisory", applied: false, to: "critical" });
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
