/** The answer of a report-2 finding: SPEC §7.9.13's grammar, written from the finding's fields and its run. */

import { noReachableFix } from "./findingRow2";
import type {
  AlsoMove,
  Finding,
  FindingFlag,
  HeldBy,
  Move,
  Run,
  ScoreGraded,
  SecurityVulnerable,
  Severity,
  ThroughEntry,
} from "../model/report2";
import { isScoreGraded, isSecurityVulnerable, isTermSecurity } from "../model/report2";
import { pluralNoun } from "./format";
import { vocabTable } from "./vocab";
import {
  acceptsWholePackage,
  allowlistReasonWords,
  capitalize,
  checkReasonWords,
  checksMissingBody,
  checksSkippedBody,
  countsAs,
  isAre,
  lowerFirst,
  maintenanceNotJudged,
  metadataWords,
  namesCapped,
  oneDecimal,
  printedModifiers,
  rerunHalving,
  signalData,
  unjudgedChecks,
} from "./findingWords";
import { advisoryRows } from "./advisoryRows";
import { ago } from "./ago";
import { joinAnd } from "./joinWords";
import { addsBasisWord, allowlistBy, fixLabel, forgeWord, grade, phpFloorWord } from "./pageVocabulary";
import { phpConstraintWord } from "./phpAlternatives";

type AnyMove = Move | AlsoMove;

/** Moves Composer resolves to a constraint or a tag. */
const RESOLVED_KINDS: readonly string[] = ["require", "raise-php", "tag"];

const NO_MOVE_WORDS = vocabTable<Record<string, string>>({
  package_quiet: "It has no recent release to move to",
  no_higher_release: "No higher branch has released recently enough to move to",
  higher_undated: "lockrot could not date the releases of the higher branches, so it names no move",
  releases_unknown: "lockrot could not read its releases, so it names no fix",
  affected_range_unknown: "No advisory names the versions it affects, so lockrot names no fix",
  local_package: "It is installed from a local path, your own package, so lockrot names no move",
});

const BRANCH_CLASS_CLAUSES = vocabTable<Record<string, string>>({
  "raise-php": ", by a release that needs a php floor raise",
  blocked: ", by a release your target does not run",
  update: "",
});

const graded = (finding: Finding): ScoreGraded | null =>
  isScoreGraded(finding.score) ? finding.score : null;

const halvingPrinted = (finding: Finding, reason: string): boolean =>
  printedModifiers(graded(finding)?.modifiers ?? []).some((m) => m.reason === reason);

function rootsWords(run: Run): string {
  return run.include_dev
    ? "your composer.json's require or require-dev"
    : "your composer.json's require (require-dev counts only with --dev)";
}

/** The direct dependents as a later sentence names them: by pronoun when the halving sentence named them. */
function dependentsNamed(finding: Finding): string {
  if (!halvingPrinted(finding, "transitive")) return namesCapped(finding.direct_dependents);
  return pluralNoun(finding.direct_dependents.length, "that package", "them");
}

function installedPhpSentences(finding: Finding, run: Run): string[] {
  const php = finding.installed_php;
  if (php.target_runs !== false) return [];
  return [
    `Its installed release, ${finding.version}, needs php ${phpConstraintWord(php.requires ?? "")}, which your target, ` +
      `${run.target_php}, does not run: Composer will not install it there.`,
  ];
}

function branchFixSentence(finding: Finding, branch: string, n: number): string | null {
  if (!isSecurityVulnerable(finding.security)) return null;
  const fixes = finding.security.installed_branch_fixes;
  if (!fixes) return null;
  const { fixed, unknown, of, fix_kind: kind } = fixes;
  const clause = fixed > 0 && kind !== null ? (BRANCH_CLASS_CLAUSES[kind] ?? ` (${fixLabel(kind)})`) : "";
  const notKnown = unknown > 0 ? `; ${unknown} not known` : "";
  if (unknown === of) return `It is not known whether ${n === 1 ? "it is" : "they are"} fixed on ${branch}`;
  if (fixed === 0) return `${n === 1 ? "It is not" : "None is"} fixed on ${branch}${notKnown}`;
  if (fixed === of) return `${n === 1 ? "It is" : "All are"} fixed on ${branch}${clause}`;
  return `${fixed} of ${of} ${isAre(fixed)} fixed on ${branch}${clause}${notKnown}`;
}

