/** The glossary of a report-2 (SPEC §7.9.9): the verdicts, the flags and the signals, worded from
 *  ids. A grade's floor and a flag's signals are lookups in `run.score_model`; no rule of the model
 *  is restated in prose. */

import type { Report2, Run } from "../model/report2";
import { flagClaim, grade, signalName, zeroVerdictReason } from "./pageVocabulary";
import { annotateThresholds, DOCS_URL, signalDef, type Thresholds } from "./vocab";

export interface GlossaryEntry {
  readonly id: string;
  readonly count: number | null;
  readonly text: string;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

/** "The seven verdicts", from the run's own list. */
export const verdictsHeading = (run: Run): string => `The ${countWord(run.verdicts.length)} verdicts`;
export const flagsHeading = (run: Run): string => `The ${countWord(run.flag_ids.length)} flags`;

/** The docs anchor every verdict link names, stable since lockrot 0.10. */
export const VERDICTS_DOCS = `${DOCS_URL}#the-nine-verdicts`;

function zeroText(when: string): string {
  const reason = zeroVerdictReason(when);
  return reason === null ? "A score of 0, and no flag counts." : `A score of 0: ${reason}.`;
}

export function verdictEntries(report: Report2): readonly GlossaryEntry[] {
  const { score_model: model } = report.run;
  const counts: Readonly<Record<string, number>> = report.counts;
  return report.run.verdicts.map((id) => {
    const band = model.bands.find(({ verdict }) => verdict === id);
    const zero = model.zero_verdicts.find(({ verdict }) => verdict === id);
    const text =
      band !== undefined
        ? `A score from ${band.floor}: a ${grade(id)} finding.`
        : zero !== undefined
          ? zeroText(zero.when)
          : "A verdict this page does not know.";
    return { id, count: counts[id] ?? 0, text };
  });
}

export function thresholdPairs(run: Run): Thresholds {
  return run.thresholds === null ? [] : Object.entries(run.thresholds);
}

export function flagEntries(report: Report2): readonly GlossaryEntry[] {
  const { run } = report;
  const flags: Readonly<Record<string, { carrying: number }>> = report.flags;
  return run.flag_ids.map((id) => {
    const claim = annotateThresholds(flagClaim(id), thresholdPairs(run));
    const raisedBy = run.score_model.flags.find((flag) => flag.id === id)?.raised_by ?? [];
    const by = raisedBy.length === 0 ? "" : ` Signals: ${raisedBy.join(", ")}.`;
    return { id, count: flags[id]?.carrying ?? 0, text: `${claim}${by}` };
  });
}

/** S9 raises a flag in report-2, where report-1 said it never decided a verdict. */
const SIGNAL_DEFS_2: Readonly<Record<string, string>> = {
  S9: "Advisories on the installed version; raises the vulnerable flag.",
};

export interface SignalEntry {
  readonly id: string;
  readonly name: string;
  readonly text: string;
}

export function signalEntries(run: Run): readonly SignalEntry[] {
  return run.signal_ids.map((id) => ({
    id,
    name: signalName(id),
    text: annotateThresholds(SIGNAL_DEFS_2[id] ?? signalDef(id), thresholdPairs(run)),
  }));
}

export const GLOSSARY2_WORDS = {
  docs: "The verdicts on lockrot.dev",
  libyears:
    "For each package, the years between the release installed and its newest stable release, summed. It counts every drift, healthy patches included, so it says how far behind the lock is and nothing about why: no flag or gate reads it.",
  score: "How the score adds the flags up is on the Run tab:",
  accept:
    "A package you consider finished can be accepted the way lockrot's built-in list accepts one: an extra.lockrot.ignore entry in composer.json, with a reason. Its accepted flags stay listed and weigh 0.",
  search: "Search keys:",
  searchKeys: ["flag:", "lead:", "verdict:", "score:>=N", "priority:"],
} as const;
