/**
 * The move card, its Then cards and their Held by (SPEC §7.9.8.6, §7.9.8.7, §7.9.13.4, §7.9.13.5).
 * A command is lockrot's argv, checked and quoted for a shell; the page builds none.
 */

import type { AlsoMove, Finding, HeldBy, Move, Run } from "../model/report";
import { isScoreGraded } from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { countedFlagIds } from "./countedFlags";
import { capitalize, metadataWords } from "./findingWords";
import { pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import { safeHref } from "./links";
import { addsBasisWord, phpFloorWord } from "./pageVocabulary";
import { phpConstraintWord } from "./phpAlternatives";
import { dependentNames, foundWords, installedPhpWords } from "./qualifierRows";
import { newTab, type Rich } from "./rich";
import { commandLine, REFUSED_COMMAND } from "./shellArgv";
import { vocabTable } from "./vocab";
import { HEADER_NAMES_SHOWN, HOLDERS_SHOWN, HOLDERS_SHOWN_MAX } from "./sheetThresholds";

type AnyMove = Move | AlsoMove;

const RESOLVED_KINDS: readonly string[] = ["require", "raise-php", "tag"];
const RELEASE_KINDS: readonly string[] = ["update", "require", "raise-php", "tag"];

const NO_MOVE_WORDS = vocabTable<Record<string, string>>({
  package_quiet: "It has no recent release to move to",
  no_higher_release: "No higher branch has released recently enough to move to",
  higher_undated: "lockrot could not date the releases of the higher branches, so it names no move",
  releases_unknown: "lockrot could not read its releases, so it names no fix",
  affected_range_unknown: "No advisory names the versions it affects, so lockrot names no fix",
  local_package: "It is installed from a local path, your own package, so lockrot names no move",
});

const WHY_WORDS = " with this package's name names what requires it";

/** `HEADER_NAMES_SHOWN` names, then "and {n} more". */
export function namesShown(names: readonly string[]): string {
  if (names.length <= HEADER_NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, HEADER_NAMES_SHOWN).join(", ")} and ${names.length - HEADER_NAMES_SHOWN} more`;
}

/** G74: the one name, "the {n} packages in Reach" on a flagged sheet, else the names shown. */
function dependents(finding: Finding): string {
  const names = dependentNames(finding);
  if (names.length === 1) return names[0] ?? "";
  return finding.flags.length > 0 ? `the ${names.length} packages in Reach` : namesShown(names);
}

function unknownMove(move: AnyMove): string {
  if (move.text) return `Next step: ${move.text}`;
  return `Next step: ${move.kind.replaceAll("-", " ")}${move.reason ? ` (${move.reason.replaceAll("_", " ")})` : ""}`;
}

/** G70 to G93: the move's action. */
function moveAction(finding: Finding, move: AnyMove, run: Run): Rich {
  const php = move.php_check;
  const hasDependents = finding.direct_dependents.length > 0;
  const latest = move.latest?.version ?? "";
  switch (move.kind) {
    case "update":
      return [
        `Update to ${move.newest ?? move.version ?? ""}${move.to_branch ? ` on ${move.to_branch}` : ""}`,
      ];
    case "require":
    case "raise-php": {
      const raise = move.kind === "raise-php" ? `Raise require.php to ${php?.raise_to ?? ""}, then ` : "";
      const head = finding.direct
        ? `require ${move.constraint ?? ""}`
        : `move it to ${move.constraint ?? ""}${hasDependents ? ` through ${dependents(finding)}` : ""}`;
      return [capitalize(raise + head)];
    }
    case "replace": {
      const replacement = move.replacement;
      if (!replacement?.package) return ["Find a replacement: the suggestion names no package to require"];
      const href = safeHref(replacement.url);
      const graded = replacement.finding;
      return [
        "Replace it with ",
        href === null
          ? replacement.package
          : {
              href,
              text: `${replacement.package} ↗`,
              name: newTab(`${replacement.package} on its registry`),
            },
        href !== null && finding.replacement === replacement.package ? ", the replacement it names" : "",
        graded ? `, itself ${graded.verdict} (${graded.flag_ids.join(" · ")}) in this lock` : "",
      ].filter((piece) => piece !== "");
    }
    case "find-alternative":
      return [
        move.source === "abandoned" ? "Find a replacement; none is named" : "Find a maintained alternative",
      ];
    case "tag": {
      const what =
        move.crosses_major === false
          ? `the newest tag on its own line, ${latest}`
          : `its newest tag, ${latest}`;
      const older =
        move.latest?.relation === "older"
          ? "; that tag is older than your snapshot: review it first, or replace the package"
          : "";
      return [
        (finding.direct
          ? `Require ${what}`
          : `Move it to ${what}${hasDependents ? `, through ${dependents(finding)}` : ""}`) + older,
      ];
    }
    case "blocked": {
      const requires = php?.requires ?? null;
      if (move.source === "pinned") {
        const installed = finding.installed_php;
        const nor =
          installed.target_runs === false
            ? `, nor does the version you have (${finding.version}, php ${phpConstraintWord(installed.requires ?? "")})`
            : "";
        return [
          requires
            ? `Its newest tag, ${latest}, needs php ${phpConstraintWord(requires)}, which your target, ${run.target_php}, does not run${nor}: replace it`
            : `Its newest tag, ${latest}, does not run on your target, ${run.target_php}${nor}: replace it`,
        ];
      }
      return [
        requires
          ? `${move.to_branch ?? ""} fixes it but needs php ${phpConstraintWord(requires)}, which your target, ${run.target_php}, does not run`
          : `${move.to_branch ?? ""} fixes it, but your target, ${run.target_php}, does not run it`,
      ];
    }
    case "test":
      return [
        move.latest?.is_installed
          ? `${latest} is its newest release: test it on PHP ${run.target_php}, or replace it`
          : `Test it on PHP ${run.target_php}`,
      ];
    case "no-tag":
      return ["It has no tagged release to move to: review the snapshot, or replace it"];
    case "no-fix":
      return ["No release fixes it"];
    case "no-single-fix":
      return ["No single release fixes every advisory; see each advisory's fix"];
    case "no-move":
      if (move.reason === "metadata_not_read") {
        return [
          `lockrot did not read its releases (${metadataWords(finding)}), so it names no move` +
            (move.source === "pinned" ? ": review the snapshot" : ""),
        ];
      }
      return [(move.reason !== null && NO_MOVE_WORDS[move.reason]) || unknownMove(move)];
    default:
      return [unknownMove(move)];
  }
}

/** G95, G96: "both" and "all three" when the move clears every counted fact of at most one advisory. */
function clearsWords(finding: Finding, move: AnyMove): string | null {
  if (move.clears.length === 0) return null;
  const all = advisoryRows(finding).length;
  if (move.clears_all && all <= 1 && move.clears.length === 2) return "both";
  if (move.clears_all && all <= 1 && move.clears.length === 3) return "all three";
  const flags = move.clears.filter((c) => c.kind === "flag").map((c) => c.id);
  const k = move.clears.filter((c) => c.kind === "advisory").length;
  const advisories =
    k === 0
      ? []
      : [
          all === 1
            ? "the advisory"
            : k === all && all === 2
              ? "both advisories"
              : k === all
                ? `all ${k} advisories`
                : `${k} of its ${all} advisories`,
        ];
  return joinAnd([...flags, ...advisories]);
}

export interface ComposerNote {
  readonly text: Rich;
  readonly items: readonly string[];
}

const capNote = (text: string): string => (text.startsWith("lockrot ") ? text : capitalize(text));

/** G105 to G113: one note per `composer_moves_because` value that no earlier card noted. */
function composerNotes(finding: Finding, move: AnyMove, run: Run, noted: readonly string[]): ComposerNote[] {
  const notes: ComposerNote[] = [];
  const note = (text: Rich, items: readonly string[] = []): void => {
    notes.push({ text, items });
  };
  const why: Rich = [{ code: "composer why" }, WHY_WORDS];
  for (const reason of move.composer_moves_because) {
    if (noted.includes(reason)) continue;
    // A value the page does not know reads as its words, never dropped.
    const id: string = reason;
    switch (id) {
      case "holders":
        note(["The packages that hold it may need to move too"]);
        break;
      case "crosses_major": {
        note([`${newLineWords(move.to_branch)} brings its own requirements, which lockrot does not solve`]);
        break;
      }
      case "transitive": {
        note([
          RESOLVED_KINDS.includes(move.kind)
            ? "What requires it must allow it"
            : `Replace or update ${dependents(finding)}`,
        ]);
        const through = "through" in move ? move.through : [];
        const gone = through.filter((e) => e.newest_requires === false);
        const kept = through.filter((e) => e.newest_requires === true);
        const [entries, one, many] =
          gone.length > 0
            ? [gone, "no longer requires", "no longer require"]
            : [kept, "still requires", "still require"];
        const names = entries.map((e) => `${e.package} (${e.newest_stable?.version ?? ""})`);
        if (names.length === 1) note([`The newest release of ${names[0] ?? ""} ${one} it`]);
        else if (names.length > 1) note([`The newest releases of these ${many} it:`], names);
        break;
      }
      case "unreached": {
        const said = finding.flags.length > 0;
        const found = foundWords(finding, run);
        if (RESOLVED_KINDS.includes(move.kind)) {
          const lead = said
            ? "what requires it must allow it"
            : `${found}, so what requires it must allow it`;
          note([`${capNote(lead)} (`, ...why, ")"]);
        } else {
          note(said ? why : [`${capNote(`${found}:`)} `, ...why]);
        }
        break;
      }
      default:
        note([capitalize(id.replaceAll("_", " "))]);
    }
  }
  return notes;
}

export interface PhpAnswer {
  readonly answer: "yes" | "no";
  readonly text: string;
}

export interface MovePhp {
  /** G100: "{to_branch} needs php {requires}". */
  readonly head: Rich | null;
  readonly lines: readonly PhpAnswer[];
}

function movePhp(finding: Finding, move: AnyMove, run: Run, then: boolean): MovePhp | null {
  const php = move.php_check;
  const installed = then ? null : installedPhpWords(finding, run);
  if (!php?.requires && installed === null) return null;
  const lines: PhpAnswer[] = [];
  if (php?.requires) {
    if (php.project_allows === true) lines.push({ answer: "yes", text: "your require.php allows it" });
    if (php.project_allows === false) {
      lines.push({
        answer: "no",
        text: `your require.php still allows ${phpFloorWord(run.project_php_lowest) ?? ""} (a ${php.raise_size ?? ""} raise)`,
      });
    }
    if (php.target_runs === true)
      lines.push({ answer: "yes", text: `your target, ${run.target_php}, runs it` });
    if (php.target_runs === false)
      lines.push({ answer: "no", text: `your target, ${run.target_php}, does not run it` });
  }
  if (installed !== null) lines.push({ answer: "no", text: installed });
  return {
    head: php?.requires
      ? [`${move.to_branch ?? ""} needs php `, { code: phpConstraintWord(php.requires) }]
      : null,
    lines,
  };
}

export interface MoveAfter {
  readonly result: string;
  readonly verdict: string;
  readonly conditions: readonly string[];
}

function moveAfter(finding: Finding, move: AnyMove): MoveAfter | null {
  const applied = move.if_applied;
  if (!isScoreGraded(finding.score) || !applied) return null;
  const noNew = applied.assumes.includes("no_new_advisories");
  const counted = countedFlagIds(finding);
  const bound = applied.at_most ? (noNew ? "at most, from the facts it checked, " : "at most ") : "";
  return {
    result: `${bound}${applied.total}, ${applied.verdict}`,
    verdict: applied.verdict,
    conditions: [
      ...(move.adds.length > 0 ? [`adds ${move.adds.map((a) => a.id).join(" and ")}`] : []),
      ...move.unverified
        .filter((u) => u.kind === "flag" && !counted.includes(u.id))
        .map((u) => `${u.id} not checked`),
      ...(applied.assumes.includes("composer_resolves") ? ["if Composer resolves it"] : []),
      ...(noNew ? ["advisories on its new versions not checked"] : []),
    ],
  };
}

export interface Holder {
  readonly root: boolean;
  /** "your composer.json", else the package. */
  readonly name: string;
  readonly version: string | null;
  readonly grade: string | null;
  /** "requires {constraint}", then " · itself {flags}" (G117, G118). */
  readonly meta: Rich;
  /** "require ^2.0 on 2.x", after "its own step:". */
  readonly step: string | null;
}

export const STEP_LABEL = "its own step:";

export const holderName = (h: Holder): string => (h.version === null ? h.name : `${h.name} ${h.version}`);

export interface HeldByBlock {
  readonly count: number;
  readonly shown: readonly Holder[];
  readonly fold: { readonly summary: string; readonly holders: readonly Holder[] } | null;
  /** A Then card's hidden ", the move to {x}" (G116); null on the lead card. */
  readonly then: string | null;
}

const isGradedHolder = (held: HeldBy, run: Run): boolean =>
  (run.graded_verdicts as readonly string[]).includes(held.holder?.verdict ?? "");

const isZeroLine = (toBranch: string | null): boolean => (toBranch ?? "").startsWith("0.");

/** A Findings row's tag for a move that crosses a major: the words the sheet's note opens with. */
export const newLineTag = (toBranch: string | null): string =>
  isZeroLine(toBranch) ? "a new 0.x line" : "a new major";

/** The sheet's Composer note opens with these, the 0.x form with its reason. */
const newLineWords = (toBranch: string | null): string =>
  isZeroLine(toBranch) ? "A new 0.x line (Composer treats 0.x minors as breaking)" : "A new major";

/** The root's name as a holder (§7.9.13): the sheet's Held by and a row's "held by" say it alike. */
export const ROOT_HOLDER_NAME = "your composer.json";

function holderItem(held: HeldBy, run: Run): Holder {
  if (held.source === "root") {
    return {
      root: true,
      name: ROOT_HOLDER_NAME,
      version: null,
      grade: null,
      meta: ["requires ", { code: held.constraint }],
      step: null,
    };
  }
  const holder = held.holder ?? null;
  const flags = holder?.flag_ids ?? [];
  const step = holder?.next_step ?? null;
  const where = step?.to_branch ? ` on ${step.to_branch}` : "";
  return {
    root: false,
    name: held.package ?? "",
    version: held.version ?? "",
    grade: holder !== null && isGradedHolder(held, run) ? holder.verdict : null,
    meta: [
      "requires ",
      { code: held.constraint },
      ...(flags.length > 0 ? [` · itself ${flags.join(" · ")}`] : []),
    ],
    step:
      step === null
        ? null
        : step.kind === "require" && step.constraint
          ? `require ${step.constraint}${where}`
          : `${step.kind.replaceAll("-", " ")}${where}`,
  };
}

function foldWords(rest: readonly HeldBy[], run: Run): string {
  const counts = new Map<string, number>();
  for (const held of rest) {
    const holder = held.holder ?? null;
    const word = isGradedHolder(held, run)
      ? `graded ${holder?.verdict ?? ""}`
      : (holder?.flag_ids ?? []).length === 0
        ? "with nothing flagged"
        : (holder?.verdict ?? "");
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  if (counts.size === 1 && counts.has("with nothing flagged"))
    return `${rest.length} more, nothing flagged in them`;
  return `${rest.length} more: ${joinAnd([...counts].map(([word, n]) => `${n} ${word}`))}`;
}

/** §7.9.13's holder rank, the Held by "More" order: the root first, then by the holder's grade in
 *  `run.graded_verdicts`, then the rest. Lower comes first; equal ranks keep data order. */
export function holderRank(h: Pick<HeldBy, "source" | "holder">, run: Run): number {
  if (h.source === "root") return -1;
  const graded: readonly string[] = run.graded_verdicts;
  const verdict = h.holder?.verdict ?? "";
  return graded.includes(verdict) ? graded.indexOf(verdict) : graded.length;
}

function heldBy(move: AnyMove, run: Run, then: boolean): HeldByBlock | null {
  const holders = move.held_by;
  if (holders.length === 0) return null;
  const rank = (h: HeldBy): number => holderRank(h, run);
  const fold = holders.length > HOLDERS_SHOWN_MAX;
  const ordered = fold
    ? holders
        .map((h, at) => ({ h, at }))
        .sort((a, b) => rank(a.h) - rank(b.h) || a.at - b.at)
        .map(({ h }) => h)
    : holders;
  const shown = fold ? ordered.slice(0, HOLDERS_SHOWN) : ordered;
  const rest = fold ? ordered.slice(HOLDERS_SHOWN) : [];
  return {
    count: holders.length,
    shown: shown.map((h) => holderItem(h, run)),
    fold:
      rest.length === 0
        ? null
        : { summary: foldWords(rest, run), holders: rest.map((h) => holderItem(h, run)) },
    then: then ? `, the move to ${move.constraint ?? move.to_branch ?? move.kind}` : null,
  };
}

export interface MoveCard {
  /** "The move", "Next step" or "Then" (G94). */
  readonly heading: string;
  /** A "Next step" card names no release and carries no command: it is drawn dashed. */
  readonly advice: boolean;
  readonly then: boolean;
  readonly action: Rich;
  readonly argvs: readonly (readonly string[])[];
  readonly clears: string | null;
  readonly stays: string | null;
  readonly notChecked: string | null;
  readonly adds: readonly string[];
  readonly php: MovePhp | null;
  readonly after: MoveAfter | null;
  readonly composer: readonly ComposerNote[];
  readonly heldBy: HeldByBlock | null;
}

/** The POSIX lines of a command box, or the refusal: one refused argv refuses the whole move (§5.6). */
export function commandLines(argvs: readonly (readonly string[])[]): string[] {
  if (argvs.length === 0) return [];
  const lines = argvs.map((argv) => commandLine(argv, "posix"));
  return lines.every((line) => line !== null) ? lines : [REFUSED_COMMAND];
}

export const COMMAND_WORDS = { one: "Command", several: "Commands, in order", check: "Check" } as const;

/** A move card's label: a `why-not` step checks why a move is held, it does not make it. */
export function commandLabel(argvs: readonly (readonly string[])[]): string {
  if (argvs.length > 0 && argvs.every((argv) => argv[1] === "why-not")) return COMMAND_WORDS.check;
  return argvs.length > 1 ? COMMAND_WORDS.several : COMMAND_WORDS.one;
}

function moveCard(
  finding: Finding,
  move: AnyMove,
  run: Run,
  then: boolean,
  noted: readonly string[],
): MoveCard {
  const names = RELEASE_KINDS.includes(move.kind);
  const actionable = names || move.commands.length > 0 || move.kind === "replace";
  const leftFlags = move.leaves.filter((l) => l.kind === "flag").map((l) => l.id);
  const leftAdvisories = move.leaves.length - leftFlags.length;
  return {
    heading: then ? "Then" : actionable ? "The move" : "Next step",
    advice: !actionable,
    then,
    action: moveAction(finding, move, run),
    argvs: move.commands,
    clears: clearsWords(finding, move),
    stays:
      move.leaves.length > 0 && names
        ? [
            ...leftFlags,
            ...(leftAdvisories > 0
              ? [`${leftAdvisories} ${pluralNoun(leftAdvisories, "advisory", "advisories")}`]
              : []),
          ].join(", ")
        : null,
    notChecked: move.unverified.length > 0 && names ? move.unverified.map((u) => u.id).join(", ") : null,
    adds: move.adds.map((a) => `${a.id}: ${addsBasisWord(a.basis)}`),
    php: movePhp(finding, move, run, then),
    after: moveAfter(finding, move),
    composer: composerNotes(finding, move, run, noted),
    heldBy: heldBy(move, run, then),
  };
}

/** The lead card, then one Then card per `also[]` move, in order. */
export function moveCards(finding: Finding, run: Run): MoveCard[] {
  const lead = finding.next_step;
  if (lead === null) return [];
  const cards: MoveCard[] = [];
  const noted: string[] = [];
  for (const [move, then] of [[lead, false], ...lead.also.map((also) => [also, true] as const)] as const) {
    cards.push(moveCard(finding, move, run, then, [...noted]));
    noted.push(...move.composer_moves_because);
  }
  return cards;
}
