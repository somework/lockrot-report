/**
 * The move card, its Then cards and their Held by (SPEC §7.9.8.6, §7.9.8.7, §7.9.13.4, §7.9.13.5).
 * A command is lockrot's argv, checked and quoted for a shell; the page builds none.
 */

import type { AlsoMove, Finding, HeldBy, Move, Run } from "../model/report";
import { isScoreGraded } from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { countedFlagIds } from "./countedFlags";
import { capitalize, metadataWords, signalData } from "./findingWords";
import { pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import { compareHolds } from "./holdRank";
import { linkWords } from "./linkWords";
import { safeHref } from "./links";
import { addsBasisWord, checkReasonRich, phpFloorWord, stoppedCheckWords } from "./pageVocabulary";
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
    case "update": {
      const on = move.to_branch ? ` on ${move.to_branch}` : "";
      const installs = move.check?.installs ?? null;
      // `newest` is the highest release, so a solve that installs another one installs below it.
      return move.newest !== null && installs !== null && installs !== move.newest
        ? [`Update to ${installs}${on}, below the newest ${move.newest}`]
        : [`Update to ${move.newest ?? move.version ?? ""}${on}`];
    }
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
      if (move.reason === "no_release_admits") {
        const s11 = signalData(finding, "S11");
        if (s11) return [`No release above ${finding.version} admits PHP ${s11.newest_php}`];
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

type ThroughGroup = "local" | "replace" | "update";

const THROUGH_VERBS: Readonly<Record<ThroughGroup, (n: number) => string>> = {
  local: (n) => pluralNoun(n, "change your own package", "change your own packages"),
  replace: () => "replace",
  update: () => "replace or update",
};

/** Ruling R6: one action per group of dependents, groups in `through[]` order, joined with ", or ". */
function throughActions(finding: Finding, move: AnyMove): string {
  const through = "through" in move ? move.through : [];
  const all = dependentNames(finding);
  const groups = new Map<ThroughGroup, string[]>();
  for (const name of all) {
    const entry = through.find((e) => e.package === name);
    const group: ThroughGroup = entry?.local
      ? "local"
      : entry?.newest_is_installed === true
        ? "replace"
        : "update";
    groups.set(group, [...(groups.get(group) ?? []), name]);
  }
  const requirer = finding.chain.length >= 3 ? (finding.chain.at(-2) ?? null) : null;
  const names = (group: readonly string[]): string => {
    const [one] = group;
    if (group.length === 1 && one !== undefined) {
      return requirer !== null && one === finding.chain[0] ? `${one} (${requirer} requires it)` : one;
    }
    return group.length === all.length ? dependents(finding) : namesShown(group);
  };
  return [...groups]
    .map(([group, list]) => `${THROUGH_VERBS[group](list.length)} ${names(list)}`)
    .join(", or ");
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
        // A move that Composer's solver checked, resolved or refused, drops the clause, as `next_step.text` does.
        const solved = move.check?.result === "resolves" || move.check?.result === "refused";
        note([
          `${newLineWords(move.to_branch)} brings its own requirements${solved ? "" : ", which lockrot does not solve"}`,
        ]);
        break;
      }
      case "transitive": {
        // The joint request moves what requires it (§5.6, the joint request).
        if (!RESOLVED_KINDS.includes(move.kind)) note([capitalize(throughActions(finding, move))]);
        else if (move.moves_with.length === 0) note(["What requires it must allow it"]);
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
        if (RESOLVED_KINDS.includes(move.kind) && move.moves_with.length > 0) {
          if (!said) note([capNote(found)]);
        } else if (RESOLVED_KINDS.includes(move.kind)) {
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
  /** "{bound}{total}, {verdict}", or null when the move has no `if_applied` and the block holds the
   *  check line alone. */
  readonly result: string | null;
  readonly verdict: string | null;
  readonly conditions: readonly Rich[];
}

const COMPOSER_KINDS: readonly string[] = ["update", "require", "raise-php", "tag"];
const RESOLVES_CAVEAT = "if Composer resolves it";
/** The card names where the cause is, so it does not take the short words of the reason table: the
 *  PHP line when the target lies outside the window, else the Run tab. */
const BASELINE_REFUSED_CARD_WORDS = {
  outside: "Composer's solver refuses the lock itself at the target PHP; see the PHP line in the Overview",
  other: "Composer's solver refuses the lock itself; the Run tab names the cause",
} as const;

/** The check line of SPEC §7.9.21 "The move", one After condition; null for a kind that runs no
 *  Composer request. An unknown reason prints as written, in a code element. */
export function checkLine(move: AnyMove, run: Run): Rich | null {
  const check = move.check;
  if (check === null) {
    return run.move_check === null && COMPOSER_KINDS.includes(move.kind)
      ? [`${RESOLVES_CAVEAT} (not checked: the run checked no move)`]
      : null;
  }
  switch (check.result) {
    case "resolves":
      return ["checked with Composer"];
    case "refused":
      return ["Composer refuses the move"];
    default:
      return [
        `${RESOLVES_CAVEAT} (not checked: `,
        ...(check.reason === "baseline_refused"
          ? [
              run.php_window?.target.inside === false
                ? BASELINE_REFUSED_CARD_WORDS.outside
                : BASELINE_REFUSED_CARD_WORDS.other,
            ]
          : checkReasonRich(check.reason ?? "")),
        ")",
      ];
  }
}

function moveAfter(finding: Finding, move: AnyMove, run: Run): MoveAfter | null {
  if (!isScoreGraded(finding.score)) return null;
  const applied = move.if_applied;
  const check = checkLine(move, run);
  if (!applied) return check === null ? null : { result: null, verdict: null, conditions: [check] };
  const noNew = applied.assumes.includes("no_new_advisories");
  const counted = countedFlagIds(finding);
  const bound = applied.at_most ? (noNew ? "at most, from the facts it checked, " : "at most ") : "";
  return {
    result: `${bound}${applied.total}, ${applied.verdict}`,
    verdict: applied.verdict,
    conditions: [
      ...(move.adds.length > 0 ? [[`adds ${move.adds.map((a) => a.id).join(" and ")}`]] : []),
      ...move.unverified
        .filter((u) => u.kind === "flag" && !counted.includes(u.id))
        .map((u) => [`${u.id} not checked`]),
      ...(check === null ? [] : [check]),
      ...(noNew ? [["advisories on its new versions not checked"]] : []),
    ],
  };
}

export interface Holder {
  readonly root: boolean;
  /** "your composer.json", else the package. */
  readonly name: string;
  readonly version: string | null;
  readonly grade: string | null;
  /** The link words of §7.9.21, then " · itself {flags}" (G117, G118). */
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

export const isZeroLine = (toBranch: string | null): boolean => (toBranch ?? "").startsWith("0.");

/** A Findings row's tag for a move that crosses a major: the words the sheet's note opens with. */
export const newLineTag = (toBranch: string | null): string =>
  isZeroLine(toBranch) ? "a new 0.x line" : "a new major";

/** The sheet's Composer note opens with these, the 0.x form with its reason. */
const newLineWords = (toBranch: string | null): string =>
  isZeroLine(toBranch) ? "A new 0.x line (Composer treats 0.x minors as breaking)" : "A new major";

/** The root's name as a holder (§7.9.13): the sheet's Held by and a row's "held by" say it alike. */
export const ROOT_HOLDER_NAME = "your composer.json";

type HolderStep = NonNullable<NonNullable<HeldBy["holder"]>["next_step"]>;

const ownStep = (step: HolderStep, direct: boolean, where: string): string =>
  step.kind === "require" && step.constraint
    ? `${direct ? "require" : "move to"} ${step.constraint}${where}`
    : `${step.kind.replaceAll("-", " ")}${where}`;

const RELEASE_WORDS = ", its own release";

/** G118: a hold by the finding's own package. Its holder record is the installed version's, so its
 *  grade, flags and step are not this release's. */
function releaseHolder(held: HeldBy): Holder {
  const version = held.version;
  return {
    root: false,
    name: `${held.package ?? ""}${version === null ? RELEASE_WORDS : ""}`,
    version: version === null ? null : `${version}${RELEASE_WORDS}`,
    grade: null,
    meta: linkWords(held),
    step: null,
  };
}

function holderItem(held: HeldBy, run: Run, finding: Finding): Holder {
  if (held.source === "root") {
    return {
      root: true,
      name: ROOT_HOLDER_NAME,
      version: null,
      grade: null,
      meta: linkWords(held),
      step: null,
    };
  }
  if (held.package === finding.package) return releaseHolder(held);
  const holder = held.holder ?? null;
  const flags = holder?.flag_ids ?? [];
  const step = holder?.next_step ?? null;
  const where = step?.to_branch ? ` on ${step.to_branch}` : "";
  return {
    root: false,
    name: held.package ?? "",
    version: held.version ?? "",
    grade: holder !== null && isGradedHolder(held, run) ? holder.verdict : null,
    meta: [...linkWords(held), ...(flags.length > 0 ? [` · itself ${flags.join(" · ")}`] : [])],
    step:
      step === null
        ? null
        : [ownStep(step, holder?.direct ?? true, where), stoppedCheckWords(step.check)]
            .filter((w) => w !== null)
            .join(" · "),
  };
}

function foldWord(held: HeldBy, run: Run, own: string): string {
  if (held.source === "root") return "in composer.json";
  if (held.package === own) return "of its own releases";
  const holder = held.holder ?? null;
  if (holder === null) return "at a release other than its locked one";
  if (isGradedHolder(held, run)) return `graded ${holder.verdict}`;
  return holder.flag_ids.length === 0 ? "with nothing flagged" : holder.verdict;
}

function foldWords(rest: readonly HeldBy[], run: Run, own: string): string {
  const counts = new Map<string, number>();
  for (const held of rest) {
    const word = foldWord(held, run, own);
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  if (counts.size === 1 && counts.has("with nothing flagged"))
    return `${rest.length} more, nothing flagged in them`;
  return `${rest.length} more: ${joinAnd([...counts].map(([word, n]) => `${n} ${word}`))}`;
}

function heldBy(finding: Finding, move: AnyMove, run: Run, then: boolean): HeldByBlock | null {
  const holders = move.held_by;
  if (holders.length === 0) return null;
  const fold = holders.length > HOLDERS_SHOWN_MAX;
  const ordered = [...holders].sort((a, b) => compareHolds(a, b, run, finding.package));
  const shown = fold ? ordered.slice(0, HOLDERS_SHOWN) : ordered;
  const rest = fold ? ordered.slice(HOLDERS_SHOWN) : [];
  return {
    count: holders.length,
    shown: shown.map((h) => holderItem(h, run, finding)),
    fold:
      rest.length === 0
        ? null
        : {
            summary: foldWords(rest, run, finding.package),
            holders: rest.map((h) => holderItem(h, run, finding)),
          },
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
  /** L5: the config.platform.php step that comes before the commands. */
  readonly platformStep: string | null;
  /** What a why-not check in the command box shows, on a move that holders hold. */
  readonly checkNote: string | null;
  /** G161: the packages the joint request also updates, one line under the command box. */
  readonly movesWith: string | null;
  readonly clears: string | null;
  readonly stays: string | null;
  readonly notChecked: string | null;
  readonly adds: readonly string[];
  readonly php: MovePhp | null;
  readonly after: MoveAfter | null;
  readonly composer: readonly ComposerNote[];
  readonly heldBy: HeldByBlock | null;
}

/** "8" reads as "8.0", as lockrot normalises `target_php`. */
const minorOf = (version: string): string => {
  const [major = "", minor = "0"] = version.split(".");
  return `${major}.${minor}`;
};

/** Setting the platform does not help when Composer refuses the lock for another cause. */
function stillRefused(run: Run): string {
  if (run.move_check?.baseline !== "refused") return "";
  return run.php_window?.target.inside === false
    ? " Composer still refuses the lock itself: the PHP line names the packages."
    : " Composer still refuses the lock itself: the Run tab names the cause.";
}

/** A lock whose config.platform.php lies outside the target's minor makes Composer check every
 *  command at that PHP, not the target's. */
export function platformStep(run: Run): string | null {
  const override = run.php_window?.platform_override ?? null;
  if (override === null || minorOf(override) === minorOf(run.target_php)) return null;
  return `First set config.platform.php to your PHP ${run.target_php} release: the lock records ${override}.${stillRefused(run)}`;
}

/** The POSIX lines of a command box, or the refusal: one refused argv refuses the whole move (§5.6). */
export function commandLines(argvs: readonly (readonly string[])[]): string[] {
  if (argvs.length === 0) return [];
  const lines = argvs.map((argv) => commandLine(argv, "posix"));
  return lines.every((line) => line !== null) ? lines : [REFUSED_COMMAND];
}

export const COMMAND_WORDS = { one: "Command", several: "Commands, in order", check: "Check" } as const;

/** A move card's `commands_label`: a `why-not` step checks why a move is held, it does not make it. */
export function commandLabel(argvs: readonly (readonly string[])[]): string | null {
  if (argvs.length === 0) return null;
  if (argvs.every((argv) => argv[1] === "why-not")) return COMMAND_WORDS.check;
  return argvs.length > 1 ? COMMAND_WORDS.several : COMMAND_WORDS.one;
}

function movesWithLine(move: AnyMove): string | null {
  if (move.moves_with.length === 0) return null;
  return `It also updates ${joinAnd(
    move.moves_with.map(
      (m) =>
        `${m.package}${m.installed_version === null ? "" : ` from ${m.installed_version}`} to ${m.version}`,
    ),
  )}`;
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
    after: moveAfter(finding, move, run),
    composer: composerNotes(finding, move, run, noted),
    heldBy: heldBy(finding, move, run, then),
    platformStep: move.commands.length > 0 ? platformStep(run) : null,
    checkNote:
      move.commands.some((argv) => argv[1] === "why-not") &&
      move.composer_moves_because.includes("holders") &&
      commandLines(move.commands)[0] !== REFUSED_COMMAND
        ? "This shows which package holds the move."
        : null,
    movesWith: movesWithLine(move),
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
