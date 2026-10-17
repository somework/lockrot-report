/**
 * The qualifier rows of the verdict block (SPEC §7.9.8.5, §7.9.13.3): Reach, Origin, Not judged,
 * Unchecked, Not run, PHP, Accepted and Gate.
 */

import type { Finding, Run } from "../model/report";
import { isScoreGraded } from "../model/report";
import { countedFlagIds } from "./countedFlags";
import {
  advisoryName,
  allowlistReasonWords,
  capitalize,
  entryReasonWords,
  isAre,
  metadataWords,
  printedModifiers,
} from "./findingWords";
import { day } from "./format";
import { joinAnd } from "./joinWords";
import { allowlistBy, causeWord, signalName, skippedCheckWord } from "./pageVocabulary";
import { phpConstraintWord } from "./phpAlternatives";
import type { Rich } from "./rich";

const HALVING_REASONS: readonly string[] = ["transitive", "unreached", "dev"];

const rootsWords = (run: Run): string =>
  run.include_dev
    ? "your composer.json's require or require-dev"
    : "your composer.json's require (require-dev counts only with --dev)";

/** G41, G113: what the run walked, and that lockrot found no path from it. */
export function noPathWords(finding: Finding, run: Run): string {
  return finding.depth_unmeasured === "no_composer_json"
    ? "The run read no composer.json, so lockrot found no path to it"
    : `lockrot found no path from ${rootsWords(run)} to it`;
}

/** G113's `{found}`. */
export function foundWords(finding: Finding, run: Run): string {
  return finding.depth_unmeasured === "no_composer_json"
    ? "the run read no composer.json"
    : `lockrot found no path from ${rootsWords(run)} to it`;
}

/** The names a package comes in through, without the package itself. */
export const dependentNames = (finding: Finding): string[] =>
  finding.direct_dependents.filter((name) => name !== finding.package);

export interface ReachRow {
  readonly where: string;
  readonly before: string | null;
  /** The how line: one name joins it, more follow it as a list. */
  readonly how: string;
  readonly names: readonly string[];
  readonly halving: readonly string[];
}

function reachRow(finding: Finding, run: Run): ReachRow {
  let names = dependentNames(finding);
  const through = names.length > 1 ? "through:" : "through ";
  let before: string | null = null;
  let how: string;
  // An id the page does not know reads as its cause words (G42).
  const reach: string = finding.reach;
  switch (reach) {
    case "direct":
      how = names.length > 0 ? `Required directly, and also ${through}` : "Required directly";
      break;
    case "transitive":
      if (finding.named_in.length === 1 && finding.named_in[0] === "require-dev" && !run.include_dev) {
        before = "Required directly only in require-dev, which this run did not walk";
        how = `In production it comes in ${through}`;
      } else {
        how = `Not required directly, ${through}`;
      }
      break;
    case "unreached":
      how = noPathWords(finding, run);
      names = [];
      break;
    default:
      how = capitalize(causeWord(reach, finding.origin.kind));
      names = [];
  }
  const modifiers = isScoreGraded(finding.score) ? printedModifiers(finding.score.modifiers) : [];
  return {
    where: finding.dev ? "Dev only: in packages-dev" : "Production: not in packages-dev",
    before,
    how,
    names,
    halving: modifiers.map((m) => {
      const who = m.applies_to === "maintenance" ? "Its maintenance" : "Its whole score";
      return HALVING_REASONS.includes(m.reason)
        ? `${who} counts half`
        : `${who} is divided by ${m.divide_by} (${m.reason})`;
    }),
  };
}

/** The golden lines of the Reach row: one name inline, more as a list, the halving last. */
export const reachLines = (r: ReachRow): string[] => [
  r.where,
  ...(r.before === null ? [] : [r.before]),
  r.how + (r.names.length === 1 ? (r.names[0] ?? "") : ""),
  ...(r.names.length > 1 ? r.names : []),
  ...r.halving,
];

export function notJudgedRow(finding: Finding): string | null {
  const score = finding.score;
  const notJudged = isScoreGraded(score)
    ? !finding.maintenance_judged && score.parts.maintenance.status !== "counted"
    : finding.verdict === "unknown";
  if (!notJudged) return null;
  const ids = [
    ...new Set(
      [...finding.checks_skipped, ...finding.checks_missing]
        .filter((c) => c.check === "release_metadata")
        .flatMap((c) => c.blocks),
    ),
  ];
  const names = ids.length > 0 ? joinAnd(ids.map((id) => `${signalName(id)} (${id})`)) : "release checks";
  return `Its ${names} ${ids.length > 0 ? isAre(ids.length) : "are"} not judged: lockrot could read no release metadata (${metadataWords(finding)})`;
}

function uncheckedRows(finding: Finding, run: Run): string[] {
  const order = (id: string): number => {
    const at = (run.signal_ids as readonly string[]).indexOf(id);
    return at === -1 ? run.signal_ids.length : at;
  };
  const fired = new Set<string>(finding.signals.map((s) => s.id));
  const groups = new Map<string, { state: string; words: string; ids: string[] }>();
  for (const entry of finding.checks_missing) {
    for (const id of entry.blocks) {
      const state = fired.has(id) ? "incomplete" : "not checked";
      const words = entryReasonWords(finding, entry);
      const key = JSON.stringify([state, words]);
      const group = groups.get(key) ?? { state, words, ids: [] };
      if (!group.ids.includes(id)) group.ids.push(id);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ state, words, ids }) =>
    capitalize(
      `${joinAnd([...ids].sort((a, b) => order(a) - order(b)).map((id) => `${signalName(id)} (${id})`))} ${state} (${words})`,
    ),
  );
}