function severityPhrase(run: Run, severity: Severity, beforeVerb: boolean): string {
  const as = countsAs(run, severity);
  if (as)
    return beforeVerb ? `an ${severity} advisory, counted as ${as},` : `an ${severity} one, counted as ${as}`;
  return beforeVerb ? `a ${severity}-severity advisory` : `a ${severity} one`;
}

function vulnerableSentence(finding: Finding, run: Run): string {
  const score = graded(finding);
  const term = score?.terms.find(isTermSecurity);
  const deciding = advisoryRows(finding).find((row) => row.deciding);
  if (!score || !term || !deciding || !isSecurityVulnerable(finding.security)) return "";
  const security = finding.security;
  const name = deciding.cve ?? deciding.id;
  const named = deciding.title === null ? name : `${name}: ${deciding.title}`;
  const n = score.parts.security.of;
  let text =
    n === 1
      ? `${capitalize(severityPhrase(run, term.severity, true))} affects your version (${named})`
      : `${n} advisories affect your version; the ${term.severity === security.worst ? "worst" : "highest-scoring"} ` +
        `is ${severityPhrase(run, term.severity, false)} (${named})`;
  const branchFix = finding.branch === null ? null : branchFixSentence(finding, finding.branch, n);
  if (branchFix) text += `. ${branchFix}`;
  const noFix = noReachableFix(finding, run);
  if (noFix !== null) text += `; ${noFix}`;
  const ignored = security.ignored_count;
  if (ignored > 0) text += `; ${ignored} more ${isAre(ignored)} ignored by Composer's audit policy`;
  if (!finding.from_composer_repository && finding.origin.local) {
    text +=
      ". It is installed from a local path (your own code); the advisory is published for the package of this name, " +
      "so check the version your path holds";
  } else if (!finding.from_composer_repository && finding.origin.kind === "vcs") {
    text += ". It is installed from vcs; the advisory is published for the package of this name";
  }
  return text;
}

function abandonedSentence(finding: Finding, flag: FindingFlag): string {
  const reasons: readonly string[] = flag.degree && "reasons" in flag.degree ? flag.degree.reasons : [];
  const marking = signalData(finding, "S1");
  const archive = signalData(finding, "S3");
  const bits: string[] = [];
  if (reasons.includes("marked")) {
    bits.push(
      `it is marked abandoned ${marking?.marked_by === "lock" ? "in composer.lock" : "by its registry"}`,
    );
  }
  if (reasons.includes("archived"))
    bits.push(`its repository is archived on ${forgeWord(archive?.forge ?? archive?.host ?? "")}`);
  const suggestion = marking?.replacement ?? null;
  const tail =
    finding.replacement !== null
      ? `; it names ${finding.replacement} as its replacement`
      : suggestion
        ? `; it suggests "${suggestion}", which names no package`
        : "; no replacement is named";
  return capitalize(bits.join(" and ")) + tail;
}

function factSentence(finding: Finding, flag: FindingFlag, run: Run): string {
  switch (flag.id) {
    case "abandoned":
      return abandonedSentence(finding, flag);
    case "silent": {
      const release = signalData(finding, "S2");
      const push = signalData(finding, "S4");
      return (
        `Nothing has been released for ${oneDecimal(release?.years ?? null)} years and there has been no ` +
        `${push?.event ?? "push"} for ${oneDecimal(push?.years ?? null)} years`
      );
    }
    case "stale": {
      const value = typeof flag.headline.value === "number" ? flag.headline.value : null;
      const text =
        flag.headline.source === "release"
          ? `Nothing has been released for ${oneDecimal(value)} years`
          : `There has been no ${signalData(finding, "S4")?.event ?? "push"} for ${oneDecimal(value)} years`;
      return flag.degree.liveness_complete ? text : `${text} (read from releases only)`;
    }
    case "pinned": {
      const pin = signalData(finding, "S6");
      return pin?.reason === "branch_snapshot"
        ? `It is pinned to the branch snapshot ${pin.version}`
        : `It is installed as ${pin?.version ?? finding.version}, not a tagged release`;
    }
    case "left-behind": {
      const s8 = signalData(finding, "S8");
      if (!s8) return "";
      const text = `Branch ${s8.branch} had its last release ${ago(s8.years)}`;
      if (s8.reachable_branch !== null) {
        return `${text}, while ${s8.reachable_branch} released ${s8.reachable_version ?? ""} ${s8.reachable_years === null ? "" : ago(s8.reachable_years)}`;
      }
      return (
        `${text}; the newest branch, ${s8.newest_branch}, released ${s8.newest_version} ${ago(s8.newest_years)} ` +
        `and needs php ${s8.newest_php ?? ""}`
      );
    }
    case "old-promise": {
      const s5 = signalData(finding, "S5");
      return `It was written for PHP ${s5?.written_for_php ?? ""} and admits ${s5?.target_php ?? run.target_php} untested`;
    }
    case "vulnerable":
      return vulnerableSentence(finding, run);
    default:
      return (flag as FindingFlag).summary;
  }
}

