/** Overview's "Ready to run" block: the ready moves of accepted derivation 10 in lockrot's rank order,
 *  each with what its move card says it clears and leaves. A fact list, not advice. */

import type { Finding, Report2, Run } from "../model/report";
import { checksMissingBody } from "./findingWords";
import type { LinkTarget } from "../state/types";
import { rowCommandArgv } from "./findingRow";
import { plural } from "./format";
import { HELD_KEY, READY_KEY, WAY_OUT_KEY } from "./list";
import { moveCards } from "./moveCards";
import { ADVISORY_NOT_RUN, GATE_KIND_WORDS, MOVE_KIND_WORDS, uncheckedWords } from "./pageVocabulary";
import { SIGNAL_NAMES } from "./vocab";
import { isHeld, needsAnotherWayOut, readyToRun } from "./readyToRun";

export const READY_SHOWN = 3;

export const FIRST_WORDS = {
  head: "Ready to run",
  noteAll: "checked commands no other package holds, in lockrot's rank order",
  noteGate: "for findings that fail the gate, in lockrot's rank order",
  clears: "clears",
  after: "score after it",
  newMajor: "new major",
  noneFlagged: "Nothing to run: no package is flagged.",
  noneReady: "No move is ready to run: no flagged package has a checked command that no other package holds.",
  noneReadyGate:
    "No move is ready to run for the findings that fail the gate: none has a checked command that no other package holds.",
  holders: "Their holders are in each sheet's Held by.",
} as const;

export interface ReadyMove {
  readonly package: string;
  readonly grade: string;
  readonly argv: readonly string[];
  /** The lead move card's "clears" words, or null when it clears nothing it names. */
  readonly clears: string | null;
  /** "{total}, {verdict}" then its conditions, or null without `if_applied`. */
  readonly after: string | null;
  readonly newMajor: boolean;
  /** "Also holds: {name} ({grade}), …", or null when no finding names this package as a holder. */
  readonly alsoHolds: string | null;
  readonly link: LinkTarget;
}

export interface FirstMoves {
  readonly forGate: boolean;
  readonly moves: readonly ReadyMove[];
  /** "All {m} ready to run" when more than `READY_SHOWN` are ready, else null. */
  readonly more: string | null;
  readonly moreLink: LinkTarget | null;
  /** The held count line, only when the gate fails. */
  readonly held: string | null;
  readonly heldLink: LinkTarget | null;
  /** The way-out line: gate-failing findings neither ready nor held, by `next_step.kind`. */
  readonly wayOut: string | null;
  /** Findings when a way-out finding is graded, else All packages, which lists every package; null
   *  when no way-out line shows. */
  readonly wayOutLink: LinkTarget | null;
  /** The block's sentence when no move qualifies. */
  readonly none: string | null;
}

/** "Also holds: …" (coordinator ruling): the findings whose lead `held_by[]` names `pkg` with
 *  `source` `package`, in rank order, at most `READY_SHOWN`, then "+{n} more". No cause word. */
export function alsoHolds(report: Report2, pkg: string): string | null {
  const held = report.findings
    .filter((f) => f.next_step?.held_by.some((h) => h.source === "package" && h.package === pkg) ?? false)
    .sort((a, b) => a.rank - b.rank);
  if (held.length === 0) return null;
  const rest = held.length - READY_SHOWN;
  const names = held.slice(0, READY_SHOWN).map((f) => `${f.package} (${f.verdict})`);
  return `Also holds: ${names.join(", ")}${rest > 0 ? `, +${String(rest)} more` : ""}`;
}

function readyMove(f: Finding, report: Report2, argv: readonly string[]): ReadyMove {
  const card = moveCards(f, report.run)[0];
  const after = card?.after ?? null;
  return {
    package: f.package,
    grade: f.verdict,
    argv,
    clears: card?.clears ?? null,
    after: after === null ? null : [after.result, ...after.conditions].join(", "),
    newMajor: f.next_step?.crosses_major ?? false,
    alsoHolds: alsoHolds(report, f.package),
    link: { view: "findings", pkg: f.package },
  };
}

