/**
 * The run's gate, read off lockrot's root `gate` and each finding's own `gate`: lockrot decides
 * what fails, the page counts and words it (PD-GATE-1..5, DESIGN.md §5). A report whose gate is
 * absent, null or a quiet `--fail-on=none` keeps the header's older fact (`gateFact`).
 */

import type { Finding, Model, ReportModel } from "../model/types";
import { EMPTY_FILTERS, INITIAL_STATE, type Filters } from "../state/types";
import { baselineDelta } from "./baseline";
import { applyFilters, population, sinceBucket } from "./filters";
import { VERDICT_ORDER } from "./vocab";

export type RunOutcome = "fails" | "passes" | "unapplied";

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
  readonly failOnApplied: boolean;
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
  const failOnApplied = gate.failOnApplied !== false;
  return {
    outcome: gate.fails ? "fails" : failOnApplied ? "passes" : "unapplied",
    causes: [...new Set(gate.trippedBy)],
    failOn: run.failOn,
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
  readonly lead: string;
  /** The causes that failed the run, or the fail-on a passing run was given. */
  readonly flags: readonly GateFlag[];
  /** The fail-on a run that did not fail was given and did not apply. */
  readonly unapplied: string | null;
}

/**
 * The header's words: "this run fails · --fail-on=high". Never "passes" for an unapplied fail-on;
 * a run that failed on another cause names only its causes, and the summary says the rest.
 */
export function gateHeadline(gate: RunGate, mode: string | null): GateHeadline {
  const unapplied =
    !gate.failOnApplied && gate.failOn !== null ? gateFlag("fail_on", gate.failOn).text : null;
  if (gate.outcome === "fails") {
    const flags = gate.causes.map((cause) => gateFlag(cause, gate.failOn));
    return { lead: "this run fails", flags, unapplied: null };
  }
  if (gate.outcome === "passes") {
    const flags = gate.failOn === null ? [] : [gateFlag("fail_on", gate.failOn)];
    return { lead: "this run passes", flags, unapplied: null };
  }
  const lead = mode === "generate_baseline" ? "this run wrote a baseline" : "this run applied no fail-on";
  return { lead, flags: [], unapplied };
}

/** What the summary's answer adds, or null when it has nothing to add to the header's words. */
export type GateClause =
  | { readonly kind: "failing"; readonly total: number; readonly flagged: number; readonly unflagged: number }
  | { readonly kind: "none-fail"; readonly meets: number }
  | { readonly kind: "unapplied"; readonly meets: number; readonly failOn: string };

export function gateClause(gate: RunGate): GateClause | null {
  if (gate.failing > 0) {
    return {
      kind: "failing",
      total: gate.failing,
      flagged: gate.failingFlagged,
      unflagged: gate.failingUnflagged,
    };
  }
  if (gate.meets === 0) return null;
  if (!gate.failOnApplied && gate.failOn !== null) {
    return { kind: "unapplied", meets: gate.meets, failOn: gate.failOn };
  }
  return { kind: "none-fail", meets: gate.meets };
}

/** How many run notes set `network_failures`, what `--strict-network` fails on; null when the
 *  document types no note, so the page cannot say which. */
export function networkNotes(report: ReportModel): number | null {
  if (report.noteDetails.length === 0) return null;
  return report.noteDetails.filter((note) => note.setsNetworkFailures === true).length;
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

/** Each exemption among the packages that meet fail-on, in words. */
export function exemptWords(gate: RunGate, tie: BaselineExemption): readonly ExemptLine[] {
  return gate.exempt.map(({ by, n }) => {
    const one = n === 1;
    if (by === "baseline") {
      const text =
        tie.accepted !== null && n <= tie.accepted
          ? `${n} of the ${tie.accepted} already accepted meet it, so ${one ? "it does" : "they do"} not fail`
          : `${n} ${one ? "meets" : "meet"} it, but the baseline exempts ${one ? "it" : "them"}, so ${one ? "it does" : "they do"} not fail`;
      return { by, n, text };
    }
    const text = `${n} ${one ? "meets" : "meet"} it, but ${one ? "is" : "are"} exempt for another reason, so ${one ? "it does" : "they do"} not fail`;
    return { by, n, text };
  });
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

/**
 * All packages' filters that list exactly the failing packages the Findings tab does not: this
 * run's failures and their verdicts. Checked, not assumed; null when no filter lists that set alone.
 */
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
