/** The words and lookups of a report-2 Findings row (SPEC §7.9.5): flag pills, baseline marks, the
 *  reach, the age reading, the last column, row runs and the notes above the list. */

import type { Finding, Grade, HeldBy, Move, Report2, Run, TermSecurity } from "../model/report";
import { isScoreGraded, isTermSecurity } from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { countedFlagIds } from "./countedFlags";
import {
  acceptsWholePackage,
  advisoryName,
  isAre,
  NAMES_SHOWN,
  namesCapped,
  oneDecimal,
} from "./findingWords";
import { plural, pluralNoun } from "./format";
import { holderRank, newLineTag, ROOT_HOLDER_NAME } from "./moveCards";
import { afterIt } from "./securityBlock";
import { commandLine } from "./shellArgv";
import { allowlistByInWhy, allowlistReason, headlineReasonWord } from "./pageVocabulary";
import { vocabTable, type Tone } from "./vocab";

export interface BaselineMark {
  /** A tick for a state the baseline already holds; an outlined dot and a visible word otherwise. */
  readonly tick: boolean;
  readonly word: string | null;
  readonly hidden: string;
}

export interface FlagPill {
  readonly id: string;
  readonly word: string;
  /** The band the pill's tone comes from; null for an accepted pill, which is grey. */
  readonly band: Grade | null;
  readonly accepted: boolean;
  /** Who accepted the flag, and until when. */
  readonly title: string | null;
  readonly noFix: string | null;
  readonly mark: BaselineMark | null;
}

type FindingFlag = Finding["flags"][number];

const securityTerm = (f: Finding): TermSecurity | undefined =>
  isScoreGraded(f.score) ? f.score.terms.find(isTermSecurity) : undefined;

const flagBand = (run: Run, id: string): Grade | null =>
  run.score_model.flags.find((flag) => flag.id === id)?.band ?? null;

/** A high advisory nothing fixes is critical-toned: the band of the term's points, not the severity's. */
export function securityBand(run: Run, term: TermSecurity): Grade | null {
  const severity = run.score_model.severities.find((s) => s.id === term.severity);
  if (severity === undefined) return null;
  return term.multiplier === 2 ? severity.band_no_reachable_fix : severity.band;
}

function headlineWord({ headline }: FindingFlag): string {
  switch (headline.unit) {
    case "years":
      return headline.value === null ? "" : `${oneDecimal(headline.value as number)} y`;
    case "php":
      return `PHP ${String(headline.value)}`;
    case "reason":
      return headlineReasonWord(String(headline.value));
    default:
      return String(headline.value);
  }
}

/** With more than one counted advisory the words name the deciding one, as the verdict line does. */
export function noReachableFix(f: Finding, run: Run): string | null {
  const term = securityTerm(f);
  if (term === undefined || term.multiplier !== 2 || !isScoreGraded(f.score)) return null;
  const many = f.score.parts.security.of > 1;
  const name = advisoryName(f, term.advisory);
  if (term.fix_kind === "none") return `no release fixes ${many ? name : "it"}`;
  return many
    ? `no release fixing ${name} runs on PHP ${run.target_php}`
    : `no fixing release runs on PHP ${run.target_php}`;
}

function acceptedTitle(f: Finding): string | null {
  const entry = f.allowlist;
  if (entry === null) return null;
  const reason =
    entry.by === "project"
      ? `${entry.reason}${entry.version === null ? "" : ` for ${entry.version}`}`
      : ((entry.reason_id === null ? null : allowlistReason(entry.reason_id)) ?? entry.reason);
  return entry.expires === null ? reason : `${reason} · until ${entry.expires}`;
}

const MARK_WORDS: Readonly<Record<string, string>> = {
  new: "new",
  re_rated: "re-rated",
  fix_lost: "fix lost",
};

/** Worst first; a state outside it ranks before all, so it is shown rather than hidden. */
const ADVISORY_STATE_ORDER = ["fix_lost", "re_rated", "new", "known"];

function markOf(state: string, coveredBy: string | null): BaselineMark {
  if (state === "known") return { tick: true, word: null, hidden: "known to the baseline" };
  if (state === "covered") {
    const by = coveredBy === null ? "the baseline" : `the recorded ${coveredBy}`;
    return { tick: true, word: null, hidden: `covered by ${by}` };
  }
  return {
    tick: false,
    word: MARK_WORDS[state] ?? state.replaceAll("_", " "),
    hidden: " since the baseline",
  };
}