function factsPhrase(finding: Finding, move: AnyMove): string {
  const flags = move.clears.filter((c) => c.kind === "flag").map((c) => c.id);
  const cleared = move.clears.filter((c) => c.kind === "advisory").length;
  const all = advisoryRows(finding).length;
  if (move.clears_all && all <= 1 && move.clears.length === 2) return "both";
  if (move.clears_all && all <= 1 && move.clears.length === 3) return "all three";
  const advisories =
    all === 1
      ? "the advisory"
      : cleared === all && all === 2
        ? "both advisories"
        : cleared === all
          ? `all ${cleared} advisories`
          : `${cleared} of its ${all} advisories`;
  const items = cleared > 0 ? [...flags, advisories] : flags;
  return items.length > 0 ? joinAnd(items) : "nothing";
}

/** "; {leaves} stay(s)" and "; not checked: {ids}", once, at the end of a move that names a release. */
function moveTail(move: AnyMove): string {
  let tail = "";
  if (move.leaves.length > 0) {
    const flags = move.leaves.filter((l) => l.kind === "flag").map((l) => l.id);
    const advisories = move.leaves.length - flags.length;
    const items =
      advisories > 0
        ? [...flags, `${advisories} ${pluralNoun(advisories, "advisory", "advisories")}`]
        : flags;
    tail += `; ${items.join(", ")} ${items.length === 1 && advisories <= 1 ? "stays" : "stay"}`;
  }
  if (move.unverified.length > 0) tail += `; not checked: ${move.unverified.map((u) => u.id).join(", ")}`;
  return tail;
}

function phpClause(move: AnyMove, run: Run): string {
  const php = move.php_check;
  if (!php?.requires) return "";
  let clause = `; ${move.to_branch ?? ""} needs php ${phpConstraintWord(php.requires)}`;
  if (php.project_allows === true) clause += ", which your require.php allows";
  if (php.project_allows === false) {
    clause += `, and your require.php still allows ${phpFloorWord(run.project_php_lowest) ?? ""} (a ${php.raise_size ?? ""} raise)`;
  }
  if (php.target_runs === true) clause += `, and your target, ${run.target_php}, runs it`;
  return clause;
}

function addsClause(move: AnyMove): string {
  const byBasis = new Map<string, string[]>();
  for (const added of move.adds) byBasis.set(added.basis, [...(byBasis.get(added.basis) ?? []), added.id]);
  return [...byBasis]
    .map(([basis, ids]) => `; ${addsBasisWord(basis)}, so ${ids.join(" and ")} would count`)
    .join("");
}

function requireSentence(finding: Finding, move: AnyMove, run: Run): string {
  const raise =
    move.kind === "raise-php" ? `Raise require.php to ${move.php_check?.raise_to ?? ""}, then ` : "";
  const head = finding.direct
    ? `${raise}require ${move.constraint ?? ""}`
    : `${raise}move it to ${move.constraint ?? ""}` +
      (finding.direct_dependents.length > 0 ? ` through ${dependentsNamed(finding)}` : "");
  return `${capitalize(head)}: it clears ${factsPhrase(finding, move)}${phpClause(move, run)}${moveTail(move)}`;
}

