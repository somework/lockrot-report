/**
 * `priorityWhy` rebuilds the ladder `Priority::of()` walks (contract.md §2.4), purely from a
 * finding's own fields, so the page can explain why a finding landed on the priority it shows —
 * ported from legacy's `priorityWhy` (report.js:728-735), as data rather than pre-rendered HTML.
 *
 * Each step's `text` is a full sentence (PD-DETAIL/regression review: a first-time-reader walk read
 * the old form — a verdict's name, the word "starts", a bare priority, chained by arrows to more
 * chips the same shape — as "a code-style chip, then the word critical", explaining nothing. There
 * is no code here to quote; `PriorityWhy.tsx` renders each sentence plain, ending with the ladder's
 * own final value, which stays the document's own `finding.priority` rather than a recomputation
 * (critic.md M30, unchanged by this rewrite).
 */

import type { Finding, KnownPriority, Priority } from "../model/types";
import { hasNoFixExpected } from "./sniff";
import { vocabTable } from "./vocab";

/**
 * `Priority::BASE` (contract.md §2.4 step 2): the priority a verdict starts at before the
 * direct/dev/advisory steps below adjust it. A verdict with no entry here (`unknown`, `finished`,
 * `ok`) never enters the ladder — its priority is always `"none"`. Built with `vocabTable` (no
 * prototype), so a document-supplied verdict of `"constructor"` or `"__proto__"` reads as absent
 * rather than as an inherited `Object.prototype` member (security finding, `domain/vocab.ts`).
 */
export const PRIORITY_BASE: Readonly<Record<string, KnownPriority>> = vocabTable({
  abandoned: "critical",
  silent: "critical",
  pinned: "high",
  "left-behind": "high",
  "old-promise": "high",
  stale: "medium",
});

export interface PriorityStep {
  readonly text: string;
  /** The priority the ladder is at once this step is applied. */
  readonly to: Priority;
}

const LADDER: readonly KnownPriority[] = ["critical", "high", "medium", "low"];

/** One step down: critical→high→medium→low→low (contract.md §2.4 step 3/4). `low` is the floor —
 *  stepping down from it stays at `low`; this ladder never reaches `"none"`. */
function stepDown(p: KnownPriority): KnownPriority {
  const index = LADDER.indexOf(p);
  if (index === -1) return p;
  return LADDER[Math.min(index + 1, LADDER.length - 1)] ?? p;
}

/**
 * One step up: low→medium→high→critical→critical (contract.md §2.4 step 5). `critical` is the
 * ceiling. Legacy's `priorityWhy` always prints the words "one step up" for this step, even when
 * the ladder was already at critical, because it never computed an intermediate value at all — the
 * bold priority at the end of the legacy string is `finding.priority` straight from the document,
 * not a recomputation (critic.md M30). Here each step's `to` is a real, clamped value, so "one step
 * up" from critical reports staying at critical instead of implying a level beyond it; this is a
 * deliberate deviation from legacy's unclamped wording.
 */
function stepUp(p: KnownPriority): KnownPriority {
  const index = LADDER.indexOf(p);
  if (index === -1) return p;
  return LADDER[Math.max(index - 1, 0)] ?? p;
}

/** Capitalises the first letter only — good enough for the verdict word this sentence starts on
 *  (`abandoned`, `left-behind`, ...); nothing here ever has to title-case a multi-word phrase. */
function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The steps behind `finding.priority`. Empty when the finding's priority is `"none"` or its
 * verdict has no entry in `PRIORITY_BASE` — for current documents that is every verdict but the six
 * flagged ones (critic.md M30 notes the `"none"` branch is otherwise unreachable today).
 */
export function priorityWhy(finding: Finding): readonly PriorityStep[] {
  const base = PRIORITY_BASE[finding.verdict];
  if (finding.priority === "none" || !base) return [];

  const steps: PriorityStep[] = [];
  let current: KnownPriority = base;
  steps.push({ text: `${capitalize(finding.verdict)} packages start at ${base}.`, to: current });

  if (!finding.direct) {
    current = stepDown(current);
    steps.push({ text: "Only reached through another package: one step down.", to: current });
  }
  if (finding.dev) {
    current = stepDown(current);
    steps.push({ text: "Only installed for development: one step down.", to: current });
  }
  // M31 fix: hasNoFixExpected reads only the finding's own evidence, excluding the S7 summary
  // Finding::evidence() appends after it — see sniff.ts.
  if (hasNoFixExpected(finding)) {
    current = stepUp(current);
    steps.push({ text: "An advisory with no fix coming: one step up.", to: current });
  }
  return steps;
}
