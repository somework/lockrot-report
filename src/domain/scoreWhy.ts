/** The "Why <verdict>" lines of a report-2 finding (SPEC §7.9.8), written from its fields and its run. */

import type {
  Finding,
  Report2,
  Run,
  ScoreGraded,
  TermMaintenance,
  TermSecurity,
  WithoutRow,
} from "../model/report2";
import { isScoreGraded, isSecurityVulnerable, isTermSecurity } from "../model/report2";
import { day, pluralNoun } from "./format";
import { vocabTable } from "./vocab";
import {
  advisoryName,
  advisoryRows,
  allowlistByShort,
  checksMissingBody,
  checksSkippedBody,
  countsAs,
  fixLabel,
  maintenanceNotJudged,
  metadataWords,
  namesCapped,
  partialClears,
  printedModifiers,
  rerunHalving,
  ruleWhyWords,
  shareGlyph,
  unjudgedChecks,
} from "./findingWords";

const DEV_WORD = vocabTable<Record<string, string>>({ dev: "packages-dev" });

type WhyReport = Pick<Report2, "run" | "generated_at">;

function notJudgedLine(finding: Finding): string {
  return `not judged: ${unjudgedChecks(finding).names} (no release metadata: ${metadataWords(finding)})`;
}

function acceptedLines(finding: Finding): string[] {
  const by = allowlistByShort(finding.allowlist?.by ?? "");
  return finding.score.accepted.map(({ flag, if_counted: counted }) => {
    const atLeast = counted.at_least ? "at least " : "";
    return `${flag} accepted by ${by}: counting it would make this ${atLeast}${counted.total}, ${counted.verdict}${rerunHalving(counted.modifiers)}`;
  });
}

function checksMissingLines(finding: Finding, run: Run): string[] {
  const body = checksMissingBody(finding, run);
  return body ? [`checks missing: ${body}`] : [];
}

function checksSkippedLines(
  finding: Finding,
  options: { metadataSaid?: boolean; acceptedOnly?: boolean },
): string[] {
  const body = checksSkippedBody(finding, options);
  return body ? [`checks not run: ${body}`] : [];
}

function abandonedMarkingLines(finding: Finding): string[] {
  const ignored = finding.abandoned_ignored;
  if (!ignored) return [];
  const reasons = ignored.rules.flatMap((r) => r.reason ?? []).join("; ");
  const constraints = [...new Set(ignored.rules.flatMap((r) => r.constraints))].sort();
  return [
    `abandoned marking ignored (${ignored.by}: ${ignored.rules.map((r) => r.pattern).join(", ")})` +
      (reasons ? `: ${reasons}` : "") +
      (constraints.length > 0
        ? ` (constraint ${constraints.join(", ")} not applied, as composer audit does not apply it)`
        : ""),
  ];
}

function header(finding: Finding, score: ScoreGraded | null, report: WhyReport): string {
  const asOf = ` · ages as of ${day(report.generated_at)}`;
  if (!score) return `0 · ${finding.verdict}${asOf}`;
  const { floor, next, to_next: toNext } = score.band;
  const short =
    next && toNext !== null ? ` · ${toNext} ${pluralNoun(toNext, "point", "points")} short of ${next}` : "";
  return `${score.total} · ${finding.verdict} from ${floor}${short}${asOf}`;
}

function maintenanceTermLine(finding: Finding, term: TermMaintenance, run: Run): string {
  if (term.role === "lead")
    return `${term.flag} ${term.points} leads: the strongest maintenance fact counts in full`;
  const rule = run.score_model.rules.find((r) => r.id === "corroborating-share");
  const glyph = rule?.share ? shareGlyph(rule.share) : "";
  return `${term.flag} ${term.points}: ${glyph} of ${term.weight}, beside ${finding.lead ?? ""} (${ruleWhyWords(rule?.why ?? "")})`;
}

