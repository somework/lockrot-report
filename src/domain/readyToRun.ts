/** Accepted derivation 10, the held filter and another way out: facts about a finding's lead move.
 *  Findings tags the row and the rail filters by them; Overview reads the same functions. */

import type { Finding } from "../model/report";
import { rowCommandArgv } from "./findingRow";

export const READY_WORD = "ready to run";

/** The lead move's own `held_by[]` names something other than the root. An `also[]` move's
 *  holders do not count. The rail's "Held" filter and Overview's held line read this. */
export function isHeld(f: Finding): boolean {
  return f.next_step?.held_by.some((hold) => hold.source !== "root") ?? false;
}

const READY_KINDS: readonly string[] = ["update", "require"];

/** An `update` or `require` move whose checked `commands[]` hold such a step (§5.6), not held. A
 *  `raise-php` move is never ready: raising the project's own PHP floor is the project's decision. */
export function readyToRun(f: Finding): boolean {
  return f.next_step !== null && READY_KINDS.includes(f.next_step.kind) && rowCommandArgv(f) !== null && !isHeld(f);
}

/** A finding that fails the gate and is neither ready nor held. With the ready and the held ones it
 *  splits the gate-failing findings, so the three counts sum to the root `gate.failing`. */
export function needsAnotherWayOut(f: Finding): boolean {
  return f.gate.fails && !readyToRun(f) && !isHeld(f);
}
