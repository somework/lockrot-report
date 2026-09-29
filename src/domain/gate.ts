/** The run's gate, read off lockrot's root `gate` and each finding's own: lockrot decides what
 *  fails, the page counts and words it (PD-GATE-1..5, DESIGN.md §5). */

import type { Finding, Model, ReportModel } from "../model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type Filters } from "../state/types";
import { baselineDelta } from "./baseline";
import { applyFilters, population, sinceBucket } from "./filters";
import { VERDICT_ORDER } from "./vocab";

/** `open`: lockrot says the run did not fail but not whether it applied its fail-on. */
export type RunOutcome = "fails" | "passes" | "unapplied" | "open";

export interface ExemptCount {
  /** `exempt_by` as written. */
  readonly by: string;
  readonly n: number;
}

export interface RunGate {
  /** `unapplied`: the run applied its fail-on to no finding and nothing else failed it. */
  readonly outcome: RunOutcome;
  /** `tripped_by`, each once, in the document's order. */
  readonly causes: readonly string[];
  readonly failOn: string | null;
  /** `run.fail_on_kind` as written. */
  readonly failOnKind: string | null;
  readonly failOnApplied: boolean | null;
  /** Packages whose own gate meets fail-on, whatever exempts them. */
  readonly meets: number;
  readonly failing: number;
  /** Of the failing, the ones the Findings tab lists and the ones it does not. */
  readonly failingFlagged: number;
  readonly failingUnflagged: number;
  /** The verdicts of the failing packages the Findings tab does not list, each once. */
  readonly unflaggedVerdicts: readonly string[];
  /** Packages that meet fail-on and that an exemption keeps from failing, by exemption. */
  readonly exempt: readonly ExemptCount[];
}

function meetsFailOn(f: Finding): boolean {
  return f.gate?.reachesFailOn === true;
}

function failsRun(f: Finding): boolean {
  return f.gate?.fails === true;
}

function exemptCounts(meeting: readonly Finding[]): readonly ExemptCount[] {
  const counts = new Map<string, number>();
  for (const f of meeting) {
    const by = f.gate?.exemptBy ?? null;
    if (by !== null) counts.set(by, (counts.get(by) ?? 0) + 1);
  }
  return [...counts].map(([by, n]) => ({ by, n }));
}

/** The decided gate, or null where the page says nothing about pass or fail. */
export function runGate(model: Model): RunGate | null {
  const { gate, run, findings } = model.report;
  if (gate === null || gate.fails === null) return null;
  if (!gate.fails && (run.failOn === null || run.failOn === "none")) return null;
  const listed = new Set(population(model, "findings"));
  const failing = findings.filter(failsRun);
  const unflagged = failing.filter((f) => !listed.has(f));
  const meeting = findings.filter(meetsFailOn);
  const failOnApplied = gate.failOnApplied;
  return {
    outcome: gate.fails
      ? "fails"
      : failOnApplied === true
        ? "passes"
        : failOnApplied === false
          ? "unapplied"
          : "open",
    causes: [...new Set(gate.trippedBy)],
    failOn: run.failOn,
    failOnKind: run.failOnKind,
    failOnApplied,
    meets: meeting.length,
    failing: failing.length,
    failingFlagged: failing.length - unflagged.length,
    failingUnflagged: unflagged.length,
    unflaggedVerdicts: [...new Set(unflagged.map((f) => f.verdict))],
    exempt: exemptCounts(meeting),
  };
}

export interface GateFlag {
  readonly text: string;
  /** False: a cause this page has no words for, shown as written. */
  readonly known: boolean;
}

export function gateFlag(cause: string, failOn: string | null): GateFlag {
  if (cause === "fail_on") return { text: `--fail-on=${failOn ?? ""}`, known: true };
  if (cause === "strict_network") return { text: "--strict-network", known: true };
  return { text: cause, known: false };
}

export interface GateHeadline {
  readonly who: string;
  /** "fails", "passes", "does not fail"; null when the run's outcome is not the point. */
  readonly verb: string | null;
  /** The causes that failed the run, or the fail-on a run that did not fail was given. */
  readonly flags: readonly GateFlag[];
  /** The flag the run did not apply; its value is the summary's to say. */
  readonly unapplied: string | null;
}

/** The header's words: "this run fails · --fail-on=high". "Passes" only when lockrot says the
 *  fail-on was applied. */
