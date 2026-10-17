import { describe, expect, test } from "vitest";

import { baselineSuffix } from "../../../src/domain/baselineSuffix";
import { checksLine } from "../../../src/domain/checksLine";
import { differencesFromModel, listedDifferences } from "./modelDifferences";
import type { RecordedCase } from "./recorded";
import { modelCases, modelOnlyNames, recordedCases } from "./recorded";

type LineField = "checks" | "baseline_suffix";

describe("each line equals the model's golden from the model's own inputs", () => {
  test.each(modelCases())("$name", ({ run, finding, golden }) => {
    expect({ checks: checksLine(finding, run), baseline_suffix: baselineSuffix(finding, run) }).toEqual({
      checks: golden.checks,
      baseline_suffix: golden.baseline_suffix,
    });
  });
});

describe("the baseline suffix, which PHP owns, equals lockrot's golden on lockrot's recording", () => {
  test("only the model-only documents, which lockrot did not write, have no golden", () => {
    const withoutGolden = recordedCases().filter(({ php }) => php === null);

    expect(withoutGolden.map(({ name }) => name).sort()).toEqual(modelOnlyNames());
  });

  test.each(recordedCases().filter(({ php }) => php !== null))("$name", ({ finding, run, php }) => {
    expect(baselineSuffix(finding, run)).toEqual(php?.baseline_suffix);
  });
});

describe("on lockrot's hydration a line differs from the model's golden only where the list says so", () => {
  const lines: Record<LineField, (recorded: RecordedCase) => string | null> = {
    checks: ({ finding, run }) => checksLine(finding, run),
    baseline_suffix: ({ finding, run }) => baselineSuffix(finding, run),
  };
  const fields = Object.keys(lines) as LineField[];

  test.each(fields)("%s", (field) => {
    const differing = differencesFromModel(field, lines[field]);

    expect(differing.map(({ name }) => name).sort()).toEqual([...listedDifferences(field).keys()].sort());
  });
});