function worstAdvisoryState(f: Finding): string | null {
  const states = advisoryRows(f).flatMap((row) => (row.baseline === null ? [] : [row.baseline.state]));
  const rank = (state: string) => ADVISORY_STATE_ORDER.indexOf(state);
  return states.reduce<string | null>(
    (worst, state) => (worst === null || rank(state) < rank(worst) ? state : worst),
    null,
  );
}

function markFor(f: Finding, flag: FindingFlag): BaselineMark | null {
  if (flag.id === "vulnerable") {
    const state = worstAdvisoryState(f);
    return state === null ? null : markOf(state, null);
  }
  return flag.baseline === null ? null : markOf(flag.baseline.state, flag.baseline.covered_by);
}

/** One pill per flag, the counted ones in `flags[]` order, then the accepted ones. */
export function flagPills(f: Finding, run: Run): readonly FlagPill[] {
  const counted = countedFlagIds(f);
  const term = securityTerm(f);
  const pill = (flag: FindingFlag): FlagPill => {
    const accepted = !counted.includes(flag.id);
    if (accepted) {
      return {
        id: flag.id,
        word: "accepted",
        band: null,
        accepted,
        title: acceptedTitle(f),
        noFix: null,
        mark: null,
      };
    }
    const vulnerable = flag.id === "vulnerable";
    return {
      id: flag.id,
      word: headlineWord(flag),
      band: vulnerable ? (term === undefined ? null : securityBand(run, term)) : flagBand(run, flag.id),
      accepted,
      title: null,
      noFix: vulnerable ? noReachableFix(f, run) : null,
      mark: markFor(f, flag),
    };
  };
  const pills = f.flags.map(pill);
  return [...pills.filter((p) => !p.accepted), ...pills.filter((p) => p.accepted)];
}

/** The pills a row shows: every one, or the counted ones while the rail's toggle hides the accepted. */
export function shownPills(f: Finding, run: Run, hideAccepted: boolean): readonly FlagPill[] {
  return flagPills(f, run).filter((pill) => !(hideAccepted && pill.accepted));
}

/** Keyed on who wrote the entry, never on the score-0 word. A partial entry says nothing here. */
export function maintenanceAccepted(f: Finding): string | null {
  return acceptsWholePackage(f) && f.allowlist !== null
    ? `maintenance accepted (${allowlistByInWhy(f.allowlist.by)})`
    : null;
}

/** A row's reach in one short line: one direct requirement it comes through, and how many more;
 *  the sheet's Reach lists them all, in `direct_dependents` order. */
export interface ReachLine {
  readonly lead: string;
  readonly through: string | null;
  readonly more: number;
  readonly dev: boolean;
}

/** Accepted derivation 2: the requirement on lockrot's `chain`, when `direct_dependents` lists it,
 *  else the first of `direct_dependents`, and the others counted. */
export function reachLine(f: Finding): ReachLine {
  const dependents = f.reach === "transitive" ? f.direct_dependents : [];
  const onChain = f.chain[0];
  const first = onChain !== undefined && dependents.includes(onChain) ? onChain : (dependents[0] ?? null);
  return {
    lead: first === null ? f.reach : "via",
    through: first,
    more: Math.max(0, dependents.length - 1),
    dev: f.dev,
  };
}

/** The count after a capped list (accepted derivations 2 and 3). */
export const moreWord = (n: number): string => `and ${n} more`;

/** The reach cell as text: "via {name} and {n} more", the reach id, then " · dev". */
export function reachText(f: Finding): string {
  const { lead, through, more, dev } = reachLine(f);
  const way = through === null ? lead : `${lead} ${through}${more > 0 ? ` ${moreWord(more)}` : ""}`;
  return dev ? `${way} · dev` : way;
}

export function reachWord(f: Finding): string {
  const way = f.reach === "transitive" ? `via ${namesCapped(f.direct_dependents)}` : f.reach;
  return f.dev ? `${way} · dev` : way;
}

export interface AgeReading {
  readonly kind: "branch_release" | "release" | "push";
  readonly years: number;
  readonly level: string;
  readonly warn: number;
  readonly high: number;
}

const AGE_KINDS = ["branch_release", "release", "push"] as const;