function notRunRows(finding: Finding, acceptedOnly: boolean, metadataSaid: boolean): string[] {
  const groups = new Map<string, string[]>();
  for (const entry of finding.checks_skipped) {
    const accepted = entry.reason === "accepted_by_config";
    if (entry.reason === "branch_snapshot") continue;
    if (metadataSaid && entry.check === "release_metadata" && !accepted) continue;
    if (acceptedOnly && !accepted) continue;
    const words = entryReasonWords(finding, entry);
    groups.set(words, [...(groups.get(words) ?? []), skippedCheckWord(entry.check)]);
  }
  return [...groups].map(([words, checks]) => capitalize(`${joinAnd(checks)} (${words})`));
}

/** G59, G102: the installed release needs a php the target does not run. Null when a pinned
 *  `blocked` move's action says it. */
export function installedPhpWords(finding: Finding, run: Run): string | null {
  const php = finding.installed_php;
  const move = finding.next_step;
  if (php.target_runs !== false || (move?.kind === "blocked" && move.source === "pinned")) return null;
  return (
    `its installed release, ${finding.version}, needs php ${phpConstraintWord(php.requires ?? "")}, ` +
    `which your target, ${run.target_php}, does not run: Composer will not install it there`
  );
}

export interface AcceptedRow {
  readonly head: string;
  readonly reason: string;
  /** G63: "Entry {pattern}", then " · expires {date}"; null on a type entry, whose pattern is null. */
  readonly entry: Rich | null;
}

function acceptedRow(finding: Finding): AcceptedRow | null {
  const allowlist = finding.allowlist;
  if (allowlist === null) return null;
  const by = allowlistBy(allowlist.by);
  const ids = allowlist.flag_ids;
  return {
    head:
      ids === null
        ? `Its maintenance is accepted by ${by}`
        : `${joinAnd(ids)} ${isAre(ids.length)} accepted by ${by}`,
    reason: capitalize(allowlistReasonWords(allowlist)),
    entry:
      allowlist.pattern === null
        ? null
        : [
            "Entry ",
            { code: allowlist.pattern },
            ...(allowlist.expires ? [` · expires ${day(allowlist.expires)}`] : []),
          ],
  };
}

export interface GateRow {
  readonly state: "fails" | "reaches" | "clear" | "none";
  /** The gate word, which prints bold: "fails", "reaches", "does not reach"; empty with no gate. */
  readonly word: string;
  readonly rest: string;
  readonly tripped: string | null;
}

function gateValueWords(by: { value: string; kind: string }, run: Run): string {
  const threshold = run.gates.find((g) => g.value === by.value)?.threshold ?? null;
  switch (by.kind) {
    case "grade":
      return `grade ${threshold ?? by.value} or above`;
    case "flag":
      return `the ${threshold ?? by.value} flag`;
    case "vulnerable":
      return threshold === null ? "an advisory" : `an advisory of ${threshold} severity or above`;
    case "unchecked":
      return "a check that did not run";
    default:
      return by.value;
  }
}

function gateRow(finding: Finding, run: Run): GateRow {
  const gate = finding.gate;
  const facts: string[] = [];
  for (const by of gate.by) {
    for (const fact of by.facts) {
      const name = fact.kind === "advisory" ? advisoryName(finding, fact.id) : fact.id;
      if (!facts.includes(name)) facts.push(name);
    }
  }
  const tripped = facts.length > 0 ? `Tripped by ${joinAnd(facts)}` : null;
  if (run.gates.length === 0) return { state: "none", word: "", rest: "No gate in this run", tripped };
  if (gate.fails) {
    const values = gate.by.length > 0 ? `: ${joinAnd(gate.by.map((by) => gateValueWords(by, run)))}` : "";
    return { state: "fails", word: "fails", rest: ` the run${values}`, tripped };
  }
  if (gate.reaches_fail_on) {
    const exempt = typeof gate.exempt_by === "string" ? `, exempt by ${gate.exempt_by}` : "";
    return { state: "reaches", word: "reaches", rest: ` the gate${exempt}`, tripped };
  }
  return {
    state: "clear",
    word: "does not reach",
    rest: ` the run's gate: ${joinAnd(run.gates.map((g) => gateValueWords(g, run)))}`,
    tripped,
  };
}

export const gateLines = (g: GateRow): string[] => [
  g.word + g.rest,
  ...(g.tripped === null ? [] : [g.tripped]),
];

export interface Qualifiers {
  readonly reach: ReachRow | null;
  readonly origin: string | null;
  readonly notJudged: string | null;
  readonly unchecked: readonly string[];
  readonly notRun: readonly string[];
  readonly php: string | null;
  readonly accepted: AcceptedRow | null;
  readonly gate: GateRow;
}

export function qualifiers(finding: Finding, run: Run): Qualifiers {
  const origin = finding.origin;
  const counted = countedFlagIds(finding).includes("vulnerable");
  const originRow =
    !finding.from_composer_repository && counted
      ? origin.local
        ? "It is installed from a local path (your own code); the advisory is published for the package of this name, so check the version your path holds"
        : origin.kind === "vcs"
          ? "It is installed from vcs; the advisory is published for the package of this name"
          : null
      : null;
  const notJudged = notJudgedRow(finding);
  const move = finding.next_step;
  const php = move === null ? installedPhpWords(finding, run) : null;
  return {
    reach: finding.flags.length > 0 ? reachRow(finding, run) : null,
    origin: originRow,
    notJudged,
    unchecked: uncheckedRows(finding, run),
    notRun: notRunRows(
      finding,
      !isScoreGraded(finding.score),
      notJudged !== null || move?.reason === "metadata_not_read",
    ),
    php: php === null ? null : capitalize(php),
    accepted: acceptedRow(finding),
    gate: gateRow(finding, run),
  };
}