function tagSentence(finding: Finding, move: AnyMove, run: Run): string {
  const latest = move.latest?.version ?? "";
  const what =
    move.crosses_major === false ? `the newest tag on its own line, ${latest}` : `its newest tag, ${latest}`;
  let text = finding.direct
    ? `Require ${what}`
    : `Move it to ${what}` +
      (finding.direct_dependents.length > 0 ? `, through ${dependentsNamed(finding)}` : "");
  if (move.latest?.relation === "older")
    text += "; that tag is older than your snapshot: review it first, or replace the package";
  return text + phpClause(move, run) + addsClause(move) + moveTail(move);
}

function blockedSentence(finding: Finding, move: AnyMove, run: Run): string {
  const requires = move.php_check?.requires ?? null;
  if (move.source === "pinned") {
    const latest = move.latest?.version ?? "";
    const installed = finding.installed_php;
    const nor =
      installed.target_runs === false
        ? `, nor does the version you have (${finding.version}, php ${phpConstraintWord(installed.requires ?? "")})`
        : "";
    return requires
      ? `Its newest tag, ${latest}, needs php ${phpConstraintWord(requires)}, which your target, ${run.target_php}, does not run${nor}: replace it`
      : `Its newest tag, ${latest}, does not run on your target, ${run.target_php}${nor}: replace it`;
  }
  const branch = move.to_branch ?? "";
  return requires
    ? `${branch} fixes it but needs php ${phpConstraintWord(requires)}, which your target, ${run.target_php}, does not run`
    : `${branch} fixes it, but your target, ${run.target_php}, does not run it`;
}

function replaceSentence(move: AnyMove): string {
  const replacement = move.replacement;
  if (!replacement?.package) return "Find a replacement: the suggestion names no package to require";
  const graded = replacement.finding;
  return (
    `Replace it with ${replacement.package}` +
    (graded ? `, itself ${graded.verdict} (${graded.flag_ids.join(" · ")}) in this lock` : "")
  );
}

/** lockrot's own MoveText, for a kind or a reason this grammar does not know. */
function unknownMoveSentence(move: AnyMove): string {
  const text = move.text.trim().replace(/\.$/, "");
  if (text) return `Next step: ${text}`;
  return `Next step: ${move.kind}${move.reason ? ` (${move.reason})` : ""}`;
}

function moveSentence(finding: Finding, move: AnyMove, run: Run): string {
  const latest = move.latest;
  const sentence = ((): string => {
    switch (move.kind) {
      case "update":
        return (
          `\`composer update ${finding.package}\` installs ${move.newest ?? ""}, ` +
          `which clears ${factsPhrase(finding, move)}${moveTail(move)}`
        );
      case "require":
      case "raise-php":
        return requireSentence(finding, move, run);
      case "replace":
        return replaceSentence(move);
      case "find-alternative":
        return move.source === "abandoned"
          ? "Find a replacement; none is named"
          : "Find a maintained alternative";
      case "tag":
        return tagSentence(finding, move, run);
      case "blocked":
        return blockedSentence(finding, move, run);
      case "test":
        return latest?.is_installed
          ? `${latest.version} is its newest release: test it on PHP ${run.target_php}, or replace it`
          : `Test it on PHP ${run.target_php}`;
      case "no-tag":
        return "It has no tagged release to move to: review the snapshot, or replace it";
      case "no-fix":
        return "No release fixes it";
      case "no-single-fix":
        return "No single release fixes every advisory; see each advisory's fix";
      case "no-move":
        if (move.reason === "metadata_not_read") {
          return (
            `lockrot did not read its releases (${metadataWords(finding)}), so it names no move` +
            (move.source === "pinned" ? ": review the snapshot" : "")
          );
        }
        return (move.reason !== null && NO_MOVE_WORDS[move.reason]) || unknownMoveSentence(move);
      default:
        return unknownMoveSentence(move);
    }
  })();
  return `${sentence}.`;
}

/** What a partial update clears, judged as an `update` move: "left-behind, old-promise and 1 of its 2 advisories". */
function partialFacts(finding: Finding, partial: NonNullable<SecurityVulnerable["partial"]>): string {
  const of = graded(finding)?.parts.security.of ?? 0;
  const flags = partial.clears.filter((c) => c.kind === "flag").map((c) => c.id);
  const advisories = partial.clears.filter((c) => c.kind === "advisory").length;
  return joinAnd([...flags, `${advisories} of its ${of} advisories`]);
}