export function gateHeadline(gate: RunGate, mode: string | null): GateHeadline {
  const who = mode === "generate_baseline" ? "baseline run" : "this run";
  const given = gate.failOn === null ? [] : [gateFlag("fail_on", gate.failOn)];
  switch (gate.outcome) {
    case "fails": {
      const flags = gate.causes.map((cause) => gateFlag(cause, gate.failOn));
      return { who, verb: "fails", flags, unapplied: null };
    }
    case "passes":
      return { who: "this run", verb: "passes", flags: given, unapplied: null };
    case "unapplied":
      return { who, verb: null, flags: [], unapplied: "--fail-on" };
    case "open":
      return { who: "this run", verb: "does not fail", flags: given, unapplied: null };
  }
}

/** What the summary's answer adds, or null when it has nothing to add to the header's words. */
export type GateClause =
  | {
      readonly kind: "failing";
      readonly total: number;
      readonly flagged: number;
      readonly unflagged: number;
      /** What the unflagged failing packages are called: why they fail, where the fail-on says. */
      readonly unflaggedAs: string;
    }
  /** The run fails and no finding does: only its other causes, as flags, failed it. */
  | { readonly kind: "tripped"; readonly flags: readonly GateFlag[] }
  | { readonly kind: "none-fail"; readonly meets: number }
  | { readonly kind: "unapplied"; readonly meets: number; readonly failOn: string };

export function gateClause(gate: RunGate): GateClause | null {
  if (gate.failing > 0) {
    return {
      kind: "failing",
      total: gate.failing,
      flagged: gate.failingFlagged,
      unflagged: gate.failingUnflagged,
      unflaggedAs: gate.failOnKind === "unchecked" ? "unchecked" : "not flagged",
    };
  }
  if (gate.outcome === "fails") {
    const flags = gate.causes
      .filter((cause) => cause !== "fail_on")
      .map((cause) => gateFlag(cause, gate.failOn));
    if (flags.length > 0) return { kind: "tripped", flags };
  }
  if (gate.meets === 0) return null;
  if (gate.failOnApplied === false && gate.failOn !== null) {
    return { kind: "unapplied", meets: gate.meets, failOn: gate.failOn };
  }
  return { kind: "none-fail", meets: gate.meets };
}

export interface NetworkNotes {
  /** The notes that set `network_failures`, what `--strict-network` fails on. */
  readonly failed: number;
  readonly of: number;
}

/** Null when the document types no note, so the page cannot say which. */
export function networkNotes(report: ReportModel): NetworkNotes | null {
  if (report.noteDetails.length === 0) return null;
  const failed = report.noteDetails.filter((note) => note.setsNetworkFailures === true).length;
  return { failed, of: report.noteDetails.length };
}

export interface BaselineExemption {
  readonly exempt: number;
  /** The summary's "already accepted" count, when every exempt package is one of them; else null. */
  readonly accepted: number | null;
}

/** The baseline's exemptions, tied to the Against sentence's "already accepted" when they are a
 *  subset of it, so the two numbers never read as rival answers. */
export function baselineExemption(model: Model): BaselineExemption {
  const exempt = model.report.findings.filter((f) => meetsFailOn(f) && f.gate?.exemptBy === "baseline");
  const delta = baselineDelta(model);
  const listed = new Set(population(model, "findings"));
  const subset =
    delta !== null && delta.filterable && exempt.every((f) => listed.has(f) && sinceBucket(f) === "known");
  return { exempt: exempt.length, accepted: subset ? delta.known : null };
}

export interface ExemptLine extends ExemptCount {
  readonly text: string;
}

function exemptText(by: string, n: number, gate: RunGate, tie: BaselineExemption): string {
  const one = n === 1;
  const they = one ? "it does" : "they do";
  const why = by === "baseline" ? "by the baseline" : "for another reason";
  if (gate.failOnApplied === false) return `${n} of them ${one ? "is" : "are"} also exempt ${why}`;
  if (by !== "baseline" || tie.accepted === null || n > tie.accepted) {
    return `${n} ${one ? "meets" : "meet"} it, but ${one ? "is" : "are"} exempt ${why}, so ${they} not fail`;
  }
  const whose = n === tie.accepted ? `All ${n}` : `${n} of the ${tie.accepted}`;
  return `${whose} already accepted meet it, so ${they} not fail`;
}

