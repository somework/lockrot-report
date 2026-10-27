import { describe, expect, test } from "vitest";

import { differencesFromModel } from "./modelDifferences";
import { lockrotRecordings, modelOnlyNames, recordedCases } from "./recorded";

describe("the comparison with lockrot's recording (R4-19)", () => {
  const modelOnly = modelOnlyNames();
  const authors = new Map(recordedCases().map(({ name, recordedBy }) => [name, recordedBy]));
  const lockrot = lockrotRecordings().map(({ name }) => name);

  test("reads only the documents that lockrot recorded", () => {
    const compared: string[] = [];

    differencesFromModel("checks", ({ name }) => {
      compared.push(name);
      return null;
    });

    expect(compared.length).toBeGreaterThan(0);
    expect(compared.filter((name) => modelOnly.includes(name))).toEqual([]);
  });

  test.each(modelOnly)("%s has no recording of lockrot's to compare", (name) => {
    expect(authors.get(name)).toBe("model");
    expect(lockrot).not.toContain(name);
  });
});
