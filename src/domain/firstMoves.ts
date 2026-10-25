/** Overview's "Ready to run" block: the ready moves of accepted derivation 10 in lockrot's rank order,
 *  each with what its move card says it clears and leaves. A fact list, not advice. */

import type { Finding, Report2 } from "../model/report";
import type { LinkTarget } from "../state/types";
import { rowCommand, rowCommandArgv, rowNewLine } from "./findingRow";
import { plural } from "./format";
import { HELD_KEY, READY_KEY, WAY_OUT_KEY } from "./list";
import { moveCards } from "./moveCards";
import { plain } from "./rich";
import {
  ADVISORY_NOT_RUN,
  CHECK_REASON_WORDS,
  GATE_KIND_WORDS,
  isKnownCheck,
  MOVE_KIND_WORDS,
  skippedCheckWord,
} from "./pageVocabulary";
import { isHeld, needsAnotherWayOut, readyToRun } from "./readyToRun";

export const READY_SHOWN = 3;

export const FIRST_WORDS = {
  head: "Ready to run",
  noteAll: "checked commands no other package holds, in lockrot's rank order",
  noteGate: "for findings that fail the gate, in lockrot's rank order",
  clears: "clears",
  after: "score after it",

  noneFlagged: "Nothing to run: no package is flagged.",
  noneReady: "No move is ready to run: no flagged package has a checked command that no other package holds.",
  noneRefused: "No move is ready to run: Composer refuses the lock itself, so no move was checked.",
  noneReadyGate:
    "No move is ready to run for the findings that fail the gate: none has a checked command that no other package holds.",
  holders: "Their holders are in each sheet's Held by.",
} as const;

export interface ReadyMove {
  readonly package: string;
  readonly grade: string;
  readonly argv: readonly string[];
  /** That step's POSIX line. */
  readonly command: string;
  /** The lead move card's "clears" words, or null when it clears nothing it names. */
  readonly clears: string | null;
  /** The move card's After: "{total}, {verdict}" and its G104 conditions, or null without `if_applied`. */
  readonly after: { readonly result: string | null; readonly conditions: readonly string[] } | null;
  /** "a new major" or "a new 0.x line" when the move crosses a major, as its Findings row says. */
  readonly newLine: string | null;
  /** "Also holds: {name} ({grade}), …", or null when no finding names this package as a holder. */
  readonly alsoHolds: string | null;
  readonly link: LinkTarget;
}

/** A run of words; a `code` part is an id the page does not know, printed as written in a code element. */
export type WordPart = { readonly text: string; readonly code?: true };

export const partsText = (parts: readonly WordPart[]): string => parts.map(({ text }) => text).join("");

