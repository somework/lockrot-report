import { describe, expect, it } from "vitest";

import { answerText } from "../../../src/domain/findingAnswer";
import { listedDifferences } from "./modelDifferences";
import { modelCases, recordedCases } from "./recorded";

describe("answerText against the model (SPEC §7.9.13, §7.9.14)", () => {
  it.each(modelCases())(
    "$name matches the model's golden on the model's own inputs",
    ({ finding, run, golden }) => {
      expect(answerText(finding, run)).toBe(golden.answer);
    },
  );

  it("differs from the model's golden only on the recorded cases model-differences.json lists", () => {
    const models = new Map(modelCases().map(({ name, golden }) => [name, golden.answer]));
    const differing = recordedCases()
      .filter(({ name, finding, run }) => answerText(finding, run) !== models.get(name))
      .map(({ name }) => name);

    expect(differing.sort()).toEqual([...listedDifferences("answer").keys()].sort());
  });
});

/** SPEC §7.9.14: the goldens hold one case per move kind, per opening and per score-0 word. */
describe("the recorded cases the answer goldens are written from", () => {
  const findings = recordedCases().map(({ finding }) => finding);

  it("hold every move kind of SPEC §7.9.13", () => {
    const kinds = new Set(findings.flatMap((f) => f.next_step?.kind ?? []));

    expect([...kinds].sort()).toEqual(
      [
        "blocked",
        "find-alternative",
        "no-fix",
        "no-move",
        "no-single-fix",
        "no-tag",
        "raise-php",
        "replace",
        "require",
        "tag",
        "test",
        "update",
      ].sort(),
    );
  });

  it("hold every opening", () => {
    const openings = new Set(findings.flatMap((f) => ("decided_by" in f.score ? f.score.decided_by : [])));

    expect([...openings].sort()).toEqual(["combination", "either", "maintenance", "security"]);
  });

  it("hold every score-0 word", () => {
    const words = new Set(findings.flatMap((f) => ("decided_by" in f.score ? [] : f.verdict)));

    expect([...words].sort()).toEqual(["finished", "ok", "unknown"]);
  });

  it("hold every no-move reason but two, which findingAnswer.test.ts covers", () => {
    const reasons = new Set(
      findings.flatMap((f) => (f.next_step?.kind === "no-move" ? (f.next_step.reason ?? []) : [])),
    );

    expect([...reasons].sort()).toEqual(
      [
        "affected_range_unknown",
        "local_package",
        "metadata_not_read",
        "package_quiet",
        "releases_unknown",
      ].sort(),
    );
  });
});
