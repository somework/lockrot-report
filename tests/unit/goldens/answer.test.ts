import { describe, expect, it } from "vitest";
import { answerText } from "../../../src/domain/findingAnswer";
import differences from "../../../goldens/en/model-differences.json";
import { goldenFile, modelCases, recordedCases } from "./cases";

const cases = recordedCases();
const listed: Record<string, string> = differences.answer;

describe("answer goldens (SPEC §7.9.13)", () => {
  it("writes goldens/en/answer.json from every recorded case", async () => {
    const answers = Object.fromEntries(cases.map((c) => [c.id, answerText(c.finding, c.report.run)]));

    await expect(goldenFile(answers)).toMatchFileSnapshot("../../../goldens/en/answer.json");
  });

  it.each(modelCases())("$id matches the model's golden on the model's own inputs", (c) => {
    expect(answerText(c.finding, c.run)).toBe(c.golden.answer);
  });

  it.each(cases.filter((c) => !(c.id in listed)))("$id, as recorded, matches the model's golden", (c) => {
    expect(answerText(c.finding, c.report.run)).toBe(c.model.answer);
  });

  it("lists exactly the cases whose answer differs from the model's", () => {
    const differing = cases
      .filter((c) => answerText(c.finding, c.report.run) !== c.model.answer)
      .map((c) => c.id);

    expect(differing).toEqual(Object.keys(listed));
  });
});
