import { describe, expect, it } from "vitest";

import { whyLines } from "../../../src/domain/scoreWhy";
import { listedDifferences } from "./modelDifferences";
import { lockrotRecordings, modelCases, recordedCases } from "./recorded";

/** SPEC §7.9.8 and §7.9.11 end the header with " · ages as of {date}"; the model's golden stops before it. */
function comparable(lines: string[]): string[] {
  const [header = "", ...rest] = lines;
  return [header.replace(/ · ages as of \d{4}-\d{2}-\d{2}$/, ""), ...rest];
}

describe("whyLines against the model (SPEC §7.9.8)", () => {
  it("ends the header with the date the ages are measured at", () => {
    const b = recordedCases().find(({ name }) => name === "B");

    expect(b && whyLines(b.finding, b.report)[0]).toBe("36 · critical from 32 · ages as of 2026-10-01");
  });

  it.each(modelCases())(
    "$name matches the model's golden on the model's own inputs",
    ({ finding, run, golden }) => {
      const report = { run, generated_at: "2026-10-01T00:00:00+00:00" };

      expect(comparable(whyLines(finding, report))).toEqual(golden.why);
    },
  );

  it("differs from the model's golden on lockrot's recording only where model-differences.json lists", () => {
    const models = new Map(modelCases().map(({ name, golden }) => [name, JSON.stringify(golden.why)]));
    const differing = lockrotRecordings()
      .filter(
        ({ name, finding, report }) =>
          JSON.stringify(comparable(whyLines(finding, report))) !== models.get(name),
      )
      .map(({ name }) => name);

    expect(differing.sort()).toEqual([...listedDifferences("why").keys()].sort());
  });
});