function holderWords(heldBy: HeldBy): string {
  if (heldBy.source === "root") return `your composer.json (requires ${heldBy.constraint})`;
  const holder = heldBy.holder;
  const itself = !holder
    ? ""
    : holder.lead
      ? ` (itself ${holder.lead})`
      : holder.flag_ids.length > 0
        ? ` (itself ${holder.verdict}: ${holder.flag_ids.join(" · ")})`
        : ` (itself ${holder.verdict})`;
  return `${heldBy.package ?? ""} ${heldBy.version ?? ""}${itself}`;
}

function holdersSentences(moves: readonly AnyMove[]): string[] {
  return moves.flatMap((move, i) => {
    if (move.held_by.length === 0) return [];
    const who =
      i === 0
        ? "It is held by "
        : `The move to ${move.constraint ?? move.to_branch ?? move.kind} is held by `;
    return [`${who}${move.held_by.map(holderWords).join(" and ")}.`];
  });
}

function throughNames(entries: readonly ThroughEntry[]): string {
  const names = entries.map((e) => `${e.package} (${e.newest_stable?.version ?? ""})`);
  return names.length > 3 ? namesCapped(names) : joinAnd(names);
}

/** C08: the dependents whose newest release no longer requires the package, else the ones that still do. */
function throughSentence(through: readonly ThroughEntry[] | undefined): string {
  const gone = (through ?? []).filter((e) => e.newest_requires === false);
  const kept = (through ?? []).filter((e) => e.newest_requires === true);
  const [entries, verbOne, verbMany] =
    gone.length > 0
      ? [gone, "no longer requires", "no longer require"]
      : [kept, "still requires", "still require"];
  if (entries.length === 0) return "";
  return entries.length === 1
    ? ` The newest release of ${throughNames(entries)} ${verbOne} it.`
    : ` The newest releases of ${throughNames(entries)} ${verbMany} it.`;
}

function notYoursSentence(finding: Finding): string {
  const n = finding.direct_dependents.length;
  if (halvingPrinted(finding, "transitive")) {
    return `You do not require it yourself, so replace or update ${pluralNoun(n, "the package it comes in through", "the packages it comes in through")}.`;
  }
  return (
    `You do not require it yourself: it comes in through ${namesCapped(finding.direct_dependents)}, ` +
    `so replace or update ${pluralNoun(n, "that package", "those packages")}.`
  );
}

function unreachedSentence(finding: Finding, move: AnyMove, run: Run): string {
  const said = halvingPrinted(finding, "unreached");
  const why = `\`composer why ${finding.package}\` names what requires it`;
  const resolved = RESOLVED_KINDS.includes(move.kind);
  if (finding.depth_unmeasured === "no_composer_json" && !said) {
    return resolved
      ? `The run read no composer.json, so what requires it must allow it (${why}).`
      : `The run read no composer.json: ${why}.`;
  }
  if (resolved) {
    return said
      ? `What requires it must allow it (${why}).`
      : `lockrot found no path from ${rootsWords(run)} to it, so what requires it must allow it (${why}).`;
  }
  return said ? `${capitalize(why)}.` : `lockrot found no path from ${rootsWords(run)} to it: ${why}.`;
}

function composerSentence(finding: Finding, reason: string, move: AnyMove, run: Run): string | null {
  switch (reason) {
    case "holders":
      return "The packages that hold it may need to move too.";
    case "crosses_major":
      return (
        ((move.to_branch ?? "").startsWith("0.")
          ? "A new 0.x line (Composer treats 0.x minors as breaking)"
          : "A new major") + " brings its own requirements, which lockrot does not solve."
      );
    case "transitive":
      return (
        (RESOLVED_KINDS.includes(move.kind) ? "What requires it must allow it." : notYoursSentence(finding)) +
        throughSentence("through" in move ? move.through : undefined)
      );
    case "unreached":
      return unreachedSentence(finding, move, run);
    default:
      return null;
  }
}

function composerSentences(finding: Finding, moves: readonly AnyMove[], run: Run): string[] {
  const seen = new Map<string, AnyMove>();
  for (const move of moves)
    for (const reason of move.composer_moves_because) if (!seen.has(reason)) seen.set(reason, move);
  return [...seen].flatMap(([reason, move]) => composerSentence(finding, reason, move, run) ?? []);
}

