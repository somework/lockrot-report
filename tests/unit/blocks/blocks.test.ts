import { describe, expect, test } from "vitest";

import { differencesFromModel, listedDifferences } from "../words/modelDifferences";
import { modelCases, recordedCases } from "../words/recorded";
import { BLOCK_KEYS, blockGolden } from "./blockGoldens";
import { corrected, type GoldenCard, SINGULAR_LABEL_CASES, singularSeveral } from "./modelCorrections";

describe("each block equals the model's golden from the model's own inputs (SPEC §7.9.14)", () => {
  test.each(modelCases())("$name", ({ name, finding, run, metadata, golden }) => {
    const page = Object.fromEntries(BLOCK_KEYS.map((key) => [key, blockGolden(key, finding, run, metadata)]));
    const model = Object.fromEntries(
      BLOCK_KEYS.map((key) => [key, corrected(name, key, golden[key], finding, run)]),
    );

    expect(page).toEqual(model);
  });

  test("the corrected commands_label cases are exactly the two-step cards that read Command", () => {
    const singular = modelCases()
      .filter(({ golden }) => (golden.moves as GoldenCard[]).some(singularSeveral))
      .map(({ name }) => name);

    expect(singular.sort()).toEqual([...SINGULAR_LABEL_CASES].sort());
  });
});

describe("on lockrot's recording a block differs from the model's golden only where the list says so", () => {
  test.each(BLOCK_KEYS)("%s", (key) => {
    const differing = differencesFromModel(key, ({ finding, run, metadata }) =>
      blockGolden(key, finding, run, metadata),
    );

    expect(differing.map(({ name }) => name).sort()).toEqual([...listedDifferences(key).keys()].sort());
  });
});

describe("the cases the block goldens are written from", () => {
  const findings = recordedCases().map(({ finding }) => finding);

  test("hold every move kind of SPEC §7.9.13.4", () => {
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

  test("hold every opening and every score-0 word", () => {
    const openings = new Set(findings.flatMap((f) => ("decided_by" in f.score ? f.score.decided_by : [])));
    const zero = new Set(findings.flatMap((f) => ("decided_by" in f.score ? [] : f.verdict)));

    expect([...openings].sort()).toEqual(["combination", "either", "maintenance", "security"]);
    expect([...zero].sort()).toEqual(["finished", "ok", "unknown"]);
  });
});