/** Each exemption among the packages that meet fail-on, in words. */
export function exemptWords(gate: RunGate, tie: BaselineExemption): readonly ExemptLine[] {
  return gate.exempt.map(({ by, n }) => ({ by, n, text: exemptText(by, n, gate, tie) }));
}

/** A finding's own gate, for its row and its detail. */
export type FindingGateMark =
  | { readonly kind: "fails" }
  | { readonly kind: "exempt"; readonly by: string }
  | { readonly kind: "unapplied" };

export function findingGateMark(model: Model, f: Finding): FindingGateMark | null {
  const root = model.report.gate;
  const own = f.gate;
  if (root === null || own === null) return null;
  if (own.fails === true) return { kind: "fails" };
  if (own.reachesFailOn !== true) return null;
  if (own.exemptBy !== null) return { kind: "exempt", by: own.exemptBy };
  return root.failOnApplied === false ? { kind: "unapplied" } : null;
}

/** The detail's line under its pills: whether this finding fails the run, and why, in words. */
export interface FindingGateLine {
  readonly fails: boolean;
  /** The fail-on it meets, as its flag; null when it meets none. */
  readonly meets: string | null;
  /** Why it meets the fail-on and does not fail: "accepted", "exempt: waiver", "not applied". */
  readonly apart: string | null;
}

export function findingGateLine(model: Model, f: Finding): FindingGateLine | null {
  const mark = findingGateMark(model, f);
  if (mark === null) return null;
  const { failOn } = model.report.run;
  const meets = failOn === null || f.gate?.reachesFailOn !== true ? null : gateFlag("fail_on", failOn).text;
  switch (mark.kind) {
    case "fails":
      return { fails: true, meets, apart: null };
    case "exempt":
      return { fails: false, meets, apart: mark.by === "baseline" ? "accepted" : `exempt: ${mark.by}` };
    case "unapplied":
      return { fails: false, meets, apart: "not applied" };
  }
}

/** The words a row shows for its gate: "fails", or an exemption other than the baseline's, which
 *  the row's new/worsened tag (or its absence) already says. */
export function rowGateWords(mark: FindingGateMark): string | null {
  if (mark.kind === "fails") return "fails";
  if (mark.kind === "exempt" && mark.by !== "baseline") return `exempt: ${mark.by}`;
  return null;
}

/** All packages' filters that list exactly the failing packages Findings does not (gate and their
 *  verdicts), checked against the list; null when no filter lists that set alone. */
export function unflaggedFilters(model: Model): Filters | null {
  const gate = runGate(model);
  if (gate === null || gate.failingUnflagged === 0) return null;
  const known: readonly string[] = VERDICT_ORDER;
  const verdict = [
    ...VERDICT_ORDER.filter((v) => gate.unflaggedVerdicts.includes(v)),
    ...gate.unflaggedVerdicts.filter((v) => !known.includes(v)),
  ];
  const filters: Filters = { ...EMPTY_FILTERS, gate: ["fails"], verdict };
  const listed = applyFilters(model, { ...INITIAL_STATE, filters }, "packages");
  const flagged = new Set(population(model, "findings"));
  const same = listed.length === gate.failingUnflagged && listed.every((f) => failsRun(f) && !flagged.has(f));
  return same ? filters : null;
}

export interface GateFact {
  readonly label: string;
  readonly text: string;
}

const HINT =
  "Pass --fail-on=<verdict or priority> in CI to make the run fail on findings at or above that level.";

/** The header's quiet fact for a report with no decided gate, or null when it states no fail-on. */
export function gateFact(model: Model): GateFact | null {
  const { run } = model.report;
  if (run.failOn === null) return null;
  if (run.failOn === "none") {
    const opening = "This run was told --fail-on=none: it fails on no finding";
    return run.strictNetwork === true
      ? {
          label: "gate: strict network",
          text: `${opening}, but --strict-network fails the run when a network lookup fails. This page lists what it saw. ${HINT}`,
        }
      : { label: "no gate", text: `${opening}, and this page lists what it saw. ${HINT}` };
  }
  return {
    label: `gate: ${run.failOn}`,
    text: `This run was told --fail-on=${run.failOn}. This report does not say which findings meet it, or whether the run failed.`,
  };
}
