/**
 * The verdict line and the readings of the detail sheet (SPEC §7.9.8.5, §7.9.13.2): the grade and
 * why, then one reading per counted flag that the verdict line does not hold.
 */

import type { Finding, FindingFlag, RepositoryMetadata, Run, ScoreGraded, Severity } from "../model/report";
import { isScoreGraded, isSecurityVulnerable, isTermSecurity } from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { ago } from "./ago";
import { countedFlagIds } from "./countedFlags";
import {
  capitalize,
  countsAs,
  isAre,
  lowerFirst,
  oneDecimal,
  printedModifiers,
  signalData,
} from "./findingWords";
import { joinAnd } from "./joinWords";
import { safeHref } from "./links";
import { fixLabel, forgeWord, grade } from "./pageVocabulary";
import { vocabTable } from "./vocab";
import { newTab, plain, type Rich } from "./rich";
import { securityRungs } from "./securityBlock";

export const JUMP_TO_BRANCHES = "See Release branches";

/** The facts a reading reads beside the finding: the branch rows and whether another block says them. */
export interface SheetContext {
  readonly hasBranchRows: boolean;
  readonly higherRelease: (branch: string) => string | null;
  /** A ladder rung is the installed branch: it states the branch's fix (G35). */
  readonly installedRung: boolean;
  /** The move card links the replacement the finding names (G19, G75). */
  readonly replacementInMove: boolean;
}

export function sheetContext(finding: Finding, metadata: RepositoryMetadata | null): SheetContext {
  const rows = metadata?.branches ?? [];
  const move = finding.next_step;
  return {
    hasBranchRows: rows.length > 0,
    higherRelease: (branch) => rows.find((r) => r.branch === branch)?.highest ?? null,
    installedRung: securityRungs(finding, metadata).some((r) => r.installed),
    replacementInMove:
      move?.kind === "replace" &&
      finding.replacement !== null &&
      safeHref(move.replacement?.url) !== null &&
      move.replacement?.package === finding.replacement,
  };
}

export interface Reading {
  readonly flag: string;
  /** "62 advisories", which links to the Security row. */
  readonly count: string | null;
  readonly text: string;
  readonly advisory: {
    readonly name: string;
    readonly title: string | null;
    readonly href: string | null;
  } | null;
  readonly after: string | null;
  readonly jump: string | null;
}

const reading = (flag: string, text: string, rest: Partial<Reading> = {}): Reading => ({
  flag,
  count: null,
  advisory: null,
  after: null,
  jump: null,
  text,
  ...rest,
});

function severityPhrase(run: Run, severity: Severity, beforeVerb: boolean): string {
  const as = countsAs(run, severity);
  if (as)
    return beforeVerb ? `an ${severity} advisory, counted as ${as},` : `an ${severity} one, counted as ${as}`;
  return beforeVerb ? `a ${severity}-severity advisory` : `a ${severity} one`;
}

const CLASS_CLAUSES = vocabTable<Record<string, string>>({
  "raise-php": ", by a release that needs a php floor raise",
  blocked: ", by a release your target does not run",
  update: "",
});

/** G35: whether the installed branch fixes the advisories; a form with fixes only when no rung says it. */
function branchFixWords(finding: Finding, n: number, rungSays: boolean): string | null {
  const fixes = isSecurityVulnerable(finding.security) ? finding.security.installed_branch_fixes : null;
  const branch = finding.branch;
  if (!fixes || branch === null) return null;
  const { fixed, unknown, of, fix_kind: kind } = fixes;
  const notKnown = unknown > 0 ? `; ${unknown} not known` : "";
  if (unknown === of) return `It is not known whether ${n === 1 ? "it is" : "they are"} fixed on ${branch}`;
  if (fixed === 0) return `${n === 1 ? "It is not" : "None is"} fixed on ${branch}${notKnown}`;
  if (rungSays) return null;
  const clause = kind === null ? "" : (CLASS_CLAUSES[kind] ?? ` (${fixLabel(kind)})`);
  if (fixed === of) return `${n === 1 ? "It is" : "All are"} fixed on ${branch}${clause}`;
  return `${fixed} of ${of} ${isAre(fixed)} fixed on ${branch}${clause}${notKnown}`;
}

function abandonedReading(finding: Finding, flag: FindingFlag, ctx: SheetContext): Reading {
  const reasons: readonly string[] = flag.degree && "reasons" in flag.degree ? flag.degree.reasons : [];
  const marking = signalData(finding, "S1");
  const bits: string[] = [];
  if (reasons.includes("marked"))
    bits.push(
      `it is marked abandoned ${marking?.marked_by === "lock" ? "in composer.lock" : "by its registry"}`,
    );
  if (reasons.includes("archived"))
    bits.push(
      `its repository is archived on ${forgeWord(finding.activity.forge ?? finding.activity.host ?? "")}`,
    );
  const suggestion = marking?.replacement ?? null;
  const tail =
    finding.replacement !== null
      ? ctx.replacementInMove
        ? ""
        : `. It names ${finding.replacement} as its replacement`
      : suggestion
        ? `. It suggests "${suggestion}", which names no package`
        : ". No replacement is named";
  return reading(flag.id, capitalize(bits.join(" and ")) + tail);
}

