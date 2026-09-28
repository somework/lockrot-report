/** Why a finding has its priority, worded from lockrot's own `priority_basis`: the page keeps no copy
 *  of the rules that produced it. */

import type { Finding } from "../model/types";
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

export type NoFixKind = "expected" | "not-looked-for";

/** `releases_unknown` alone is no prediction: no release was read, so no fix was looked for. */
export function noFixKind(finding: Pick<Finding, "noFixExpected">): NoFixKind | null {
  const items = finding.noFixExpected;
  if (items === null || items.length === 0) return null;
  return items.every((item) => item.reason === "releases_unknown") ? "not-looked-for" : "expected";
}

const ORDER: readonly string[] = ["critical", "high", "medium", "low"];

function movement(from: string, to: string): string {
  if (from === to) return `stays at ${to}.`;
  const gap = ORDER.indexOf(to) - ORDER.indexOf(from);
  if (ORDER.includes(from) && ORDER.includes(to) && Math.abs(gap) === 1) {
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
    case "no_fix_expected":
      return noFixKind(finding) === "not-looked-for"
        ? "An advisory whose fix could not be looked for"
        : "An advisory no release will fix";
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
