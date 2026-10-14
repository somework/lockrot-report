import { describe, expect, test } from "vitest";

import { checksLine } from "../../../src/domain/checksLine";
import { differencesFromModel, listedDifferences } from "./modelDifferences";
import { modelCases } from "./recorded";

describe("the Checks line", () => {
  test.each(modelCases())(
    "$name from the model's own inputs equals the model's golden",
    ({ run, finding, golden }) => {
      expect(checksLine(finding, run)).toBe(golden.checks);
    },
  );

  test("on lockrot's hydration it differs from the model's golden only where the list says so", () => {
    const differing = differencesFromModel("checks", ({ finding, run }) => checksLine(finding, run));

    expect(differing.map(({ name }) => name).sort()).toEqual([...listedDifferences("checks").keys()].sort());
  });
});
