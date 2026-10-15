import { describe, expect, it } from "vitest";
import { gateFact, gateFlag, gateHeadline } from "../../../src/domain/gate";
import type { Report2 } from "../../../src/model/report";
import { readContractJson } from "../words/recorded";

function report(name: string): Report2 {
  return readContractJson("report-2", `${name}.json`) as Report2;
}

describe("gateFlag", () => {
  it("writes the known causes as the CLI's flags and an unknown one as written", () => {
    expect(gateFlag("fail_on", "high")).toEqual({ text: "--fail-on=high", known: true });
    expect(gateFlag("strict_network", "high")).toEqual({ text: "--strict-network", known: true });
    expect(gateFlag("licence_policy", "high")).toEqual({ text: "licence_policy", known: false });
  });
});

describe("gateHeadline", () => {
  it("says fails and the root gate's causes as flags", () => {
    expect(gateHeadline(report("composite"))).toEqual({
      who: "this run",
      verb: "fails",
      flags: [{ text: "--fail-on=high", known: true }],
      unapplied: null,
      said: false,
    });
  });

  it("a gated run that did not fail passes, with the fail-on it was given", () => {
    expect(gateHeadline(report("F"))).toEqual({
      who: "this run",
      verb: "passes",
      flags: [{ text: "--fail-on=high", known: true }],
      unapplied: null,
      said: false,
    });
  });

  it("is null for a quiet --fail-on=none", () => {
    expect(gateHeadline(report("B-gate-none"))).toBeNull();
  });

  it("a baseline run says so, passes when nothing failed it, and names the fail-on it did not apply", () => {
    const base = report("F");
    const baseline: Report2 = {
      ...base,
      run: { ...base.run, mode: "generate_baseline" },
      gate: { ...base.gate, fail_on_applied: false },
    };

    expect(gateHeadline(baseline)).toEqual({
      who: "baseline run",
      verb: "passes",
      flags: [],
      unapplied: "--fail-on",
      said: false,
    });
  });

  it("says the summary names the causes when no package fails and fail-on is not one of them", () => {
    const base = report("F");
    const strict: Report2 = { ...base, gate: { ...base.gate, fails: true, tripped_by: ["strict_network"] } };

    expect(gateHeadline(strict)).toMatchObject({
      verb: "fails",
      flags: [{ text: "--strict-network", known: true }],
      said: true,
    });
  });
});

describe("gateFact (a report with no decided gate)", () => {
  it("is null when the run has a decided gate", () => {
    expect(gateFact(report("composite"))).toBeNull();
  });

  it("fail-on none keeps the quiet 'no gate' and its words", () => {
    expect(gateFact(report("B-gate-none"))).toEqual({
      label: "no gate",
      text:
        "This run was told --fail-on=none: it fails on no finding, and this page lists what it saw. " +
        "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    });
  });

  it("fail-on none with --strict-network, a run that did not fail, names the one flag that could fail it", () => {
    const quiet = report("B-gate-none");
    const strict: Report2 = { ...quiet, run: { ...quiet.run, strict_network: true } };

    expect(gateHeadline(strict)).toBeNull();
    expect(gateFact(strict)).toEqual({
      label: "gate: strict network",
      text:
        "This run was told --fail-on=none: it fails on no finding, but --strict-network fails the run when a " +
        "network lookup fails. This page lists what it saw. " +
        "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    });
  });
});