/** The graded findings whose lead move is ready to run, gate-failing only when the gate fails, by rank. */
export function readyFindings(report: Report2): Finding[] {
  const graded: readonly string[] = report.run.graded_verdicts;
  return report.findings
    .filter((f) => graded.includes(f.verdict) && readyToRun(f) && (!report.gate.fails || f.gate.fails))
    .sort((a, b) => a.rank - b.rank);
}

/** The count line under the list: only when the gate fails and some failing finding is held. */
export function heldLine(report: Report2): string | null {
  if (!report.gate.fails) return null;
  const held = report.findings.filter((f) => f.gate.fails && isHeld(f)).length;
  if (held === 0) return null;
  const failing = report.gate.failing;
  return `${String(held)} of ${plural(failing, "finding", "findings")} that ${failing === 1 ? "fails" : "fail"} the gate ${held === 1 ? "is" : "are"} held by other packages. ${FIRST_WORDS.holders}`;
}

/** The raise-PHP item: "raise PHP {raise_to}" with `php_check.raise_to` as written when every
 *  finding names the same one, else "raise PHP". */
function raisePhpWords(findings: readonly Finding[]): string {
  const targets = new Set(findings.map((f) => f.next_step?.php_check?.raise_to ?? null));
  const [only] = [...targets];
  return targets.size === 1 && only !== null && only !== undefined ? `raise PHP ${only}` : "raise PHP";
}

/** One finding's §7.9.16 words for the check that did not run, the words of the sheet: the
 *  advisory check reads "the advisory check did not run"; any other check reads the sheet's
 *  checks-missing words (`checksMissingBody`), for example "release age (S2) and release branch
 *  (S8) not checked (undated releases)". Never empty and never a raw check id. */
function uncheckedReasons(f: Finding, run: Run): string[] {
  const advisoryOnly = f.checks_missing.length > 0 && f.checks_missing.every((m) => m.check === "advisories");
  if (advisoryOnly || (f.checks_missing.length === 0 && f.security.check === "not_run"))
    return [ADVISORY_NOT_RUN];
  const body = checksMissingBody(f, run);
  if (body !== null) return [body];
  const signals = f.gate.by
    .filter((b) => b.kind === "unchecked")
    .flatMap((b) => b.facts.map((fact) => fact.id));
  return signals.map((id) => uncheckedWords(id, SIGNAL_NAMES[id] ?? id));
}

/** The unchecked item's words over its findings, each reason once; a generic reason when the
 *  document names none. */
function uncheckedItemWords(findings: readonly Finding[], run: Run): string {
  const reasons = [...new Set(findings.flatMap((f) => uncheckedReasons(f, run)))];
  return `unchecked: ${reasons.length === 0 ? "a check did not run" : reasons.join("; ")}`;
}

/** A finding with no move counts by the first `gate.by[]` kind in that field's known order. */
function gateKindOf(f: Finding): string {
  const kinds = f.gate.by.map((b) => b.kind);
  return GATE_KIND_WORDS.find(([kind]) => kinds.includes(kind))?.[0] ?? kinds[0] ?? "grade";
}

interface WayOutItem {
  readonly count: number;
  readonly words: string;
}

/** The way-out items: by `next_step.kind` in `x-known-values` order, then the findings with no move
 *  by their `gate.by[]` kind, then any kind the page does not know, as written. Never "other". */