/** The reading a fired S8, S2 or S4 judged: the first with a `level`. */
export function ageReading(f: Finding, run: Run): AgeReading | null {
  const thresholds = run.thresholds;
  if (thresholds === null) return null;
  for (const kind of AGE_KINDS) {
    const reading = f.age[kind];
    if (reading === null || reading.level === null) continue;
    const push = kind === "push";
    return {
      kind,
      years: reading.years,
      level: reading.level,
      warn: push ? thresholds["push-warn-years"] : thresholds["release-warn-years"],
      high: push ? thresholds["push-high-years"] : thresholds["release-high-years"],
    };
  }
  return null;
}

const AGE_LEADS: Readonly<Record<AgeReading["kind"], string>> = {
  branch_release: "installed branch last released",
  release: "last release",
  push: "last push",
};

/** A pill already prints the reading's years, so the bar need not print them again. */
export const ageInPill = (f: Finding, run: Run, reading: AgeReading, hideAccepted: boolean): boolean =>
  shownPills(f, run, hideAccepted).some((pill) => pill.word === `${oneDecimal(reading.years)} y`);

export function ageScaleLabel(reading: AgeReading): string {
  return `${AGE_LEADS[reading.kind]} ${oneDecimal(reading.years)} years ago; warn at ${reading.warn} years, high at ${reading.high}`;
}

export interface NextStepWords {
  readonly text: string;
  /** The whole text when `text` is cut. */
  readonly title: string | null;
  readonly href: string | null;
  /** A package holds the move; a root hold is the sheet's Held by to say. */
  readonly held: boolean;
}

const SUGGESTION_SHOWN = 40;

const NO_MOVE_WORDS: Readonly<Record<string, string>> = {
  package_quiet: "—",
  releases_unknown: "fix not known",
  metadata_not_read: "releases not read",
  local_package: "your own package",
};

function replaceWords(step: Move): Pick<NextStepWords, "text" | "title" | "href"> {
  const replacement = step.replacement;
  if (replacement === null) return { text: step.text, title: null, href: null };
  if (replacement.package !== null) {
    const itself = replacement.finding === null ? "" : ` (itself ${replacement.finding.verdict})`;
    return { text: `→ ${replacement.package}${itself}`, title: null, href: null };
  }
  const { suggestion, url } = replacement;
  const cut = suggestion.length > SUGGESTION_SHOWN;
  return {
    text: `suggests: ${cut ? `${suggestion.slice(0, SUGGESTION_SHOWN)}…` : suggestion}`,
    title: cut ? suggestion : null,
    href: url,
  };
}

function blockedWords(step: Move, run: Run): string {
  if (step.source === "pinned") return `no tag runs on ${run.target_php}`;
  const requires = step.php_check?.requires ?? null;
  return requires === null
    ? `${step.to_branch ?? ""} does not run on ${run.target_php}`
    : `${step.to_branch ?? ""} needs php ${requires}; target ${run.target_php} runs no fixing release`;
}

function kindWords(f: Finding, step: Move, run: Run): string {
  const where = f.direct ? "require" : "move to";
  switch (step.kind) {
    case "require":
      return `${where} ${step.constraint ?? ""}`;
    case "raise-php":
      return "php floor raise";
    case "update":
      return "composer update";
    case "tag": {
      const older = step.latest?.relation === "older" ? " · older than snapshot" : "";
      return `${where} tag ${step.latest?.version ?? ""}${older}`;
    }
    case "blocked":
      return blockedWords(step, run);
    case "test":
      return `test on ${run.target_php}`;
    case "find-alternative":
      return "find an alternative";
    case "no-tag":
      return "no tag";
    case "no-move":
      return NO_MOVE_WORDS[step.reason ?? ""] ?? "no move";
    case "no-fix":
      return "no fix";
    case "no-single-fix":
      return "see advisories";
    default:
      return step.text;
  }
}

/** The last column: words for `next_step.kind` and its fields; a kind it does not know prints the
 *  move's own text. */
export function nextStepWords(f: Finding, run: Run): NextStepWords {
  const step = f.next_step;
  if (step === null) return { text: "", title: null, href: null, held: false };
  const held = [step, ...step.also].some((move) => move.held_by.some((hold) => hold.source === "package"));
  if (step.kind === "replace") return { ...replaceWords(step), held };
  return { text: kindWords(f, step, run), title: null, href: null, held };
}