export interface FirstMoves {
  readonly forGate: boolean;
  /** The head's note, or null with no move. */
  readonly note: string | null;
  readonly moves: readonly ReadyMove[];
  /** "All {m} ready to run" when more than `READY_SHOWN` are ready, else null. */
  readonly more: string | null;
  readonly moreLink: LinkTarget | null;
  /** The held count line, only when the gate fails. */
  readonly held: string | null;
  readonly heldLink: LinkTarget | null;
  /** The way-out line: gate-failing findings neither ready nor held, by kind or by check. */
  readonly wayOut: string | null;
  readonly wayOutParts: readonly WordPart[] | null;
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

function readyMove(f: Finding, report: Report2, argv: readonly string[], command: string): ReadyMove {
  const card = moveCards(f, report.run)[0];
  const after = card?.after ?? null;
  return {
    package: f.package,
    grade: f.verdict,
    argv,
    command,
    clears: card?.clears ?? null,
    after: after === null ? null : { result: after.result, conditions: after.conditions.map(plain) },
    newLine: rowNewLine(f),
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

const notChecked = (check: string): readonly WordPart[] =>
  isKnownCheck(check)
    ? [{ text: `${skippedCheckWord(check)} not checked` }]
    : [{ text: check, code: true }, { text: " not checked" }];

/** One finding's words for the check that did not run: its `checks_missing[]` entries that block a
 *  signal its unchecked `gate.by[]` names. */
function uncheckedReasons(f: Finding): (readonly WordPart[])[] {
  const signals = new Set(
    f.gate.by.filter((b) => b.kind === "unchecked").flatMap((b) => b.facts.map((fact) => fact.id)),
  );
  const missing = f.checks_missing.filter((m) => m.blocks.some((signal) => signals.has(signal)));
  if (missing.length > 0)
    return missing.map((m) =>
      m.check === "advisories" ? [{ text: ADVISORY_NOT_RUN }] : notChecked(m.check),
    );
  return [[{ text: f.security.check === "not_run" ? ADVISORY_NOT_RUN : "a check did not run" }]];
}

/** The unchecked item's words over its findings, each reason once, joined ", ". */
function uncheckedItemParts(findings: readonly Finding[]): WordPart[] {
  const seen = new Set<string>();
  const reasons = findings.flatMap(uncheckedReasons).filter((parts) => {
    const key = JSON.stringify(parts);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    { text: "unchecked: " },
    ...reasons.flatMap((parts, at) => (at === 0 ? parts : [{ text: ", " }, ...parts])),
  ];
}

/** A finding with no move counts by the first `gate.by[]` kind in that field's known order. */
function gateKindOf(f: Finding): string {
  const kinds = f.gate.by.map((b) => b.kind);
  return GATE_KIND_WORDS.find(([kind]) => kinds.includes(kind))?.[0] ?? kinds[0] ?? "grade";
}

const COMPOSER_KINDS: readonly string[] = ["update", "require", "raise-php", "tag"];
const NO_MOVE_CHECKED = "the run checked no move";
const REFUSED = "Composer refuses the move";

/** Where a way-out finding counts: a move the check stopped counts by its check, any other by its kind. */
type Slot =
  | { readonly by: "kind"; readonly kind: string }
  | { readonly by: "gate"; readonly kind: string }
  | { readonly by: "refused" }
  | { readonly by: "reason"; readonly reason: string }
  | { readonly by: "unrun" };

function slotOf(f: Finding, report: Report2): Slot {
  const step = f.next_step;
  if (step === null) return { by: "gate", kind: gateKindOf(f) };
  if (step.check?.result === "refused") return { by: "refused" };
  if (step.check?.result === "not_checked") return { by: "reason", reason: step.check.reason ?? "" };
  if (step.check === null && report.run.move_check === null && COMPOSER_KINDS.includes(step.kind))
    return { by: "unrun" };
  return { by: "kind", kind: step.kind };
}

interface WayOutItem {
  readonly count: number;
  readonly parts: readonly WordPart[];
}

const firstSeen = (values: readonly string[]): string[] => [...new Set(values)];

/** The way-out items: the kinds in `x-known-values` order, the unknown kinds as written, the no-move
 *  findings by `gate.by[]` kind, refused, not checked by reason in the table's order, "the run
 *  checked no move", then the unknown reasons. Never "other". */
function wayOutItems(rest: readonly Finding[], report: Report2): WayOutItem[] {
  const slotted = rest.map((f) => ({ f, slot: slotOf(f, report) }));
  const pick = (test: (slot: Slot) => boolean): Finding[] =>
    slotted.filter(({ slot }) => test(slot)).map(({ f }) => f);
  const item = (group: readonly Finding[], parts: readonly WordPart[]): WayOutItem[] =>
    group.length === 0 ? [] : [{ count: group.length, parts }];
  const kindOf = (slot: Slot): string | null => (slot.by === "kind" ? slot.kind : null);
  const reasonOf = (slot: Slot): string | null => (slot.by === "reason" ? slot.reason : null);
  const known = MOVE_KIND_WORDS.map(([kind]) => kind);
  const knownReasons = CHECK_REASON_WORDS.map(([reason]) => reason);
  const kinds = slotted.map(({ slot }) => kindOf(slot)).filter((kind) => kind !== null);
  const reasons = slotted.map(({ slot }) => reasonOf(slot)).filter((reason) => reason !== null);
  return [
    ...MOVE_KIND_WORDS.flatMap(([kind, words]) => {
      const group = pick((slot) => kindOf(slot) === kind);
      return item(group, [{ text: kind === "raise-php" ? raisePhpWords(group) : words }]);
    }),
    ...firstSeen(kinds.filter((kind) => !known.includes(kind))).flatMap((kind) =>
      item(
        pick((slot) => kindOf(slot) === kind),
        [{ text: kind }],
      ),
    ),
    ...GATE_KIND_WORDS.flatMap(([kind, words]) => {
      const group = pick((slot) => slot.by === "gate" && slot.kind === kind);
      return item(group, kind === "unchecked" ? uncheckedItemParts(group) : [{ text: words }]);
    }),
    ...item(
      pick((slot) => slot.by === "refused"),
      [{ text: REFUSED }],
    ),
    ...CHECK_REASON_WORDS.flatMap(([reason, words]) =>
      item(
        pick((slot) => reasonOf(slot) === reason),
        [{ text: `not checked: ${words}` }],
      ),
    ),
    ...item(
      pick((slot) => slot.by === "unrun"),
      [{ text: `not checked: ${NO_MOVE_CHECKED}` }],
    ),
    ...firstSeen(reasons.filter((reason) => !knownReasons.includes(reason))).flatMap((reason) =>
      item(
        pick((slot) => reasonOf(slot) === reason),
        [{ text: "not checked: " }, { text: reason, code: true }],
      ),
    ),
  ];
}

/** The way-out line over the findings `needsAnotherWayOut` holds: "{k} need another way out: {n}
 *  {words}, …". When nothing is graded and every one is unchecked with no move, it reads "{k}
 *  fail(s) the gate as unchecked: {words}." Null when the gate passes or k is 0. */
export function wayOutParts(report: Report2): WordPart[] | null {
  if (!report.gate.fails) return null;
  const rest = report.findings.filter(needsAnotherWayOut);
  if (rest.length === 0) return null;
  const k = rest.length;
  const graded: readonly string[] = report.run.graded_verdicts;
  const noneGraded = !report.findings.some((f) => graded.includes(f.verdict));
  if (noneGraded && rest.every((f) => f.next_step === null && gateKindOf(f) === "unchecked"))
    return [
      { text: `${String(k)} ${k === 1 ? "fails" : "fail"} the gate as ` },
      ...uncheckedItemParts(rest),
      { text: "." },
    ];
  const items = wayOutItems(rest, report).flatMap(({ count, parts }, at) => [
    { text: `${at === 0 ? "" : ", "}${String(count)} ` },
    ...parts,
  ]);
  return [{ text: `${String(k)} ${k === 1 ? "needs" : "need"} another way out: ` }, ...items];
}

export function wayOutLine(report: Report2): string | null {
  const parts = wayOutParts(report);
  return parts === null ? null : partsText(parts);
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
    const command = rowCommand(f);
    return argv === null || command === null ? [] : [readyMove(f, report, argv, command)];
  });
  const none =
    moves.length > 0
      ? null
      : report.packages_flagged === 0
        ? FIRST_WORDS.noneFlagged
        : report.run.move_check?.baseline === "refused"
          ? FIRST_WORDS.noneRefused
          : forGate
            ? FIRST_WORDS.noneReadyGate
            : FIRST_WORDS.noneReady;
  return {
    forGate,
    note: moves.length === 0 ? null : forGate ? FIRST_WORDS.noteGate : FIRST_WORDS.noteAll,
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
    wayOutParts: wayOutParts(report),
    wayOutLink: countTarget(report, report.gate.fails ? report.findings.filter(needsAnotherWayOut) : [], [
      "fails",
      WAY_OUT_KEY,
    ]),
    none,
  };
}
