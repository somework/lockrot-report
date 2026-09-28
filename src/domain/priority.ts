/** Why a finding has its priority, worded from lockrot's own `priority_basis`: the page keeps no copy
 *  of the rules that produced it. */

import type { Finding } from "../model/types";
import { PRIORITIES } from "../model/types";
import { WAYS_NAMED, waysIn } from "./reach";

export interface PriorityRung {
  /** A step reason this page does not know, as written; drawn in code ahead of `text`. */
  readonly code: string | null;
  readonly text: string;
  /** Quieter, under `text`: the ways in a transitive step went through. */
  readonly note: string | null;
  /** Whether the level moved; the base always counts. */
  readonly moved: boolean;
  /** The level once this rung is taken, as written. */
  readonly to: string;
}

/** `no_fix_expected` counted by what each reason says. `unread` (`releases_unknown`) is no prediction:
 *  no release was read, so no fix was looked for. */
export interface NoFixTally {
  /** `no_release_fixes`, `affected_range_unknown`: no release fixes it. */
  readonly none: number;
  /** `not_on_installed_branch`: a fix exists only on a higher branch. */
  readonly branch: number;
  /** A reason this page does not know. */
  readonly other: number;
  readonly unread: number;
}

const NO_FIX_CLASS: Readonly<Record<string, keyof NoFixTally>> = {
  no_release_fixes: "none",
  affected_range_unknown: "none",
  not_on_installed_branch: "branch",
  releases_unknown: "unread",
};

function noFixClass(reason: string): keyof NoFixTally {
  return Object.hasOwn(NO_FIX_CLASS, reason) ? (NO_FIX_CLASS[reason] ?? "other") : "other";
}

export function noFixTally(finding: Pick<Finding, "noFixExpected">): NoFixTally | null {
  const items = finding.noFixExpected;
  if (items === null || items.length === 0) return null;
  const tally = { none: 0, branch: 0, other: 0, unread: 0 };
  for (const item of items) tally[noFixClass(item.reason)] += 1;
  return tally;
}

/** The `no_fix_expected` reason lockrot gives for advisory `id` when this page does not know it. */
export function unknownNoFixReason(finding: Pick<Finding, "noFixExpected">, id: string): string | null {
  const item = finding.noFixExpected?.find((entry) => entry.id === id);
  return item === undefined || noFixClass(item.reason) !== "other" ? null : item.reason;
}

/** S8's installed branch, as written. */
export function installedBranch(finding: Pick<Finding, "signals">): string | null {
  const branch = finding.signals.find((signal) => signal.id === "S8")?.data["branch"];
  return typeof branch === "string" && branch !== "" ? branch : null;
}

function noFixLead(tally: NoFixTally, branch: string | null): string {
  const parts: (readonly [number, string])[] = [
    [tally.none, "no release will fix"],
    [tally.branch, `no release on ${branch ?? "your branch"} will fix`],
    [tally.other, "for which no fix is expected"],
    [tally.unread, "whose fix could not be looked for"],
  ];
  const said = parts
    .filter(([n]) => n > 0)
    .map(([n, words], index) => {
      if (index > 0) return `${n} ${words}`;
      return n === 1 ? `An advisory ${words}` : `${n} advisories ${words}`;
    });
  const last = said.pop() ?? "";
  return said.length === 0 ? last : `${said.join(", ")} and ${last}`;
}

function movement(from: string, to: string): string {
  if (from === to) return `stays at ${to}.`;
  const levels: readonly string[] = PRIORITIES;
  const gap = levels.indexOf(to) - levels.indexOf(from);
  if (levels.includes(from) && levels.includes(to) && Math.abs(gap) === 1) {
    return gap > 0 ? "one step down." : "one step up.";
  }
  return `${from} → ${to}.`;
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

function waysNote(ways: readonly string[]): string | null {
  const [first, second] = ways;
  if (first === undefined) return null;
  if (ways.length === 1) return `It comes through ${first}.`;
  if (ways.length <= WAYS_NAMED && second !== undefined) return `It comes through ${first} and ${second}.`;
  return `It comes through ${ways.length} of your requirements, ${first} among them.`;
}

function stepLead(reason: string, finding: Finding): string | null {
  switch (reason) {
    case "transitive":
      return "You don’t require it directly";
    case "unreached":
      return "No direct requirement this run knows reaches it";
    case "dev":
      return "Installed for development only";
    case "no_fix_expected": {
      const tally = noFixTally(finding);
      return tally === null ? null : noFixLead(tally, installedBranch(finding));
    }
    default:
      return null;
  }
}

/** Base first, then each step in lockrot's order; empty when the finding carries no basis or is not
 *  flagged (base `none`, no step). */
export function priorityWhy(finding: Finding): readonly PriorityRung[] {
  const basis = finding.priorityBasis;
  if (basis === null || (basis.base === "none" && basis.steps.length === 0)) return [];

  const base: PriorityRung = {
    code: null,
    text: `${capitalize(finding.verdict)} packages start at ${basis.base}.`,
    note: null,
    moved: true,
    to: basis.base,
  };
  const steps = basis.steps.map((step): PriorityRung => {
    const lead = stepLead(step.reason, finding);
    return {
      code: lead === null ? step.reason : null,
      text: lead === null ? `: ${step.from} → ${step.to}.` : `${lead}: ${movement(step.from, step.to)}`,
      note: step.reason === "transitive" ? waysNote(waysIn(finding)) : null,
      moved: step.from !== step.to,
      to: step.to,
    };
  });
  return [base, ...steps];
}