function acceptedSentences(finding: Finding): string[] {
  const by = allowlistBy(finding.allowlist?.by ?? "");
  return finding.score.accepted.map(({ flag, if_counted: counted }) => {
    const atLeast = counted.at_least ? "at least " : "";
    return `Counting the ${flag} flag, which ${by} accepts, would make this ${atLeast}${counted.total}, ${counted.verdict}${rerunHalving(counted.modifiers)}.`;
  });
}

function checksSentence(finding: Finding, run: Run): string[] {
  const body = checksMissingBody(finding, run);
  return body ? [`Not every check ran: ${body}.`] : [];
}

function zeroAnswer(finding: Finding, run: Run): string {
  let first = `${capitalize(finding.verdict)}: nothing counts`;
  if (finding.verdict === "unknown") {
    const { names, count } = unjudgedChecks(finding);
    first += `, but lockrot could read no release metadata (${metadataWords(finding)}), so its ${names} ${isAre(count)} not judged`;
  }
  const allowlist = finding.allowlist;
  if (allowlist && acceptsWholePackage(finding)) {
    first += `; its maintenance is accepted by ${allowlistBy(allowlist.by)} (${allowlistReasonWords(allowlist)})`;
  } else if (allowlist?.flag_ids) {
    first += `; ${allowlist.flag_ids.join(" and ")} ${isAre(allowlist.flag_ids.length)} accepted (${allowlistReasonWords(allowlist)})`;
  }
  const security = finding.security;
  const s9Blocked =
    finding.checks_missing.some((c) => c.blocks.includes("S9")) ||
    finding.unchecked_accepted.some((u) => u.check === "advisories");
  if (security.status === "unchecked" && !s9Blocked) {
    first += `; its advisories were not looked up (${checkReasonWords(finding, security.unchecked_reason)})`;
  }
  const ignored = security.ignored_count;
  if (ignored > 0) {
    first += `; ${ignored} ${pluralNoun(ignored, "advisory is", "advisories are")} ignored by Composer's audit policy`;
  }
  const accepted = checksSkippedBody(finding, { acceptedOnly: true });
  return [
    `${first}.`,
    ...installedPhpSentences(finding, run),
    ...acceptedSentences(finding),
    ...checksSentence(finding, run),
    ...(accepted ? [`lockrot did not check ${accepted}.`] : []),
  ].join(" ");
}

function opening(finding: Finding, score: ScoreGraded, run: Run): string {
  const verdict = finding.verdict;
  const maintenance = score.parts.maintenance.alone.verdict;
  const security = score.parts.security.alone.verdict;
  const qualifiers = printedModifiers(score.modifiers).map((m) =>
    m.applies_to === "maintenance" ? "maintenance halved for reach" : "both halved for packages-dev",
  );
  const q = qualifiers.length > 0 ? ` (${qualifiers.join("; ")})` : "";
  switch (score.decided_by) {
    case "combination":
      return maintenance === security
        ? `${capitalize(verdict)}: two ${grade(maintenance ?? "")} risks at once${q}.`
        : `${capitalize(verdict)}: a ${grade(maintenance ?? "")} and a ${grade(security ?? "")} risk at once${q}.`;
    case "either": {
      const advisory = score.parts.security.of === 1 ? "advisory" : "advisories";
      return `${capitalize(verdict)} twice over: its maintenance alone and its ${advisory} alone each make it ${verdict}${q}.`;
    }
    case "maintenance":
    case "security":
      return `${capitalize(verdict)}:`;
    default: {
      const lowest = run.graded_verdicts[run.graded_verdicts.length - 1] ?? "";
      const alone = (part: string, grade: string | null): string =>
        grade ? `${part} alone grades it ${grade}` : `${part} alone counts below ${lowest}`;
      return `${capitalize(verdict)} at ${score.total}: ${alone("maintenance", maintenance)}, ${alone("the advisory part", security)}.`;
    }
  }
}

