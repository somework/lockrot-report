/** The header's gate fact, read off lockrot's root `gate`: lockrot decides what fails, the page words
 *  it (PD-GATE-1..5, DESIGN.md §5). */

import type { Report2 } from "../model/report2";

export interface GateFlag {
  readonly text: string;
  /** False: a cause this page has no words for, shown as written. */
  readonly known: boolean;
}

export function gateFlag(cause: string, failOn: string): GateFlag {
  if (cause === "fail_on") return { text: `--fail-on=${failOn}`, known: true };
  if (cause === "strict_network") return { text: "--strict-network", known: true };
  return { text: cause, known: false };
}

export interface GateHeadline {
  readonly who: string;
  readonly verb: "fails" | "passes";
  /** The causes that failed the run, or the fail-on a run that did not fail was given. */
  readonly flags: readonly GateFlag[];
  /** The flag the run did not apply; its value is the summary's to say. */
  readonly unapplied: string | null;
  /** The summary names the flags anyway: no package fails, and the fail-on is not a cause. */
  readonly said: boolean;
}

/** The header's words: "this run fails · --fail-on=high"; null for a quiet `--fail-on=none`. */
export function gateHeadline({ gate, run }: Report2): GateHeadline | null {
  if (!gate.fails && run.fail_on === "none") return null;
  const who = run.mode === "generate_baseline" ? "baseline run" : "this run";
  if (gate.fails) {
    const causes = [...new Set(gate.tripped_by)];
    return {
      who,
      verb: "fails",
      flags: causes.map((cause) => gateFlag(cause, run.fail_on)),
      unapplied: null,
      said: gate.failing === 0 && causes.length > 0 && causes.every((cause) => cause !== "fail_on"),
    };
  }
  if (gate.fail_on_applied) {
    return {
      who: "this run",
      verb: "passes",
      flags: [gateFlag("fail_on", run.fail_on)],
      unapplied: null,
      said: false,
    };
  }
  return { who, verb: "passes", flags: [], unapplied: "--fail-on", said: false };
}

export interface GateFact {
  readonly label: string;
  readonly text: string;
}

const HINT =
  "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.";

/** The header's quiet fact for a run with no decided gate (`--fail-on=none`), else null. */
export function gateFact(report: Report2): GateFact | null {
  if (gateHeadline(report) !== null) return null;
  const opening = "This run was told --fail-on=none: it fails on no finding";
  return report.run.strict_network
    ? {
        label: "gate: strict network",
        text: `${opening}, but --strict-network fails the run when a network lookup fails. This page lists what it saw. ${HINT}`,
      }
    : { label: "no gate", text: `${opening}, and this page lists what it saw. ${HINT}` };
}
