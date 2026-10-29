import { describe, expect, test } from "vitest";

import type { Finding } from "../../../src/model/report";
import { differencesFromModel, listedDifferences } from "../words/modelDifferences";
import { modelCases, recordedCases } from "../words/recorded";
import { BLOCK_KEYS, blockGolden, type BlockKey } from "./blockGoldens";

describe("each block equals the model's golden from the model's own inputs (SPEC §7.9.14)", () => {
  // The pinned model's block text lags its own inputs in these blocks.
  // List a block until the model renders it, then empty the list at the repin.
  const MODEL_LAGS: Readonly<Record<string, readonly BlockKey[]>> = {
    // R6-3: the move argv passes --no-interaction, but the model's action omits ", which removes it from require-dev".
    "A-both-sections-dagger": ["moves"],
  };
  const compared = (name: string): readonly BlockKey[] =>
    BLOCK_KEYS.filter((key) => !(MODEL_LAGS[name] ?? []).includes(key));

  test.each(modelCases())("$name", ({ name, finding, run, metadata, golden }) => {
    const page = Object.fromEntries(
      compared(name).map((key) => [key, blockGolden(key, finding, run, metadata)]),
    );
    const model = Object.fromEntries(compared(name).map((key) => [key, golden[key]]));

    expect(page).toEqual(model);
  });

  test("the pinned model still lags in each listed block; empty the list at the repin", () => {
    const cases = new Map(modelCases().map((c) => [c.name, c]));
    const caught = Object.entries(MODEL_LAGS).flatMap(([name, keys]) => {
      const c = cases.get(name);
      const lags = (key: BlockKey): boolean =>
        c !== undefined &&
        JSON.stringify(blockGolden(key, c.finding, c.run, c.metadata)) !== JSON.stringify(c.golden[key]);
      return keys.filter((key) => !lags(key)).map((key) => `${name}: ${key}`);
    });

    expect(caught).toEqual([]);
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

/** The recorded moves without the why-not step that lockrot ends an unresolved move with, where the
 *  model left `version` null and so wrote no such step (SPEC §5.6). */
function withoutVersionStep(recorded: Finding, model: Finding): Finding {
  type AnyMove = NonNullable<Finding["next_step"]> | NonNullable<Finding["next_step"]>["also"][number];
  const modelMoves: (AnyMove | undefined)[] = model.next_step
    ? [model.next_step, ...model.next_step.also]
    : [];
  const strip = <M extends AnyMove>(move: M, at: number): M =>
    move.check?.result !== "resolves" &&
    move.version !== null &&
    modelMoves[at]?.version === null &&
    move.commands.at(-1)?.[1] === "why-not"
      ? { ...move, commands: move.commands.slice(0, -1) }
      : move;
  const lead = recorded.next_step;
  return lead === null
    ? recorded
    : { ...recorded, next_step: { ...strip(lead, 0), also: lead.also.map((m, i) => strip(m, i + 1)) } };
}

describe("a MOVE_VERSION difference is only the why-not step of a move that does not resolve", () => {
  const listed = [...listedDifferences("moves")]
    .filter(([, reason]) => reason.includes("MOVE_VERSION"))
    .map(([name]) => name);
  const models = new Map(modelCases().map((model) => [model.name, model]));

  test("the list names such cases", () => {
    expect(listed.length).toBeGreaterThan(0);
  });

  test.each(recordedCases().filter(({ name }) => listed.includes(name)))(
    "$name",
    ({ name, finding, run, metadata }) => {
      const model = models.get(name);
      if (model === undefined) throw new Error(`no model case ${name}`);

      expect(blockGolden("moves", withoutVersionStep(finding, model.finding), run, metadata)).toEqual(
        model.golden.moves,
      );
    },
  );
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