function wayOutItems(rest: readonly Finding[], run: Run): WayOutItem[] {
  const moveKinds = MOVE_KIND_WORDS.map(([kind]) => kind);
  const byMove = MOVE_KIND_WORDS.flatMap(([kind, words]) => {
    const group = rest.filter((f) => f.next_step?.kind === kind);
    if (group.length === 0) return [];
    return [{ count: group.length, words: kind === "raise-php" ? raisePhpWords(group) : words }];
  });
  const noMove = rest.filter((f) => f.next_step === null);
  const byGate = GATE_KIND_WORDS.flatMap(([kind, words]) => {
    const group = noMove.filter((f) => gateKindOf(f) === kind);
    if (group.length === 0) return [];
    return [{ count: group.length, words: kind === "unchecked" ? uncheckedItemWords(group, run) : words }];
  });
  const unknown = [
    ...new Set(
      rest.flatMap((f) =>
        f.next_step !== null && !moveKinds.includes(f.next_step.kind) ? [f.next_step.kind] : [],
      ),
    ),
  ].map((kind) => ({ count: rest.filter((f) => f.next_step?.kind === kind).length, words: kind }));
  return [...byMove, ...byGate, ...unknown];
}

/** The way-out line over the findings `needsAnotherWayOut` holds: "{k} need another way out: {n}
 *  {words}, …". When nothing is graded and every one is unchecked with no move, it reads "{k}
 *  fail(s) the gate as unchecked: {words}." Null when the gate passes or k is 0. */
export function wayOutLine(report: Report2): string | null {
  if (!report.gate.fails) return null;
  const rest = report.findings.filter(needsAnotherWayOut);
  if (rest.length === 0) return null;
  const k = rest.length;
  const graded: readonly string[] = report.run.graded_verdicts;
  const noneGraded = !report.findings.some((f) => graded.includes(f.verdict));
  if (noneGraded && rest.every((f) => f.next_step === null && gateKindOf(f) === "unchecked"))
    return `${String(k)} ${k === 1 ? "fails" : "fail"} the gate as ${uncheckedItemWords(rest, report.run)}.`;
  const items = wayOutItems(rest, report.run).map(({ count, words }) => `${String(count)} ${words}`);
  return `${String(k)} ${k === 1 ? "needs" : "need"} another way out: ${items.join(", ")}`;
}

/** A count link opens exactly the rows it counts: Findings, with the same gate keys, when every
 *  counted finding is graded (Findings lists graded findings only), else All packages, which lists
 *  every package. Null when nothing is counted. */
export function countTarget(
  report: Report2,
  counted: readonly Finding[],
  gate: readonly string[],
): LinkTarget | null {
  if (counted.length === 0) return null;
  const graded: readonly string[] = report.run.graded_verdicts;
  const view = counted.every((f) => graded.includes(f.verdict)) ? "findings" : "packages";
  return { view, filters: { gate: [...gate] } };
}

/** The gate line's link: every finding that fails the gate, by the count link rule. */
export const gateLineTarget = (report: Report2): LinkTarget | null =>
  report.gate.fails
    ? countTarget(
        report,
        report.findings.filter((f) => f.gate.fails),
        ["fails"],
      )
    : null;

export function firstMoves(report: Report2): FirstMoves {
  const forGate = report.gate.fails;
  const ready = readyFindings(report);
  const moves = ready.slice(0, READY_SHOWN).flatMap((f) => {
    const argv = rowCommandArgv(f);
    return argv === null ? [] : [readyMove(f, report, argv)];
  });
  const none =
    moves.length > 0
      ? null
      : report.packages_flagged === 0
        ? FIRST_WORDS.noneFlagged
        : forGate
          ? FIRST_WORDS.noneReadyGate
          : FIRST_WORDS.noneReady;
  return {
    forGate,
    moves,
    more: ready.length > READY_SHOWN ? `All ${String(ready.length)} ready to run` : null,
    moreLink:
      ready.length > READY_SHOWN
        ? countTarget(report, ready, forGate ? ["fails", READY_KEY] : [READY_KEY])
        : null,
    held: heldLine(report),
    heldLink: countTarget(
      report,
      report.gate.fails ? report.findings.filter((f) => f.gate.fails && isHeld(f)) : [],
      ["fails", HELD_KEY],
    ),
    wayOut: wayOutLine(report),
    wayOutLink: countTarget(report, report.gate.fails ? report.findings.filter(needsAnotherWayOut) : [], [
      "fails",
      WAY_OUT_KEY,
    ]),
    none,
  };
}