function factSentences(finding: Finding, score: ScoreGraded, run: Run): string[] {
  const counted = finding.flags.filter((flag) => score.terms.some((t) => t.flag === flag.id));
  const securityFirst = score.decided_by === "security";
  const order = securityFirst
    ? [...counted.filter((f) => f.role === "security"), ...counted.filter((f) => f.role !== "security")]
    : counted;
  return order.map((flag, i) => {
    const sentence = factSentence(finding, flag, run);
    const also = flag.role === "corroborating" || (securityFirst && flag.role === "lead");
    return `${also && i > 0 ? `Also: ${lowerFirst(sentence)}` : sentence}.`;
  });
}

function halvingSentence(
  finding: Finding,
  reason: string,
  appliesTo: string,
  divideBy: number,
  run: Run,
): string {
  switch (reason) {
    case "transitive":
      return finding.named_in.length === 1 && finding.named_in[0] === "require-dev" && !run.include_dev
        ? "It is required directly only in require-dev, which this run did not walk; in production it comes in through " +
            `${namesCapped(finding.direct_dependents)}, so its maintenance counts half.`
        : `It is not required directly (through ${namesCapped(finding.direct_dependents)}), so its maintenance counts half.`;
    case "unreached":
      return finding.depth_unmeasured === "no_composer_json"
        ? "The run read no composer.json, so lockrot found no path to it and its maintenance counts half."
        : `lockrot found no path from ${rootsWords(run)} to it, so its maintenance counts half.`;
    case "dev":
      return "It is in packages-dev, so its whole score counts half.";
    default:
      return `${appliesTo === "maintenance" ? "Its maintenance" : "Its whole score"} is divided by ${divideBy} (${reason}).`;
  }
}

function gradedAnswer(finding: Finding, score: ScoreGraded, run: Run): string {
  const move = finding.next_step;
  const moves: AnyMove[] = move ? [move, ...move.also] : [];
  const notJudged = maintenanceNotJudged(finding);
  const installedPhp =
    move?.kind === "blocked" && move.source === "pinned" ? [] : installedPhpSentences(finding, run);
  const skipped = checksSkippedBody(finding, {
    metadataSaid: notJudged || move?.reason === "metadata_not_read",
  });
  const partial = isSecurityVulnerable(finding.security) ? finding.security.partial : null;
  const allowlist = finding.allowlist;
  const sentences = [
    opening(finding, score, run),
    ...factSentences(finding, score, run),
    ...installedPhp,
    ...(notJudged
      ? [
          `Its ${unjudgedChecks(finding).names} ${isAre(unjudgedChecks(finding).count)} not judged: ` +
            `lockrot could read no release metadata (${metadataWords(finding)}).`,
        ]
      : []),
    ...printedModifiers(score.modifiers).map((m) =>
      halvingSentence(finding, m.reason, m.applies_to, m.divide_by, run),
    ),
    ...checksSentence(finding, run),
    ...(skipped ? [`lockrot did not check ${skipped}.`] : []),
    ...moves.map((m, i) => (i === 0 ? "" : "Then: ") + moveSentence(finding, m, run)),
    ...(partial
      ? [
          `Meanwhile, \`composer update ${finding.package}\` installs ${partial.version}, which clears ${partialFacts(finding, partial)} ` +
            `(${partial.if_applied.at_most ? "at most " : ""}${partial.if_applied.total}, ${partial.if_applied.verdict} after it` +
            (partial.if_applied.assumes.includes("no_new_advisories")
              ? ", if that release carries no new advisory"
              : "") +
            (partial.unverified.length > 0
              ? `; not checked: ${partial.unverified.map((u) => u.id).join(", ")}`
              : "") +
            ").",
        ]
      : []),
    ...holdersSentences(moves),
    ...composerSentences(finding, moves, run),
    ...(allowlist && acceptsWholePackage(finding)
      ? [`Its maintenance is accepted by ${allowlistBy(allowlist.by)}: ${allowlistReasonWords(allowlist)}.`]
      : []),
    ...acceptedSentences(finding),
  ];
  const [first = "", second = "", ...rest] = sentences;
  return (first.endsWith(":") ? [`${first} ${lowerFirst(second)}`, ...rest] : sentences).join(" ");
}

/** The answer sentences of a finding (SPEC §7.9.13): its grade, why, and the move that clears it. */
export function answerText(finding: Finding, run: Run): string {
  const score = graded(finding);
  return score ? gradedAnswer(finding, score, run) : zeroAnswer(finding, run);
}