type Hold = Pick<HeldBy, "source" | "package" | "holder">;

/** Accepted derivation 3: the distinct package holders, sorted by the sheet's holder rank
 *  (`holderRank`), the first named and the rest counted; with only a root hold, the root as the
 *  sheet's Held by names it. */
export function heldByLine(
  holds: readonly Hold[],
  run: Run,
): { readonly name: string; readonly more: number } | null {
  const seen = new Set<string>();
  const packages = holds.filter((hold) => {
    if (hold.source !== "package" || hold.package === null || seen.has(hold.package)) return false;
    seen.add(hold.package);
    return true;
  });
  const [first, ...rest] = packages
    .map((hold, at) => ({ hold, at, rank: holderRank(hold, run) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at);
  if (first !== undefined) return { name: first.hold.package ?? "", more: rest.length };
  return holds.some((hold) => hold.source === "root") ? { name: ROOT_HOLDER_NAME, more: 0 } : null;
}

export const heldByWords = ({ name, more }: { name: string; more: number }): string =>
  `held by ${name}${more > 0 ? ` ${moreWord(more)}` : ""}`;

/** `next_step.held_by[]`, then each `also[]` move's. */
export const rowHolds = (f: Finding): readonly Hold[] =>
  f.next_step === null ? [] : [f.next_step, ...f.next_step.also].flatMap((move) => move.held_by);

const ROW_STEPS: ReadonlySet<string> = new Set(["update", "require"]);

/** Accepted derivation 8 (§5.6): the first checked `update` or `require` step of the move; none
 *  when one argv fails the check or every step is a `why-not`. */
export function rowCommandArgv(f: Finding): readonly string[] | null {
  const argvs = f.next_step?.commands ?? [];
  if (argvs.some((argv) => commandLine(argv, "posix") === null)) return null;
  return argvs.find((argv) => ROW_STEPS.has(argv[1] ?? "")) ?? null;
}

/** What is left after the lead move, with G139's Composer caveat only when its `assumes` holds
 *  `composer_resolves`; null without `if_applied` (SPEC §7.9.5). */
export const rowAfter = (f: Finding): string | null =>
  f.next_step === null ? null : afterIt(f.next_step.if_applied);

/** Accepted derivation 11: the lead move crosses a major (`next_step.crosses_major`), in the
 *  sheet's Composer note words without their reason, which the sheet keeps. Null otherwise. */
export function rowNewLine(f: Finding): string | null {
  const step = f.next_step;
  if (step === null || step.crosses_major !== true) return null;
  return newLineTag(step.to_branch);
}

/** Accepted derivation 11's group count: of the lead moves whose `crosses_major` is set (true or
 *  false), how many are true. A null value counts in neither; the head says nothing when either
 *  number is 0. */
export function majorCount(findings: readonly Finding[]): { readonly n: number; readonly m: number } {
  const known = findings.flatMap((f) =>
    f.next_step?.crosses_major == null ? [] : [f.next_step.crosses_major],
  );
  return { n: known.filter((crosses) => crosses).length, m: known.length };
}

export const majorCountWords = ({ n, m }: { n: number; m: number }): string | null =>
  m === 0 || n === 0 ? null : `${n} of ${m} moves cross a major`;

/** That step as one POSIX line. */
export function rowCommand(f: Finding): string | null {
  const argv = rowCommandArgv(f);
  return argv === null ? null : commandLine(argv, "posix");
}

export interface RunSegment {
  /** The flag the run shares, or null for rows that form no run. */
  readonly key: string | null;
  readonly findings: readonly Finding[];
}

/** On `vulnerable` when the advisories decide or no maintenance flag leads, else on the lead. */
function runKey(f: Finding): string | null {
  if (!isScoreGraded(f.score)) return null;
  return f.score.decided_by === "security" || f.lead === null ? "vulnerable" : f.lead;
}

/** The fewest consecutive rows a run note is written for; two alike read fine without one. */
const RUN_MIN = 3;

/** Never re-sorted: a stretch between runs is one plain segment. */
export function runSegments(findings: readonly Finding[]): readonly RunSegment[] {
  const segments: RunSegment[] = [];
  let plain: Finding[] = [];
  let i = 0;
  while (i < findings.length) {
    const key = runKey(findings[i] as Finding);
    let j = i + 1;
    while (key !== null && j < findings.length && runKey(findings[j] as Finding) === key) j++;
    if (j - i >= RUN_MIN) {
      if (plain.length > 0) segments.push({ key: null, findings: plain });
      plain = [];
      segments.push({ key, findings: findings.slice(i, j) });
    } else {
      plain = [...plain, ...findings.slice(i, j)];
    }
    i = j;
  }
  if (plain.length > 0) segments.push({ key: null, findings: plain });
  return segments;
}

export function runNote(key: string, count: number): string {
  return `${count} packages, all ${key}`;
}

export interface PackagesNote {
  readonly text: string;
  readonly packages: readonly string[];
}

export function ignoredNote(report: Report2): PackagesNote | null {
  const carrying = report.findings.filter((f) => f.security.ignored_count > 0);
  if (carrying.length === 0) return null;
  const total = carrying.reduce((n, f) => n + f.security.ignored_count, 0);
  return {
    text: `${plural(total, "advisory", "advisories")} ${isAre(total)} ignored by Composer's audit policy and ${pluralNoun(total, "does", "do")} not count`,
    packages: carrying.map((f) => f.package),
  };
}

export function uncheckedNote(report: Report2): PackagesNote | null {
  const unchecked = report.findings.filter((f) => f.security.status === "unchecked");
  if (unchecked.length === 0) return null;
  const n = unchecked.length;
  return {
    text: `${plural(n, "package", "packages")} ${pluralNoun(n, "was", "were")} not checked for advisories`,
    packages: unchecked.map((f) => f.package),
  };
}

/** The group head's count. */
export const packagesCount = (n: number): string => plural(n, "package", "packages");

const GRADE_TONES: Readonly<Record<string, Tone>> = vocabTable({
  critical: "crit",
  high: "high",
  medium: "med",
  low: "low",
});

/** The tone token of a band or a grade; `low` is the fallback for one the page does not know. */
export const gradeTone = (band: string | null): Tone =>
  band === null ? "low" : (GRADE_TONES[band] ?? "low");

/** A verdict's tone, by the table of `score_model` that lists it: a band's own tone, none for a
 *  score-0 verdict, and `unk` for `unknown` and for an id the model lists in neither. */
export function verdictTone(model: Run["score_model"], verdict: string): Tone {
  if (verdict === "unknown") return "unk";
  if (model.zero_verdicts.some((zero) => zero.verdict === verdict)) return "none";
  return model.bands.some((band) => band.verdict === verdict) ? gradeTone(verdict) : "unk";
}

/** What a screen reader hears after the package's name: the bar is hidden from it. */
export const rowSpoken = (f: Finding): string => `score ${f.score.total}, ${f.verdict}`;

export const gradeListLabel = (verdict: string): string => `${verdict} findings`;

/** Accepted derivation 1, on `gate.fails` only: the group head's words and the row tag. */
export const GATE_WORDS = {
  row: "fails gate",
  group: (failing: number, rows: number, applied: boolean): string | null => {
    if (!applied || failing === 0) return null;
    return failing === rows ? "all fail the gate" : `${failing} fail the gate`;
  },
} as const;

/** The Findings table's column heads, in the cells' order. */
export const FINDINGS_COLUMNS = 6;

export const FINDINGS_HEAD = {
  score: "Score",
  pkg: "Package",
  flags: "Flags",
  age: "Years since release",
  reach: "Reached",
  next: "Next step",
} as const;

/** A note's packages: the first few by name, the rest counted. */
export function cappedPackages(packages: readonly string[]): {
  shown: readonly string[];
  more: string | null;
} {
  const rest = packages.length - NAMES_SHOWN;
  return { shown: packages.slice(0, NAMES_SHOWN), more: rest > 0 ? `and ${rest} more` : null };
}

/** The Findings groups: the graded findings by grade, each run of one verdict in list order. */
export function gradeGroups(findings: readonly Finding[]): { verdict: string; findings: Finding[] }[] {
  const groups: { verdict: string; findings: Finding[] }[] = [];
  for (const finding of findings) {
    const current = groups.at(-1);
    if (current?.verdict === finding.verdict) current.findings.push(finding);
    else groups.push({ verdict: finding.verdict, findings: [finding] });
  }
  return groups;
}
