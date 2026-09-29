import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFilters } from "../../../src/domain/filters";
import {
  baselineExemption,
  exemptWords,
  findingGateLine,
  findingGateMark,
  gateClause,
  gateFact,
  gateFlag,
  gateHeadline,
  networkNotes,
  rowGateWords,
  runGate,
  unflaggedFilters,
  type RunGate,
} from "../../../src/domain/gate";
import { normalize } from "../../../src/model/normalize";
import type { Finding, Model } from "../../../src/model/types";
import { INITIAL_STATE } from "../../../src/state/types";
import { makeFinding, makeModel } from "./fixtures";

function loadModel(name: string): Model {
  const result = normalize(JSON.parse(readFileSync(`fixtures/bundles/${name}.json`, "utf8")));
  if (!result.ok) throw new Error(result.error.message);
  return result.model;
}

function decided(name: string): RunGate {
  const gate = runGate(loadModel(name));
  if (gate === null) throw new Error(`${name} has no decided gate`);
  return gate;
}

function finding(model: Model, pkg: string): Finding {
  const found = model.report.findings.find((f) => f.package === pkg);
  if (found === undefined) throw new Error(`${pkg} is not in the report`);
  return found;
}

describe("runGate", () => {
  it("says nothing when the root gate is absent, null, or a quiet --fail-on=none", () => {
    for (const name of [
      "wallabag_wallabag",
      "koel_koel",
      "mini",
      "mini-no-fail-on",
      "mini-0.13-gate-null",
      "mini-0.13-gate-none",
      "koel_koel-0.13",
      "gh_akaunting_akaunting-0.13",
    ]) {
      expect(runGate(loadModel(name)), name).toBeNull();
    }
  });

  it("says nothing when the root gate's own fails is null", () => {
    const model = loadModel("wallabag_baseline-older-0.13");
    const unknown: Model = {
      ...model,
      report: { ...model.report, gate: { fails: null, trippedBy: [], failOnApplied: true } },
    };
    expect(runGate(unknown)).toBeNull();
  });

  it("counts what each finding's own gate says, flagged and not flagged apart", () => {
    expect(decided("koel_no-token-unchecked-0.13")).toMatchObject({
      outcome: "fails",
      causes: ["fail_on"],
      failOn: "unchecked",
      failOnApplied: true,
      meets: 173,
      failing: 173,
      failingFlagged: 2,
      failingUnflagged: 171,
      unflaggedVerdicts: ["ok"],
      exempt: [],
    });
    expect(decided("wallabag_offline-strict-unchecked-0.13")).toMatchObject({
      causes: ["strict_network", "fail_on"],
      failingFlagged: 30,
      failingUnflagged: 156,
      unflaggedVerdicts: ["unknown"],
    });
  });

  it("keeps every exemption as written, with its count, in document order", () => {
    expect(decided("wallabag_baseline-older-0.13")).toMatchObject({
      meets: 42,
      failing: 12,
      exempt: [{ by: "baseline", n: 30 }],
    });
    expect(decided("mini-0.13-edges").exempt).toEqual([
      { by: "baseline", n: 3 },
      { by: "waiver", n: 1 },
    ]);
  });

  it("a run that applies no fail-on neither passes nor fails on it", () => {
    expect(decided("wallabag_generate-baseline-0.13")).toMatchObject({
      outcome: "unapplied",
      failOnApplied: false,
      meets: 39,
      failing: 0,
    });
    // It still fails on --strict-network, a cause of its own.
    expect(decided("mini-0.13-gate-generate")).toMatchObject({
      outcome: "fails",
      causes: ["strict_network"],
      failOnApplied: false,
    });
  });

  it("an unknown cause stays in the list as written", () => {
    expect(decided("mini-0.13-gate-unknown").causes).toEqual(["fail_on", "licence_policy"]);
  });

  it("a gated run that did not fail passes", () => {
    expect(decided("koel_lock-only-0.13")).toMatchObject({ outcome: "passes", meets: 0, failing: 0 });
    expect(decided("wallabag_baseline-self-0.13")).toMatchObject({ outcome: "passes", meets: 69 });
  });

  it("never says passes when lockrot does not say whether it applied the fail-on", () => {
    const model = loadModel("wallabag_baseline-self-0.13");
    const open: Model = {
      ...model,
      report: { ...model.report, gate: { fails: false, trippedBy: [], failOnApplied: null } },
    };
    expect(runGate(open)).toMatchObject({ outcome: "open", failOnApplied: null });
    expect(gateHeadline(decided("wallabag_baseline-self-0.13"), "check").verb).toBe("passes");
    const gate = runGate(open);
    if (gate === null) throw new Error("decided");
    expect(gateHeadline(gate, "check").verb).toBe("does not fail");
  });
});