function securityTermLine(finding: Finding, score: ScoreGraded, term: TermSecurity, run: Run): string {
  const of = score.parts.security.of;
  const tied = score.parts.security.tied;
  const worst = isSecurityVulnerable(finding.security) ? finding.security.worst : null;
  const as = countsAs(run, term.severity);
  let line = `vulnerable ${term.points}: ${term.severity} advisory ${advisoryName(finding, term.advisory)}`;
  if (as) line += ` (counted as ${as})`;
  if (of > 1) line += `, ${term.severity === worst ? "the worst" : "the highest-scoring"} of ${of}`;
  if (tied.length > 0) line += ` (tied with ${namesCapped(tied.map((id) => advisoryName(finding, id)))})`;
  const doubles = run.score_model.fix_kinds.find((k) => k.id === term.fix_kind)?.doubles ?? false;
  if (term.multiplier === 2) {
    line += `; × 2: ${term.fix_kind === "none" ? "no release fixes it" : `no fixing release runs on PHP ${run.target_php}`}`;
  } else if (!doubles && term.fix_kind === "unknown") {
    line += "; its fix is unknown: no × 2";
  } else if (!doubles) {
    const branch = advisoryRows(finding).find((row) => row.id === term.advisory)?.fix.to_branch ?? null;
    line += `; its own fix (${fixLabel(term.fix_kind)}${branch ? ` on ${branch}` : ""}) is reachable: no × 2`;
  }
  return line;
}

function modifierLines(finding: Finding, score: ScoreGraded): string[] {
  const lines = score.modifiers.map((m) => {
    if (m.applies_to !== "maintenance") {
      return `${DEV_WORD[m.reason] ?? m.reason}: total ${m.before} ÷ ${m.divide_by} = ${m.after}`;
    }
    return m.before !== m.after
      ? `${m.reason}: maintenance ${m.before} ÷ ${m.divide_by} = ${m.after}`
      : `${m.reason}: no maintenance to halve; security is never halved for reach`;
  });
  const direct =
    !score.modifiers.some((m) => m.applies_to === "maintenance") &&
    finding.reach === "direct" &&
    score.parts.maintenance.status === "counted";
  return direct ? [...lines, "direct requirement: maintenance not halved for reach"] : lines;
}

function openingLine(finding: Finding, score: ScoreGraded, run: Run): string {
  const verdict = finding.verdict;
  const of = score.parts.security.of;
  const maintenanceTerms = score.terms.filter((t) => t.part === "maintenance").length;
  const corroborating = score.terms.filter((t) => t.role === "corroborating").length;
  const reach = printedModifiers(score.modifiers).some((m) => m.applies_to === "maintenance");
  const dev = score.modifiers.some((m) => m.reason === "dev");
  const lead = finding.lead ?? "";
  const clauses = [
    lead,
    ...(corroborating > 0 ? [`${corroborating} corroborating`] : []),
    ...(reach ? ["halved for reach"] : []),
    ...(dev ? ["halved: packages-dev"] : []),
  ];
  const whoMaintenance =
    maintenanceTerms === 0
      ? "maintenance alone grades it"
      : maintenanceTerms === 1 && !reach && !dev
        ? `${lead} alone grades it`
        : `maintenance (${clauses.join(", ")}) alone grades it`;
  const whoSecurity = (of === 1 ? "the advisory" : "the advisories") + (dev ? " (halved: packages-dev)" : "");
  const lowest = run.graded_verdicts[run.graded_verdicts.length - 1] ?? "";
  const maintenance = score.parts.maintenance.alone.verdict;
  const security = score.parts.security.alone.verdict;
  const combination = (m: string, s: string): string =>
    `${whoMaintenance} ${m}, ${whoSecurity} alone ${pluralNoun(of, "grades", "grade")} it ${s}: together ${verdict}`;
  switch (score.decided_by) {
    case "combination":
      return combination(maintenance ?? "", security ?? "");
    case "maintenance":
      return `maintenance alone makes it ${verdict}`;
    case "security":
      return `${whoSecurity} alone ${pluralNoun(of, "makes", "make")} it ${verdict}`;
    case "either":
      return `${verdict} twice over: each part alone makes it ${verdict}`;
    default:
      return combination(maintenance ?? `below ${lowest}`, security ?? `below ${lowest}`);
  }
}

