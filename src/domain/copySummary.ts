/**
 * The copy summary (SPEC §7.9.15) as lines of text, written from the root fields of a report-2.
 * What it counts, `packages_flagged` and the rest, lockrot has already counted.
 */

import type { Report2 } from "../model/report";
import { day, fixed, plural } from "./format";
import { gateFact, gateHeadline, gateHeadlineLine } from "./gate";
import { fixLabel } from "./pageVocabulary";
import { sharePhrase } from "./summary";

const DOT = " · ";

/** `a`, `all n a`, `all n b` or `a, b` for two counts that make the total. */
function split(total: number, a: number, aWord: string, bWord: string, numbered = false): string {
  const b = total - a;
  if (total === 1) return `${numbered ? "1 " : ""}${a === 1 ? aWord : bWord}`;
  if (b === 0) return `all ${total} ${aWord}`;
  if (a === 0) return `all ${total} ${bWord}`;
  return `${a} ${aWord}, ${b} ${bWord}`;
}

/** The header's facts, the gate in the header's own words last: its fact, else its "no gate" label. */
function headLine(report: Report2): string {
  const { run, lockrot } = report;
  const headline = gateHeadline(report);
  const gate = headline === null ? (gateFact(report)?.label ?? null) : gateHeadlineLine(headline);
  return [
    run.project === null ? "lockrot report" : `lockrot report for ${run.project}`,
    ...(report.data_date === null ? [] : [`data as of ${day(report.data_date)}`]),
    `lockrot ${lockrot.version}`,
    `score model ${run.score_model.id}`,
    `target PHP ${run.target_php}`,
    ...(gate === null ? [] : [gate]),
  ].join(DOT);
}

function countLine(report: Report2): string {
  const { packages_checked: checked, packages_flagged: flagged, run } = report;
  if (checked === 0) return "No packages in this lock.";
  if (flagged === 0) return `Nothing flagged in ${plural(checked, "package", "packages")}.`;

  const counts: Readonly<Record<string, number>> = report.counts;
  const grades = run.graded_verdicts
    .filter((grade) => (counts[grade] ?? 0) > 0)
    .map((grade, index) => `${counts[grade]} ${index === 0 ? "graded " : ""}${grade}`);
  const flags = run.flag_ids
    .filter((flag) => report.flags[flag].carrying > 0)
    .map((flag) => `${flag} ${report.flags[flag].carrying}`);
  const head = `${flagged} of ${plural(checked, "package", "packages")} flagged (${sharePhrase(flagged, checked)})`;
  return [
    `${head}${grades.length === 0 ? "" : `: ${grades.join(", ")}`}.`,
    ...(flags.length === 0 ? [] : [`Flags: ${flags.join(", ")}.`]),
  ].join(" ");
}

/** "all 7 in production", "6 required directly, 1 pulled in": the scope rollup of root `rot_depth`.
 *  With `numbered`, a lone package keeps its count ("1 in production"), as Overview prints it. */
export function scopeClauses(
  { packages_flagged: flagged, rot_depth: depth }: Report2,
  numbered = false,
): string[] {
  const total = depth.production + depth.development;
  if (flagged === 0 || total === 0) return [];
  const { direct, transitive, unreached } = depth.by_reach;
  const reached = direct + transitive;
  const reach = [
    ...(reached === 0 ? [] : [split(reached, direct, "required directly", "pulled in", numbered)]),
    ...(unreached === 0 ? [] : [`${unreached} unreached`]),
  ].join(", ");
  return [split(total, depth.production, "in production", "dev-only", numbered), ...(reach === "" ? [] : [reach])];
}

/** Whether the counted advisories may not be every advisory (SPEC §7.9.15's hedge). It reads no
 *  note code (§7.9.16). */
export function advisoryListPartial({ security }: Report2): boolean {
  return security.check === "partial" || security.check === "not_run" || security.packages.unchecked > 0;
}

export const PARTIAL_HEDGE = "advisory check incomplete, so the list may be partial";

/** PD-ADV-7's mark on a list that may be partial, or null for a full list. */
export function advisoryCheckMark(report: Report2): string | null {
  if (!advisoryListPartial(report)) return null;
  return report.security.check === "not_run" ? "check not run" : "check incomplete";
}

/** `security.fixes` with a count, in `fix_kinds[]` ease order, then any kind the model does not list. */
export function fixCounts({ security, run }: Report2): { kind: string; label: string; count: number }[] {
  const fixes: Readonly<Record<string, number>> = security.fixes;
  const kinds = run.score_model.fix_kinds.map(({ id }) => id);
  return [...kinds, ...Object.keys(fixes).filter((kind) => !kinds.includes(kind))]
    .filter((kind) => (fixes[kind] ?? 0) > 0)
    .map((kind) => ({ kind, label: fixLabel(kind), count: fixes[kind] ?? 0 }));
}

/** The Security clause when no advisory counted. */
export const noAdvisoryWords = (report: Report2): string =>
  advisoryListPartial(report)
    ? "no advisory found, but the advisory check was incomplete"
    : "no security advisory";

function securityClauses(report: Report2): string[] {
  const { security, run } = report;
  const incomplete = advisoryListPartial(report);
  const counted = security.advisories.counted;
  if (counted === 0) return [noAdvisoryWords(report)];

  const severities: Readonly<Record<string, number>> = security.severities;
  const bySeverity = run.score_model.severities
    .filter(({ id }) => (severities[id] ?? 0) > 0)
    .map(({ id }) => `${severities[id]} ${id}`);
  const found = `${plural(counted, "security advisory", "security advisories")} on ${plural(security.packages.vulnerable, "package", "packages")} (severity: ${bySeverity.join(", ")})`;

  const byFix = fixCounts(report).map(({ label, count }) => `${count} ${label}`);
  return [
    incomplete ? `${found} (${PARTIAL_HEDGE})` : found,
    ...(byFix.length === 0 ? [] : [`fix by package: ${byFix.join(", ")}`]),
  ];
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Three lines at most: what was checked, how many packages are flagged, and where they sit. */
export function copySummary(report: Report2): string[] {
  const libyears = report.libyears.measured > 0 ? fixed(report.libyears.total, 1) : null;
  const clauses = [
    ...scopeClauses(report),
    ...securityClauses(report),
    ...(libyears === null ? [] : [`${libyears} libyears behind`]),
  ];
  return [headLine(report), countLine(report), `${capitalise(clauses.join(DOT))}.`];
}
