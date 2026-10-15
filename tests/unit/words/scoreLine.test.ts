import { describe, expect, test } from "vitest";

import { scoreLine } from "../../../src/domain/scoreLine";
import type { Score } from "../../../src/model/report";
import { readContractJson, recordedCases } from "./recorded";

interface Pair {
  score: Score;
  text: string;
}

const { score_text_grammar: grammar, pairs } = readContractJson("score-lines.json") as {
  score_text_grammar: number;
  pairs: Pair[];
};

/**
 * Reads a score line the way arithmetic does, from the line alone: a number is a term, `+` is
 * lowest, `÷` binds to the operand before it, brackets group, and words and `[notes]` are ignored.
 */
function evaluate(line: string): number {
  const expression = line
    .slice(line.indexOf(" = ") + 3)
    .replace(/\[[^\]]*\]/g, "")
    .replace(/ \([\d.]+, rounded down\)/, "")
    .replace(/ \([^()]* accepted\)$/, "");
  const tokens = expression.match(/\d+(?:\.\d+)?|[+÷()]/g) ?? [];
  let at = 0;
  const factor = (): number => {
    if (tokens[at] === "(") {
      at += 1;
      const inner = sum();
      at += 1;
      return inner;
    }
    at += 1;
    return Number(tokens[at - 1]);
  };
  const term = (): number => {
    let value = factor();
    while (tokens[at] === "÷") {
      at += 1;
      value /= factor();
    }
    return value;
  };
  const sum = (): number => {
    let value = term();
    while (tokens[at] === "+") {
      at += 1;
      value += term();
    }
    return value;
  };
  return sum();
}

const exactOf = (score: Score): number => score.exact;

describe("the score line", () => {
  test("lockrot recorded the grammar this page writes", () => {
    expect(grammar).toBe(1);
    expect(pairs.length).toBeGreaterThan(0);
  });

  test("the evaluator reads a line the way the grammar says", () => {
    expect(evaluate("18 = (abandoned 32 + old-promise 4 [¼ of 16]) ÷ 2 dev")).toBe(18);
    expect(evaluate("4 = (old-promise 16 ÷ 2 transitive) ÷ 2 dev")).toBe(4);
    expect(evaluate("18 = abandoned 32 + old-promise 4 [¼ of 16] ÷ 2 dev")).toBe(34);
  });

  test.each(pairs.map((pair, index) => ({ ...pair, index })))("pair $index: $text", ({ score, text }) => {
    const line = scoreLine(score);

    expect(line).toBe(text);
    expect(score.total === 0 ? 0 : evaluate(line)).toBe(exactOf(score));
  });

  test.each(recordedCases().map(({ name, finding }) => ({ name, score: finding.score })))(
    "$name writes the line its finding carries",
    ({ score }) => {
      expect(scoreLine(score)).toBe(score.text);
    },
  );
});