function leftBehindReading(finding: Finding, flag: FindingFlag, ctx: SheetContext): Reading {
  const s8 = signalData(finding, "S8");
  if (!s8) return reading(flag.id, flag.summary);
  const reached = s8.reachable_branch !== null;
  const [branch, version, years] = reached
    ? [s8.reachable_branch, s8.reachable_version, s8.reachable_years]
    : [s8.newest_branch, s8.newest_version, s8.newest_years];
  const higher = `${branch} released ${version ?? ""}${years === null ? "" : ` ${ago(years)}`}`;
  if (ctx.hasBranchRows) {
    const value = flag.headline.value;
    const own = typeof value === "number" ? value : s8.years;
    const tail =
      branch !== null && ctx.higherRelease(branch) === version ? `, behind ${branch}` : `, while ${higher}`;
    return reading(flag.id, `Its branch, ${s8.branch}, had its last release ${ago(own)}${tail}`, {
      jump: JUMP_TO_BRANCHES,
    });
  }
  const head = `Branch ${s8.branch} had its last release ${ago(s8.years)}`;
  if (reached) return reading(flag.id, `${head}, while ${higher}`);
  const php = s8.newest_php === null ? "" : ` and needs php ${s8.newest_php}`;
  return reading(
    flag.id,
    `${head}; the newest branch, ${s8.newest_branch}, released ${s8.newest_version} ${ago(s8.newest_years)}${php}`,
  );
}

function vulnerableReading(finding: Finding, flag: FindingFlag, run: Run, ctx: SheetContext): Reading {
  const score = isScoreGraded(finding.score) ? finding.score : null;
  const term = score?.terms.find(isTermSecurity);
  const deciding = advisoryRows(finding).find((row) => row.deciding);
  if (!score || !term || !deciding || !isSecurityVulnerable(finding.security))
    return reading(flag.id, flag.summary);
  const n = score.parts.security.of;
  const worst = term.severity === finding.security.worst ? "worst" : "highest-scoring";
  return reading(
    flag.id,
    n === 1
      ? `${capitalize(severityPhrase(run, term.severity, true))} affects your version`
      : ` affect your version. The ${worst} is ${severityPhrase(run, term.severity, false)}`,
    {
      count: n === 1 ? null : `${n} advisories`,
      advisory: { name: deciding.cve ?? deciding.id, title: deciding.title, href: safeHref(deciding.link) },
      after: branchFixWords(finding, n, ctx.installedRung),
    },
  );
}

/** G18 to G36: one counted flag's reading. */
function flagReading(finding: Finding, flag: FindingFlag, run: Run, ctx: SheetContext): Reading {
  const { id, summary } = flag;
  switch (flag.id) {
    case "abandoned":
      return abandonedReading(finding, flag, ctx);
    case "silent": {
      const s2 = signalData(finding, "S2");
      const s4 = signalData(finding, "S4");
      const released = s2?.years ?? finding.age.release?.years ?? null;
      const pushed = s4?.years ?? finding.age.push?.years ?? null;
      const event = s4?.event ?? finding.activity.event ?? "push";
      return reading(
        flag.id,
        `Nothing has been released for ${oneDecimal(released)} years and there has been no ${event} for ${oneDecimal(pushed)} years`,
      );
    }
    case "stale": {
      const value = typeof flag.headline.value === "number" ? flag.headline.value : null;
      const text =
        flag.headline.source === "release"
          ? `Nothing has been released for ${oneDecimal(value)} years`
          : `There has been no ${finding.activity.event ?? "push"} for ${oneDecimal(value)} years`;
      return reading(flag.id, !flag.degree.liveness_complete ? `${text} (read from releases only)` : text);
    }
    case "pinned": {
      const pin = signalData(finding, "S6");
      return reading(
        flag.id,
        pin?.reason === "branch_snapshot"
          ? `It is pinned to the branch snapshot ${pin.version}`
          : `It is installed as ${pin?.version ?? finding.version}, not a tagged release`,
      );
    }
    case "left-behind":
      return leftBehindReading(finding, flag, ctx);
    case "old-promise": {
      const s5 = signalData(finding, "S5");
      return reading(
        flag.id,
        `It was written for PHP ${s5?.written_for_php ?? ""} and admits ${s5?.target_php ?? run.target_php} untested`,
      );
    }
    case "vulnerable":
      return vulnerableReading(finding, flag, run, ctx);
    default:
      return reading(id, summary);
  }
}