function withoutRow(finding: Finding, score: ScoreGraded, row: WithoutRow): string {
  const of = score.parts.security.of;
  const tied = score.parts.security.tied.length > 0;
  const { kind, id } = row.remove;
  const name =
    kind === "advisory"
      ? advisoryName(finding, id)
      : id === "vulnerable"
        ? of === 1
          ? "the advisory"
          : "the advisories"
        : id;
  let text = `without ${name}: ${row.at_least ? "at least " : ""}${row.total}, ${row.verdict}`;
  if (kind === "advisory" && tied && row.total === score.total) text += " (tied: the others weigh the same)";
  const [revealed] = row.revealed;
  if (revealed) text += ` (${revealed.flag} would show${revealed.role === "accepted" ? ", accepted" : ""})`;
  else if (row.lead && row.lead !== finding.lead) text += ` (${row.lead} would lead)`;
  return text;
}

function afterMoveLines(finding: Finding, score: ScoreGraded): string[] {
  const move = finding.next_step;
  const applied = move?.if_applied;
  if (!move || !applied) return [];
  const counted = new Set<string>(score.terms.map((t) => t.flag));
  const noNewAdvisories = applied.assumes.includes("no_new_advisories");
  const conditions = [
    ...(move.adds.length > 0 ? [`adds ${move.adds.map((a) => a.id).join(" and ")}`] : []),
    ...move.unverified
      .filter((u) => u.kind === "flag" && !counted.has(u.id))
      .map((u) => `${u.id} not checked`),
    ...(applied.assumes.includes("composer_resolves") ? ["if Composer resolves it"] : []),
    ...(noNewAdvisories ? ["advisories on its new versions not checked"] : []),
  ];
  const bound = applied.at_most
    ? noNewAdvisories
      ? "at most, from the facts it checked, "
      : "at most "
    : "";
  return [
    `after the move: ${bound}${applied.total}, ${applied.verdict}` +
      (conditions.length > 0 ? ` (${conditions.join("; ")})` : ""),
  ];
}

function partialLines(finding: Finding): string[] {
  const partial = isSecurityVulnerable(finding.security) ? finding.security.partial : null;
  if (!partial) return [];
  const applied = partial.if_applied;
  return [
    `composer update alone: ${applied.at_most ? "at most " : ""}${applied.total}, ${applied.verdict} ` +
      `(it clears ${partialClears(finding, partial)}` +
      (partial.unverified.length > 0
        ? `; not checked: ${partial.unverified.map((u) => u.id).join(", ")}`
        : "") +
      (applied.assumes.includes("no_new_advisories") ? "; advisories on that release not checked" : "") +
      ")",
  ];
}

function gradedLines(finding: Finding, score: ScoreGraded, report: WhyReport): string[] {
  const run = report.run;
  const notJudged = maintenanceNotJudged(finding);
  const counterfactuals = score.without.map((row) => withoutRow(finding, score, row));
  return [
    header(finding, score, report),
    ...(score.rounded_down ? [`${score.exact}, rounded down to ${score.total}`] : []),
    ...score.terms.map((t) =>
      isTermSecurity(t) ? securityTermLine(finding, score, t, run) : maintenanceTermLine(finding, t, run),
    ),
    ...modifierLines(finding, score),
    ...(notJudged ? [notJudgedLine(finding)] : []),
    openingLine(finding, score, run),
    ...(counterfactuals.length > 0 ? [counterfactuals.join(" · ")] : []),
    ...afterMoveLines(finding, score),
    ...partialLines(finding),
    ...checksMissingLines(finding, run),
    ...checksSkippedLines(finding, { metadataSaid: notJudged }),
    ...acceptedLines(finding),
    ...abandonedMarkingLines(finding),
  ];
}

function zeroLines(finding: Finding, report: WhyReport): string[] {
  return [
    header(finding, null, report),
    ...(finding.verdict === "unknown" ? [notJudgedLine(finding)] : []),
    ...acceptedLines(finding),
    ...checksMissingLines(finding, report.run),
    ...checksSkippedLines(finding, { acceptedOnly: true }),
    ...abandonedMarkingLines(finding),
  ];
}

/** The lines of the "Why <verdict>" block (SPEC §7.9.8), header first; the bar and its ruler are drawn apart. */
export function whyLines(finding: Finding, report: WhyReport): string[] {
  return isScoreGraded(finding.score)
    ? gradedLines(finding, finding.score, report)
    : zeroLines(finding, report);
}
