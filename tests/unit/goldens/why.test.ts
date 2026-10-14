import { describe, expect, it } from "vitest";
import { whyLines } from "../../../src/domain/scoreWhy";
import differences from "../../../goldens/en/model-differences.json";
import { goldenFile, modelCases, recordedCases } from "./cases";

const cases = recordedCases();
const listed: Record<string, string> = differences.why;

/** The model's header stops before " · ages as of {date}" (see `header` in model-differences.json). */
function comparable(lines: string[]): string[] {
  const [header = "", ...rest] = lines;
  return [header.replace(/ · ages as of \d{4}-\d{2}-\d{2}$/, ""), ...rest];
}

describe("Why goldens (SPEC §7.9.8)", () => {
  it("writes goldens/en/why.json from every recorded case", async () => {
    const lines = Object.fromEntries(cases.map((c) => [c.id, whyLines(c.finding, c.report)]));

    await expect(goldenFile(lines)).toMatchFileSnapshot("../../../goldens/en/why.json");
  });

  it("ends every header with the date the ages are measured at", () => {
    const b = cases.find((c) => c.id === "B");

    expect(b && whyLines(b.finding, b.report)[0]).toBe("36 · critical from 32 · ages as of 2026-10-01");
  });

  it.each(modelCases())("$id matches the model's golden on the model's own inputs", (c) => {
    const report = { run: c.run, generated_at: "2026-10-01T00:00:00+00:00" };

    expect(comparable(whyLines(c.finding, report))).toEqual(c.golden.why);
  });

  it.each(cases.filter((c) => !(c.id in listed)))("$id, as recorded, matches the model's golden", (c) => {
    expect(comparable(whyLines(c.finding, c.report))).toEqual(c.model.why);
  });

  it("lists exactly the cases whose Why differs from the model's", () => {
    const differing = cases
      .filter(
        (c) => JSON.stringify(comparable(whyLines(c.finding, c.report))) !== JSON.stringify(c.model.why),
      )
      .map((c) => c.id);

    expect(differing).toEqual(Object.keys(listed));
  });
});
