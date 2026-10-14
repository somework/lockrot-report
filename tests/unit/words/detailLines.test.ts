import { describe, expect, test } from "vitest";

import { ageLine } from "../../../src/domain/ageLine";
import { baselineSuffix } from "../../../src/domain/baselineSuffix";
import { branchesLine } from "../../../src/domain/branchesLine";
import { checksLine } from "../../../src/domain/checksLine";
import { securityLine } from "../../../src/domain/securityLine";
import { differencesFromModel, listedDifferences } from "./modelDifferences";
import type { RecordedCase } from "./recorded";
import { modelCases, recordedCases } from "./recorded";

type LineField = "checks" | "branches" | "security_row" | "age_line" | "baseline_suffix";

const withoutPrefix = (line: string | null): string | null => line?.replace(/^age: /, "") ?? null;

describe("each line equals the model's golden from the model's own inputs", () => {
  test.each(modelCases())("$name", ({ run, finding, metadata, golden }) => {
    expect({
      checks: checksLine(finding, run),
      branches: branchesLine(finding, metadata),
      security_row: securityLine(finding, run, metadata),
      baseline_suffix: baselineSuffix(finding, run),
      age_line: ageLine(finding, metadata),
    }).toEqual({
      checks: golden.checks,
      branches: golden.branches,
      security_row: golden.security_row,
      baseline_suffix: golden.baseline_suffix,
      age_line: withoutPrefix(golden.age_line),
    });
  });
});

describe("the lines PHP owns equal lockrot's golden on lockrot's recording", () => {
  test.each(recordedCases().filter(({ php }) => php !== null))("$name", ({ finding, run, metadata, php }) => {
    expect({ age: ageLine(finding, metadata), suffix: baselineSuffix(finding, run) }).toEqual({
      age: withoutPrefix(php?.age_line ?? null),
      suffix: php?.baseline_suffix,
    });
  });
});

describe("on lockrot's hydration a line differs from the model's golden only where the list says so", () => {
  const lines: Record<LineField, (recorded: RecordedCase) => string | null> = {
    checks: ({ finding, run }) => checksLine(finding, run),
    branches: ({ finding, metadata }) => branchesLine(finding, metadata),
    security_row: ({ finding, run, metadata }) => securityLine(finding, run, metadata),
    age_line: ({ finding, metadata }) => ageLine(finding, metadata),
    baseline_suffix: ({ finding, run }) => baselineSuffix(finding, run),
  };
  const fields = Object.keys(lines) as LineField[];

  test.each(fields)("%s", (field) => {
    const differing = differencesFromModel(field, lines[field]);

    expect(differing.map(({ name }) => name).sort()).toEqual([...listedDifferences(field).keys()].sort());
  });
});
