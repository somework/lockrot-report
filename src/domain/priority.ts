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

import type { Finding, KnownPriority } from "../model/types";
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

/** Which of `Priority::of()`'s four rules a step is, in the order it evaluates them. */
export type PriorityRule = "verdict" | "reach" | "dev" | "advisory";

export interface PriorityStep {
  readonly rule: PriorityRule;
  /** One plain sentence: the fact this rule read, then what it did ("no step down" when it did not
   *  apply), so a rule that left the priority alone is still named rather than left out. */
  readonly text: string;
  /** Whether the rule moved the ladder (the verdict's own starting rung always counts as applied).
   *  A step up clamped at critical is still `applied`: the rule fired, there was nowhere higher. */
  readonly applied: boolean;
  /** The priority the ladder is at once this step is applied. */
  readonly to: KnownPriority;
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
 * The steps behind `finding.priority`: every rule `Priority::of()` evaluates, in its own order —
 * the verdict's starting rung, then reach (direct or not), then dev, then the no-fix advisory —
 * each with `applied` saying whether it moved the ladder. A rule that did not apply is returned too
 * (a judge's must-fix: the ladder names what did not happen, not only what did), in the same place,
 * never merged into one "no change" row. Empty when the finding's priority is `"none"` or its
 * verdict has no entry in `PRIORITY_BASE` — for current documents that is every verdict but the six
 * flagged ones (critic.md M30 notes the `"none"` branch is otherwise unreachable today).
 *
 * The words come from here, the one place the rules are rebuilt, so the page never restates a rule
 * somewhere else in different terms.
 */
export function priorityWhy(finding: Finding): readonly PriorityStep[] {
  const base = PRIORITY_BASE[finding.verdict];
  if (finding.priority === "none" || !base) return [];

  const verdict: PriorityStep = {
    rule: "verdict",
    text: `${capitalize(finding.verdict)} packages start at ${base}.`,
    applied: true,
    to: base,
  };
  const reach = reachStep(finding, verdict.to);
  const dev = devStep(finding, reach.to);
  const advisory = advisoryStep(finding, dev.to);
  return [verdict, reach, dev, advisory];
}

/** Step 3 of contract.md §2.4: a package you do not require yourself steps down once. */
function reachStep(finding: Finding, from: KnownPriority): PriorityStep {
  if (finding.direct) {
    return { rule: "reach", text: "You require it directly: no step down.", applied: false, to: from };
  }
  const via = finding.chain.length > 1 ? finding.chain[0] : undefined;
  return {
    rule: "reach",
    text:
      via !== undefined
        ? `Only reached through ${via}: one step down.`
        : "Only reached through another package: one step down.",
    applied: true,
    to: stepDown(from),
  };
}

/** Step 4: a package only `require-dev` installs steps down once more. */
function devStep(finding: Finding, from: KnownPriority): PriorityStep {
  if (!finding.dev) {
    return { rule: "dev", text: "Needed in production: no step down.", applied: false, to: from };
  }
  return {
    rule: "dev",
    text: "Installed for development only: one step down.",
    applied: true,
    to: stepDown(from),
  };
}

/** Step 5: an advisory lockrot expects no fix for steps up once. M31 fix: `hasNoFixExpected` reads
 *  only the finding's own evidence, excluding the S7 summary `Finding::evidence()` appends — see
 *  sniff.ts. When it did not apply, the words say whether there was an advisory at all. */
function advisoryStep(finding: Finding, from: KnownPriority): PriorityStep {
  if (hasNoFixExpected(finding)) {
    return {
      rule: "advisory",
      text: "An advisory with no fix coming: one step up.",
      applied: true,
      to: stepUp(from),
    };
  }
  return {
    rule: "advisory",
    text:
      finding.advisories.length > 0
        ? "Its advisories have a fix: no step up."
        : "No security advisory: no step up.",
    applied: false,
    to: from,
  };
}