describe("gateFlag", () => {
  it("writes the known causes as the CLI's flags and an unknown one as written", () => {
    expect(gateFlag("fail_on", "high")).toEqual({ text: "--fail-on=high", known: true });
    expect(gateFlag("strict_network", "high")).toEqual({ text: "--strict-network", known: true });
    expect(gateFlag("licence_policy", "high")).toEqual({ text: "licence_policy", known: false });
  });
});

describe("gateHeadline", () => {
  it("says fails or passes and the causes as flags", () => {
    expect(gateHeadline(decided("koel_no-token-unchecked-0.13"), "check")).toEqual({
      who: "this run",
      verb: "fails",
      flags: [{ text: "--fail-on=unchecked", known: true }],
      unapplied: null,
    });
    expect(gateHeadline(decided("koel_lock-only-0.13"), "check")).toEqual({
      who: "this run",
      verb: "passes",
      flags: [{ text: "--fail-on=critical", known: true }],
      unapplied: null,
    });
  });

  it("a baseline run says so, and never passes on the fail-on it did not apply", () => {
    expect(gateHeadline(decided("wallabag_generate-baseline-0.13"), "generate_baseline")).toEqual({
      who: "baseline run",
      verb: null,
      flags: [],
      unapplied: "--fail-on",
    });
    expect(gateHeadline(decided("mini-0.13-gate-generate"), "generate_baseline")).toEqual({
      who: "baseline run",
      verb: "fails",
      flags: [{ text: "--strict-network", known: true }],
      unapplied: null,
    });
    expect(gateHeadline(decided("wallabag_generate-baseline-0.13"), "audit").who).toBe("this run");
  });
});

describe("gateClause", () => {
  it("leads with every failing package, then splits flagged from not flagged", () => {
    expect(gateClause(decided("koel_no-token-unchecked-0.13"))).toEqual({
      kind: "failing",
      total: 173,
      flagged: 2,
      unflagged: 171,
      unflaggedAs: "unchecked",
    });
    expect(gateClause(decided("wallabag_baseline-older-0.13"))).toEqual({
      kind: "failing",
      total: 12,
      flagged: 12,
      unflagged: 0,
      unflaggedAs: "not flagged",
    });
  });

  it("names the unflagged by the fail-on's kind only when that kind says why they fail", () => {
    for (const name of ["mini-0.13-gate-unknown", "mini-0.13-gate-verdict"]) {
      const clause = gateClause(decided(name));
      if (clause?.kind === "failing") expect(clause.unflaggedAs, name).toBe("not flagged");
    }
    const strict = gateClause(decided("wallabag_offline-strict-unchecked-0.13"));
    expect(strict).toMatchObject({ total: 186, flagged: 30, unflagged: 156, unflaggedAs: "unchecked" });
  });

  it("says none fails when some meet the threshold and nothing fails on it", () => {
    expect(gateClause(decided("wallabag_baseline-self-0.13"))).toEqual({ kind: "none-fail", meets: 69 });
  });

  it("a baseline run: how many meet the fail-on it did not apply", () => {
    expect(gateClause(decided("wallabag_generate-baseline-0.13"))).toEqual({
      kind: "unapplied",
      meets: 39,
      failOn: "high",
    });
  });

  it("nothing to add when no finding meets it or only the network failed", () => {
    expect(gateClause(decided("koel_lock-only-0.13"))).toBeNull();
    expect(gateClause(decided("wallabag_offline-strict-0.13"))).toBeNull();
  });
});

describe("networkNotes", () => {
  it("counts only the notes lockrot says set network failures", () => {
    expect(networkNotes(loadModel("mini-0.13-edges").report)).toEqual({ failed: 6, of: 21 });
    expect(networkNotes(loadModel("wallabag_offline-strict-unchecked-0.13").report)).toEqual({
      failed: 2,
      of: 4,
    });
    expect(networkNotes(loadModel("koel_no-token-unchecked-0.13").report)?.failed).toBe(0);
  });

  it("is null when the document types no note, so no count is drawn", () => {
    expect(networkNotes(loadModel("wallabag_wallabag").report)).toBeNull();
  });
});

