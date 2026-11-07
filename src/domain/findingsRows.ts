/** A Findings group head and a Findings row as facts, the page goldens `findings_groups` and
 *  `findings_rows` (SPEC §7.9.5, §7.9.7). */

import type { Finding, Report2, Run } from "../model/report";
import {
  GATE_WORDS,
  gradeGroups,
  heldByLine,
  heldByWords,
  majorCount,
  majorCountWords,
  packagesCount,
  reachText,
  rowAfter,
  rowBlockedWords,
  rowCommand,
  rowHolds,
  rowNewLine,
  rowRaiseWords,
} from "./findingRow";
import { isHeld, readyToRun } from "./readyToRun";

export interface GroupHead {
  readonly grade: string;
  readonly count: string;
  readonly gate: string | null;
  readonly major: string | null;
}

/** A Findings group head (SPEC §7.9.5): the grade, its package count, the gate words and the major count. */
export function groupHead(verdict: string, findings: readonly Finding[], report: Report2): GroupHead {
  const failing = findings.filter((f) => f.gate.fails).length;
  return {
    grade: verdict,
    count: packagesCount(findings.length),
    gate: GATE_WORDS.group(failing, findings.length, report.gate.fail_on_applied),
    major: majorCountWords(majorCount(findings)),
  };
}

/** The group heads of every graded finding in `rank` order (golden `findings_groups`). */
export function findingsGroups(report: Report2): GroupHead[] {
  const graded: readonly string[] = report.run.graded_verdicts;
  const rows = report.findings.filter((f) => graded.includes(f.verdict)).sort((a, b) => a.rank - b.rank);
  return gradeGroups(rows).map(({ verdict, findings }) => groupHead(verdict, findings, report));
}

export interface RowFacts {
  readonly package: string;
  readonly fails_gate: boolean;
  readonly reach: string;
  readonly held: string | null;
  readonly command: string | null;
  readonly raise_words: string | null;
  readonly after: string | null;
  readonly major: string | null;
  readonly blocked: string | null;
  readonly ready: boolean;
  readonly held_filter: boolean;
}

/** A Findings row's facts as text, the golden `findings_rows` entry (SPEC §7.9.5, §7.9.7). */
export function findingsRowFacts(f: Finding, run: Run): RowFacts {
  const holder = heldByLine(rowHolds(f), run, f.package);
  return {
    package: f.package,
    fails_gate: f.gate.fails,
    reach: reachText(f),
    held: holder === null ? null : heldByWords(holder),
    command: rowCommand(f),
    raise_words: rowRaiseWords(f),
    after: rowAfter(f),
    major: rowNewLine(f),
    blocked: rowBlockedWords(f, run),
    ready: readyToRun(f),
    held_filter: isHeld(f),
  };
}
