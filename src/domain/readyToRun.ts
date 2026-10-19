/** Accepted derivation 10, the held filter and another way out: facts about a finding's lead move.
 *  Findings tags the row and the rail filters by them; Overview reads the same functions. */

import type { Finding, Report2 } from "../model/report";
import { rowCommandArgv } from "./findingRow";

export const READY_WORD = "ready to run";

/** The lead move's own `held_by[]` names something other than the root. An `also[]` move's
 *  holders do not count. The rail's "Held" filter and Overview's held line read this. */
export function isHeld(f: Finding): boolean {
  return f.next_step?.held_by.some((hold) => hold.source !== "root") ?? false;
}

const READY_KINDS: readonly string[] = ["update", "require"];

/** An `update` or `require` move whose `commands[]` hold such a step and whose check resolves
 *  (§5.6), not held. A `raise-php` move is never ready: raising the project's own PHP floor is the
 *  project's decision. A run that checked no move has no `check`, so nothing in it is ready. */
export function readyToRun(f: Finding): boolean {
  const step = f.next_step;
  return (
    step !== null &&
    READY_KINDS.includes(step.kind) &&
    step.check?.result === "resolves" &&
    rowCommandArgv(f) !== null &&
    !isHeld(f)
  );
}

/** A finding that fails the gate and is neither ready nor held. With the ready and the held ones it
 *  splits the gate-failing findings, so the three counts sum to the root `gate.failing`. */
export function needsAnotherWayOut(f: Finding): boolean {
  return f.gate.fails && !readyToRun(f) && !isHeld(f);
}

/** Every finding whose lead move is ready to run, graded or not, whatever the gate (golden `ready_count`). */
export const readyCount = ({ findings }: Report2): number => findings.filter(readyToRun).length;

export interface GatePartition {
  readonly ready: number;
  readonly held: number;
  readonly wayout: number;
}

/** The findings that fail the gate, split by the three predicates; null when none fails it. */
export function gatePartition({ findings }: Report2): GatePartition | null {
  const failing = findings.filter((f) => f.gate.fails);
  if (failing.length === 0) return null;
  return {
    ready: failing.filter(readyToRun).length,
    held: failing.filter(isHeld).length,
    wayout: failing.filter(needsAnotherWayOut).length,
  };
}