describe("baselineExemption and exemptWords", () => {
  it("ties the baseline's exemptions to the summary's already-accepted count", () => {
    const model = loadModel("wallabag_baseline-older-0.13");
    expect(baselineExemption(model)).toEqual({ exempt: 30, accepted: 43 });
    const words = exemptWords(decided("wallabag_baseline-older-0.13"), baselineExemption(model));
    expect(words).toEqual([
      { by: "baseline", n: 30, text: "30 of the 43 already accepted meet it, so they do not fail" },
    ]);
  });

  it("an unknown exemption is named as written, never called accepted", () => {
    const model = loadModel("mini-0.13-edges");
    const words = exemptWords(decided("mini-0.13-edges"), baselineExemption(model));
    expect(words).toEqual([
      { by: "baseline", n: 3, text: "3 of the 6 already accepted meet it, so they do not fail" },
      { by: "waiver", n: 1, text: "1 meets it, but is exempt for another reason, so it does not fail" },
    ]);
  });

  it("every package the baseline accepted meets it: all of them, not 'N of the N'", () => {
    const model = loadModel("wallabag_baseline-self-0.13");
    expect(exemptWords(decided("wallabag_baseline-self-0.13"), baselineExemption(model))).toEqual([
      { by: "baseline", n: 69, text: "All 69 already accepted meet it, so they do not fail" },
    ]);
  });

  it("a run that applied no fail-on gives no exemption as the reason a package does not fail", () => {
    const model = loadModel("mini-0.13-gate-generate");
    const words = exemptWords(decided("mini-0.13-gate-generate"), baselineExemption(model));
    expect(words).toEqual([{ by: "waiver", n: 1, text: "1 of them is also exempt for another reason" }]);
    const two = exemptWords(
      { ...decided("mini-0.13-gate-generate"), exempt: [{ by: "baseline", n: 2 }] },
      { exempt: 2, accepted: 6 },
    );
    expect(two.map((line) => line.text)).toEqual(["2 of them are also exempt by the baseline"]);
  });

  it("never draws an accepted number that is not the summary's, or stated as a subset of it", () => {
    for (const name of [
      "wallabag_baseline-older-0.13",
      "wallabag_baseline-self-0.13",
      "mini-0.13-edges",
      "mini-0.13-gate-verdict",
      "mini-0.13-gate-generate",
    ]) {
      const model = loadModel(name);
      const gate = runGate(model);
      if (gate === null) continue;
      const tie = baselineExemption(model);
      for (const { text } of exemptWords(gate, tie)) {
        if (!text.includes("accepted")) continue;
        const all = /^All (\d+) already accepted/.exec(text);
        if (all !== null) {
          expect(Number(all[1]), name).toBe(tie.accepted);
          continue;
        }
        const match = /(\d+) of the (\d+) already accepted/.exec(text);
        expect(match, `${name}: ${text}`).not.toBeNull();
        expect(Number(match?.[2]), name).toBe(tie.accepted);
        expect(Number(match?.[1]), name).toBeLessThan(Number(match?.[2]));
      }
    }
  });

  it("without a summary count to tie to, the baseline's exemptions carry no 'accepted'", () => {
    const gate = decided("wallabag_baseline-older-0.13");
    const [words] = exemptWords(gate, { exempt: 30, accepted: null });
    expect(words?.text).toBe("30 meet it, but are exempt by the baseline, so they do not fail");
  });
});

describe("findingGateMark", () => {
  it("fails, exempt as written, or met but not applied; nothing else", () => {
    const koel = loadModel("koel_no-token-unchecked-0.13");
    expect(findingGateMark(koel, finding(koel, "jwilsson/spotify-web-api-php"))).toEqual({ kind: "fails" });
    const edges = loadModel("mini-0.13-edges");
    expect(findingGateMark(edges, finding(edges, "acme/future-step"))).toEqual({
      kind: "exempt",
      by: "waiver",
    });
    expect(findingGateMark(edges, finding(edges, "acme/untagged"))).toEqual({
      kind: "exempt",
      by: "baseline",
    });
    const generate = loadModel("wallabag_generate-baseline-0.13");
    expect(findingGateMark(generate, finding(generate, "guzzlehttp/streams"))).toEqual({ kind: "unapplied" });
  });

  it("says nothing on a report whose gate is null or absent", () => {
    const nullGate = loadModel("mini-0.13-gate-null");
    for (const f of nullGate.report.findings) expect(findingGateMark(nullGate, f)).toBeNull();
    const older = loadModel("wallabag_wallabag");
    for (const f of older.report.findings) expect(findingGateMark(older, f)).toBeNull();
  });
});