/** A reading as rich text: the count link, the text, the deciding advisory, the branch clause, the jump. */
export function readingRich(r: Reading, withJump = true): Rich {
  const advisory = r.advisory;
  return [
    ...(r.count === null ? [] : [{ jump: "security" as const, text: r.count }]),
    r.text,
    ...(advisory === null
      ? []
      : [
          " (",
          advisory.href === null
            ? advisory.name
            : { href: advisory.href, text: advisory.name, name: newTab(advisory.name) },
          advisory.title === null ? ")" : `: ${advisory.title})`,
        ]),
    ...(r.after === null ? [] : [`. ${r.after}`]),
    ...(r.jump !== null && withJump ? [{ jump: "branches" as const, text: r.jump, lead: ". " }] : []),
    ".",
  ];
}

/** Under `decided_by` security the advisory reads first; else the counted flags keep `flags[]` order. */
function countedFlags(finding: Finding, score: ScoreGraded): FindingFlag[] {
  const ids = countedFlagIds(finding);
  const counted = finding.flags.filter((f) => ids.includes(f.id));
  return score.decided_by === "security"
    ? [...counted.filter((f) => f.role === "security"), ...counted.filter((f) => f.role !== "security")]
    : counted;
}

/** G6 to G13: the opening, and whether the first reading joins it. */
function opening(finding: Finding, score: ScoreGraded, run: Run): { head: string; inline: boolean } {
  const verdict = capitalize(finding.verdict);
  const m = score.parts.maintenance.alone.verdict;
  const s = score.parts.security.alone.verdict;
  const q = printedModifiers(score.modifiers).map((mod) =>
    mod.applies_to === "maintenance" ? "maintenance halved for reach" : "both halved for packages-dev",
  );
  const qualifier = q.length > 0 ? ` (${q.join("; ")})` : "";
  const flagsOf = (part: string): string =>
    joinAnd(score.terms.filter((t) => t.part === part).map((t) => t.flag));
  const named = (word: string, part: string): string => (flagsOf(part) ? `${word} (${flagsOf(part)})` : word);
  const maintenance = named("its maintenance", "maintenance");
  const advisory = named(score.parts.security.of === 1 ? "its advisory" : "its advisories", "security");
  switch (score.decided_by) {
    case "maintenance":
    case "security":
      return { head: `${verdict}:`, inline: true };
    case "combination": {
      const risks =
        m === s
          ? `two ${grade(m ?? "")} risks at once`
          : `a ${grade(m ?? "")} and a ${grade(s ?? "")} risk at once`;
      return { head: `${verdict}: ${risks}${qualifier}, ${maintenance} and ${advisory}.`, inline: false };
    }
    case "either":
      return {
        head: `${verdict} twice over: ${maintenance} alone and ${advisory} alone each make it ${finding.verdict}${qualifier}.`,
        inline: false,
      };
    default: {
      const lowest = run.graded_verdicts.at(-1) ?? "";
      const alone = (part: string, g: string | null): string =>
        g ? `${part} alone grades it ${g}` : `${part} alone counts below ${lowest}`;
      return {
        head: `${verdict} at ${score.total}: ${alone(named("maintenance", "maintenance"), m)}, ${alone(named("the advisory part", "security"), s)}.`,
        inline: false,
      };
    }
  }
}

export interface VerdictBlock {
  /** The grade word with its colon, which prints bold, then the rest of the opening. */
  readonly grade: string;
  readonly opening: string;
  /** The first reading, when it joins the verdict line (G6). */
  readonly inline: Reading | null;
  readonly readings: readonly Reading[];
}

export function verdictBlock(finding: Finding, run: Run, metadata: RepositoryMetadata | null): VerdictBlock {
  const score = isScoreGraded(finding.score) ? finding.score : null;
  if (score === null)
    return {
      grade: `${capitalize(finding.verdict)}:`,
      opening: " nothing counts.",
      inline: null,
      readings: [],
    };
  const { head, inline } = opening(finding, score, run);
  const ctx = sheetContext(finding, metadata);
  const flags = countedFlags(finding, score).map((flag) => flagReading(finding, flag, run, ctx));
  const colon = head.indexOf(":") + 1;
  const [first, ...rest] = flags;
  if (inline && first !== undefined) {
    return {
      grade: head,
      opening: " ",
      inline: first.count === null ? { ...first, text: lowerFirst(first.text) } : first,
      readings: rest,
    };
  }
  return { grade: head.slice(0, colon), opening: head.slice(colon), inline: null, readings: flags };
}

/** The verdict line's text, with its first reading under G6 and without the jump (golden `verdict_line`). */
export function verdictLineText(block: VerdictBlock): string {
  return block.grade + block.opening + (block.inline === null ? "" : plain(readingRich(block.inline, false)));
}
