import { describe, expect, it } from "vitest";
import { isHeld, needsAnotherWayOut, readyToRun } from "../../../src/domain/readyToRun";
import type { Finding } from "../../../src/model/report";
import { pageGoldens } from "../words/recorded";

const hold = (source: "root" | "package", name: string | null = null) => ({ source, package: name });
const REQUIRE = ["composer", "require", "a/b:^2.0"];
const RESOLVES = { result: "resolves", form: "inline", reason: null };

function finding(step: Record<string, unknown> | null): Finding {
  return {
    package: "a/b",
    next_step:
      step === null
        ? null
        : { kind: "require", held_by: [], also: [], commands: [REQUIRE], check: RESOLVES, ...step },
  } as unknown as Finding;
}

describe("readyToRun (SPEC §7.9.7)", () => {
  it("is ready with a require or update step whose check resolves, and no holder", () => {
    expect(readyToRun(finding({}))).toBe(true);
    expect(readyToRun(finding({ commands: [["composer", "update", "a/b"]] }))).toBe(true);
  });

  it("is ready when only the root holds the move", () => {
    expect(readyToRun(finding({ held_by: [hold("root")] }))).toBe(true);
  });

  it("is not ready when a package holds the lead move", () => {
    expect(readyToRun(finding({ held_by: [hold("root"), hold("package", "c/d")] }))).toBe(false);
  });

  it("reads the lead move's holders only, not an also move's", () => {
    expect(readyToRun(finding({ also: [{ held_by: [hold("package", "c/d")] }] }))).toBe(true);
  });

  it("is not ready when the commands are why-not steps only", () => {
    expect(readyToRun(finding({ commands: [["composer", "why-not", "a/b", "2.0"]] }))).toBe(false);
  });

  it("is not ready when one argv fails the §5.6 check", () => {
    expect(readyToRun(finding({ commands: [REQUIRE, ["composer", "exec", "calc"]] }))).toBe(false);
  });

  it("is not ready without commands or without a move", () => {
    expect(readyToRun(finding({ commands: [] }))).toBe(false);
    expect(readyToRun(finding(null))).toBe(false);
  });

  it("is not ready when the move check refused it, did not check it, or did not run", () => {
    expect(readyToRun(finding({ check: { result: "refused", form: null, reason: null } }))).toBe(false);
    expect(readyToRun(finding({ check: { result: "not_checked", form: null, reason: "offline" } }))).toBe(
      false,
    );
    expect(readyToRun(finding({ check: null }))).toBe(false);
  });

  it("is not ready when the move is not an update or a require, as a php floor raise", () => {
    expect(readyToRun(finding({ kind: "raise-php", commands: [["composer", "update", "a/b"]] }))).toBe(false);
  });
});

describe("isHeld", () => {
  it("is held when the lead move names a holder other than the root", () => {
    expect(isHeld(finding({ held_by: [hold("root"), hold("package", "c/d")] }))).toBe(true);
  });

  it("is not held with no holder, a root hold only, an also[] holder only, or no move", () => {
    expect(isHeld(finding({}))).toBe(false);
    expect(isHeld(finding({ held_by: [hold("root")] }))).toBe(false);
    expect(isHeld(finding({ also: [{ held_by: [hold("package", "c/d")] }] }))).toBe(false);
    expect(isHeld(finding(null))).toBe(false);
  });
});

describe("needsAnotherWayOut", () => {
  const failing = (step: Record<string, unknown> | null): Finding =>
    ({ ...finding(step), gate: { fails: true } }) as unknown as Finding;

  it("holds a failing finding that is neither ready nor held", () => {
    expect(needsAnotherWayOut(failing({ kind: "raise-php" }))).toBe(true);
    expect(needsAnotherWayOut(failing({ held_by: [hold("root")], commands: [] }))).toBe(true);
    expect(needsAnotherWayOut(failing(null))).toBe(true);
  });

  it("leaves out a ready finding, a held one and one that passes the gate", () => {
    expect(needsAnotherWayOut(failing({}))).toBe(false);
    expect(needsAnotherWayOut(failing({ held_by: [hold("package", "c/d")] }))).toBe(false);
    expect(
      needsAnotherWayOut({ ...finding({ kind: "raise-php" }), gate: { fails: false } } as unknown as Finding),
    ).toBe(false);
  });

  it("splits the failing findings of every golden into ready, held and another way out", () => {
    for (const { id, report } of pageGoldens()) {
      const failingFindings = report.findings.filter((f) => f.gate.fails);
      const ready = failingFindings.filter(readyToRun).length;
      const held = failingFindings.filter(isHeld).length;
      const other = report.findings.filter(needsAnotherWayOut).length;
      expect([id, ready + held + other]).toEqual([id, report.gate.failing]);
    }
  });
});