describe("findingGateLine and rowGateWords", () => {
  it("the detail says whether it fails, the fail-on it meets, and what keeps it from failing", () => {
    const koel = loadModel("koel_no-token-unchecked-0.13");
    expect(findingGateLine(koel, finding(koel, "jwilsson/spotify-web-api-php"))).toEqual({
      fails: true,
      meets: "--fail-on=unchecked",
      apart: null,
    });
    const edges = loadModel("mini-0.13-edges");
    expect(findingGateLine(edges, finding(edges, "acme/future-step"))).toEqual({
      fails: false,
      meets: "--fail-on=high",
      apart: "exempt: waiver",
    });
    expect(findingGateLine(edges, finding(edges, "acme/untagged"))?.apart).toBe("accepted");
    const generate = loadModel("wallabag_generate-baseline-0.13");
    expect(findingGateLine(generate, finding(generate, "guzzlehttp/streams"))).toEqual({
      fails: false,
      meets: "--fail-on=high",
      apart: "not applied",
    });
  });

  it("reads each finding's own gate: fails, an exemption, not applied, or nothing", () => {
    const judged = (reaches: boolean | null, fails: boolean | null, exemptBy: string | null = null) =>
      makeFinding({ gate: { reachesFailOn: reaches, fails, exemptBy } });
    const base = makeModel([]);
    const model = (failOnApplied: boolean | null): Model => ({
      ...base,
      report: {
        ...base.report,
        run: { ...base.report.run, failOn: "high" },
        gate: { fails: true, trippedBy: ["fail_on"], failOnApplied },
      },
    });
    const applied = model(true);
    expect(findingGateLine(applied, judged(true, true))).toEqual({
      fails: true,
      meets: "--fail-on=high",
      apart: null,
    });
    expect(findingGateLine(applied, judged(true, false, "baseline"))?.apart).toBe("accepted");
    expect(findingGateLine(applied, judged(true, false, "waiver"))?.apart).toBe("exempt: waiver");
    expect(findingGateLine(applied, judged(false, false))).toBeNull();
    // Null is no answer: never drawn as "does not meet" or "does not fail".
    expect(findingGateLine(applied, judged(null, null))).toBeNull();
    expect(findingGateLine(applied, makeFinding({ gate: null }))).toBeNull();
    expect(findingGateLine(model(false), judged(true, false))?.apart).toBe("not applied");
    expect(findingGateLine(model(null), judged(true, false))).toBeNull();
  });

  it("nothing for a report whose gate is null or absent", () => {
    const nullGate = loadModel("mini-0.13-gate-null");
    for (const f of nullGate.report.findings) expect(findingGateLine(nullGate, f)).toBeNull();
    const older = loadModel("wallabag_wallabag");
    for (const f of older.report.findings) expect(findingGateLine(older, f)).toBeNull();
  });

  it("a row says fails or an exemption as written; the baseline's is its tag's to say", () => {
    expect(rowGateWords({ kind: "fails" })).toBe("fails");
    expect(rowGateWords({ kind: "exempt", by: "waiver" })).toBe("exempt: waiver");
    expect(rowGateWords({ kind: "exempt", by: "baseline" })).toBeNull();
    expect(rowGateWords({ kind: "unapplied" })).toBeNull();
  });
});

describe("unflaggedFilters", () => {
  it("lists exactly the failing packages the Findings tab does not, on All packages", () => {
    for (const [name, count] of [
      ["koel_no-token-unchecked-0.13", 171],
      ["wallabag_offline-strict-unchecked-0.13", 156],
    ] as const) {
      const model = loadModel(name);
      const filters = unflaggedFilters(model);
      expect(filters?.gate, name).toEqual(["fails"]);
      const listed = applyFilters(
        model,
        { ...INITIAL_STATE, filters: filters ?? INITIAL_STATE.filters },
        "packages",
      );
      expect(listed, name).toHaveLength(count);
      expect(listed.every((f) => f.gate?.fails === true)).toBe(true);
    }
  });

  it("is null when no unflagged package fails", () => {
    expect(unflaggedFilters(loadModel("wallabag_baseline-older-0.13"))).toBeNull();
    expect(unflaggedFilters(loadModel("koel_koel-0.13"))).toBeNull();
  });
});

describe("gateFact (a report with no decided gate)", () => {
  it("is null when the document states no fail-on", () => {
    expect(gateFact(loadModel("mini-no-fail-on"))).toBeNull();
    expect(gateFact(loadModel("mini-0.13-gate-null"))).toBeNull();
  });

  it("fail-on none keeps today's quiet 'no gate' and its words", () => {
    const fact = gateFact(loadModel("wallabag_wallabag"));
    expect(fact?.label).toBe("no gate");
    expect(fact?.text).toBe(
      "This run was told --fail-on=none: it fails on no finding, and this page lists what it saw. " +
        "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.",
    );
    expect(gateFact(loadModel("koel_koel-0.13"))?.label).toBe("no gate");
  });

  it("an older report with a fail-on says only what it was told, never which findings meet it", () => {
    const fact = gateFact(loadModel("mini"));
    expect(fact).toEqual({
      label: "gate: silent",
      text: "This run was told --fail-on=silent. This report does not say which findings meet it, or whether the run failed.",
    });
  });
});
