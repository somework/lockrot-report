import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/model/normalize";
import type { Finding, Model, PriorityBasis } from "../../../src/model/types";
import { noFixKind, priorityWhy } from "../../../src/domain/priority";
import { makeFinding } from "./fixtures";

function load(name: string): Model {
  const result = normalize(
    JSON.parse(readFileSync(join(process.cwd(), "fixtures", "bundles", name), "utf8")),
  );
  if (!result.ok) throw new Error(`${name} failed to normalize`);
  return result.model;
}

function finding(model: Model, pkg: string): Finding {
  const found = model.report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`no ${pkg}`);
  return found;
}

const basis = (base: string, ...steps: [reason: string, from: string, to: string][]): PriorityBasis => ({
  base,
  steps: steps.map(([reason, from, to]) => ({ reason, from, to })),
});

describe("priorityWhy reads priority_basis only", () => {
  it("draws no ladder when the finding carries no basis, whatever its verdict and priority", () => {
    // Arrange: a report written before lockrot 0.13.0 says nothing about how it got there.
    const finding = makeFinding({
      verdict: "abandoned",
      priority: "high",
      direct: false,
      priorityBasis: null,
    });

    // Act / Assert
    expect(priorityWhy(finding)).toEqual([]);
  });

  it("draws no ladder for an unflagged finding: base none and no step", () => {
    expect(
      priorityWhy(makeFinding({ verdict: "ok", priority: "none", priorityBasis: basis("none") })),
    ).toEqual([]);
  });

  it("a basis with no steps is its base alone", () => {
    // Arrange
    const finding = makeFinding({ verdict: "stale", priority: "medium", priorityBasis: basis("medium") });

    // Act
    const rungs = priorityWhy(finding);

    // Assert
    expect(rungs).toEqual([
      { code: null, text: "Stale packages start at medium.", note: null, moved: true, to: "medium" },
    ]);
  });

  it("takes the base from the data, not from the verdict", () => {
    // Arrange: no table in the page maps a verdict to where it starts.
    const finding = makeFinding({ verdict: "quantum-flux", priority: "high", priorityBasis: basis("high") });

    // Act / Assert
    expect(priorityWhy(finding)[0]?.text).toBe("Quantum-flux packages start at high.");
  });

  it("words a transitive step down and names the ways in", () => {
    // Arrange
    const finding = makeFinding({
      verdict: "pinned",
      priority: "medium",
      direct: false,
      chain: ["vendor/direct", "acme/widget"],
      priorityBasis: basis("high", ["transitive", "high", "medium"]),
    });

    // Act / Assert
    expect(priorityWhy(finding)[1]).toEqual({
      code: null,
      text: "You don’t require it directly: one step down.",
      note: "It comes through vendor/direct.",
      moved: true,
      to: "medium",
    });
  });

  it("names both ways in when two of your requirements reach it", () => {
    const finding = makeFinding({
      verdict: "abandoned",
      priority: "high",
      direct: false,
      chain: ["wallabag/rulerz", "hoa/consistency", "hoa/event"],
      directDependents: ["wallabag/rulerz", "wallabag/rulerz-bundle"],
      priorityBasis: basis("critical", ["transitive", "critical", "high"]),
    });

    expect(priorityWhy(finding)[1]?.note).toBe(
      "It comes through wallabag/rulerz and wallabag/rulerz-bundle.",
    );
  });

  it("words an unreached step apart from a transitive one, with no way in to name", () => {
    const finding = makeFinding({
      verdict: "left-behind",
      priority: "medium",
      direct: false,
      priorityBasis: basis("high", ["unreached", "high", "medium"]),
    });

    expect(priorityWhy(finding)[1]).toEqual({
      code: null,
      text: "No direct requirement this run knows reaches it: one step down.",
      note: null,
      moved: true,
      to: "medium",
    });
  });

  it("says a step that could not move the level stays there", () => {
    // Arrange: mini acme/dev-helper, medium → low (transitive) → low (dev).
    const finding = makeFinding({
      verdict: "stale",
      priority: "low",
      direct: false,
      dev: true,
      priorityBasis: basis("medium", ["transitive", "medium", "low"], ["dev", "low", "low"]),
    });

    // Act
    const rungs = priorityWhy(finding);

    // Assert
    expect(rungs.map((r) => [r.text, r.moved, r.to])).toEqual([
      ["Stale packages start at medium.", true, "medium"],
      ["You don’t require it directly: one step down.", true, "low"],
      ["Installed for development only: stays at low.", false, "low"],
    ]);
  });

  it("words a no-fix step from the advisories it names", () => {
    // Arrange
    const raised = (reasons: string[]): Finding =>
      makeFinding({
        verdict: "left-behind",
        priority: "critical",
        noFixExpected: reasons.map((reason, i) => ({ id: `A-${i}`, reason })),
        priorityBasis: basis("high", ["no_fix_expected", "high", "critical"]),
      });

    // Act / Assert
    expect(priorityWhy(raised(["not_on_installed_branch"]))[1]?.text).toBe(
      "An advisory no release will fix: one step up.",
    );
    expect(priorityWhy(raised(["releases_unknown", "no_release_fixes"]))[1]?.text).toBe(
      "An advisory no release will fix: one step up.",
    );
    expect(priorityWhy(raised(["releases_unknown"]))[1]?.text).toBe(
      "An advisory whose fix could not be looked for: one step up.",
    );
    expect(priorityWhy(raised(["fix_withdrawn"]))[1]?.text).toBe(
      "An advisory no release will fix: one step up.",
    );
  });

  it("says a no-fix step at critical stays at critical", () => {
    const finding = makeFinding({
      verdict: "abandoned",
      priority: "critical",
      noFixExpected: [{ id: "A", reason: "no_release_fixes" }],
      priorityBasis: basis("critical", ["no_fix_expected", "critical", "critical"]),
    });

    expect(priorityWhy(finding)[1]).toMatchObject({
      text: "An advisory no release will fix: stays at critical.",
      moved: false,
      to: "critical",
    });
  });

  it("shows a step it does not know as written, with its from and to", () => {
    const finding = makeFinding({
      verdict: "left-behind",
      priority: "critical",
      priorityBasis: basis("high", ["licence_change", "high", "critical"]),
    });

    expect(priorityWhy(finding)[1]).toEqual({
      code: "licence_change",
      text: ": high → critical.",
      note: null,
      moved: true,
      to: "critical",
    });
  });

  it("gives a jump of more than one level as from → to, never 'one step'", () => {
    const finding = makeFinding({
      verdict: "abandoned",
      priority: "low",
      priorityBasis: basis("critical", ["dev", "critical", "low"]),
    });

    expect(priorityWhy(finding)[1]?.text).toBe("Installed for development only: critical → low.");
  });

  it("mini acme/dev-vuln: three steps, down, down, then up from low", () => {
    // Act
    const rungs = priorityWhy(finding(load("mini-0.13-edges.json"), "acme/dev-vuln"));

    // Assert
    expect(rungs.map((r) => [r.text, r.to])).toEqual([
      ["Left-behind packages start at high.", "high"],
      ["You don’t require it directly: one step down.", "medium"],
      ["Installed for development only: one step down.", "low"],
      ["An advisory no release will fix: one step up.", "medium"],
    ]);
  });

  it("mini acme/silent-snapshot: raised for an advisory whose fix was not looked for", () => {
    const rungs = priorityWhy(finding(load("mini-0.13-edges.json"), "acme/silent-snapshot"));

    expect(rungs.at(-1)?.text).toBe("An advisory whose fix could not be looked for: one step up.");
  });

  it("an older report's findings draw no ladder", () => {
    for (const f of load("wallabag_wallabag.json").report.findings) {
      expect(priorityWhy(f)).toEqual([]);
    }
  });
});

describe("noFixKind", () => {
  it("is null with nothing named: no prediction, or every advisory fixed within reach", () => {
    expect(noFixKind(makeFinding({ noFixExpected: null }))).toBeNull();
    expect(noFixKind(makeFinding({ noFixExpected: [] }))).toBeNull();
  });

  it("is not-looked-for only when every advisory it names is releases_unknown", () => {
    const kind = (...reasons: string[]) =>
      noFixKind(makeFinding({ noFixExpected: reasons.map((reason, i) => ({ id: `A-${i}`, reason })) }));

    expect(kind("releases_unknown")).toBe("not-looked-for");
    expect(kind("releases_unknown", "releases_unknown")).toBe("not-looked-for");
    expect(kind("releases_unknown", "affected_range_unknown")).toBe("expected");
    expect(kind("not_on_installed_branch")).toBe("expected");
    expect(kind("fix_withdrawn")).toBe("expected");
  });
});
