/**
 * The arithmetic behind the summary band: how big the flagged share of the lock is, and how the
 * waffle's one square per package is laid out. Display only: every number here is a count or a
 * difference of two numbers the document already carries.
 */

import type { Report2 } from "../model/report";
import { verdictTone } from "./findingRow";
import { zeroVerdictMark } from "./pageVocabulary";
import type { Tone } from "./vocab";

/** One run of same-verdict squares, in the order the waffle draws them. */
export interface WaffleRun {
  readonly verdict: string;
  /** The key's word: the grade as written, or the page's word for a score-0 verdict. */
  readonly label: string;
  readonly tone: Tone;
  /** How the square is drawn: filled for a grade, soft for ok, a ring with a dot when allowlisted, hatched
   *  when not judged. */
  readonly mark: "fill" | "soft" | "ring-dot" | "hatch";
  readonly count: number;
}

/** One run per verdict of `run.verdicts` that some finding holds, counted from `findings[].verdict`;
 *  the mark comes from the verdict's name (accepted derivation 5). */
export function waffleRuns({ findings, run }: Report2): WaffleRun[] {
  return run.verdicts.flatMap((verdict) => {
    const count = findings.filter((f) => f.verdict === verdict).length;
    if (count === 0) return [];
    const zero = zeroVerdictMark(verdict);
    return [
      {
        verdict,
        label: zero?.word ?? verdict,
        tone: verdictTone(run.score_model, verdict),
        mark: zero?.mark ?? "fill",
        count,
      },
    ];
  });
}

/**
 * The flagged share of the lock as a whole percentage: "25%". A share that rounds to either end
 * says which side of it it is on, so one flagged package in 400 never reads "0%" and one clean
 * package in 400 never reads "100%".
 */
export function sharePhrase(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  if (part >= total) return "100%";
  const pct = Math.round((part / total) * 100);
  if (pct === 0) return "under 1%";
  if (pct === 100) return "over 99%";

  return `${pct}%`;
}
