/**
 * The copy summary (SPEC §7.9.15) as lines of text, written from the root fields of a report-2.
 * What it counts, `packages_flagged` and the rest, lockrot has already counted.
 */

import type { Report2 } from "../model/report2";
import { day, fixed, plural } from "./format";
import { fixLabel } from "./pageVocabulary";
import { sharePhrase } from "./summary";

const DOT = " · ";

/** `a`, `all n a`, `all n b` or `a, b` for two counts that make the total. */
function split(total: number, a: number, aWord: string, bWord: string): string {
  const b = total - a;
  if (total === 1) return a === 1 ? aWord : bWord;
  if (b === 0) return `all ${total} ${aWord}`;
  if (a === 0) return `all ${total} ${bWord}`;
  return `${a} ${aWord}, ${b} ${bWord}`;
}

function headLine(report: Report2): string {
  const { run, lockrot } = report;
  return [
    run.project === null ? "lockrot report" : `lockrot report for ${run.project}`,
    ...(report.data_date === null ? [] : [`data as of ${day(report.data_date)}`]),
    `lockrot ${lockrot.version}`,
    `score model ${run.score_model.id}`,
    `target PHP ${run.target_php}`,
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

function scopeClauses({ packages_flagged: flagged, rot_depth: depth }: Report2): string[] {
  const total = depth.production + depth.development;
  if (flagged === 0 || total === 0) return [];
  const { direct, transitive, unreached } = depth.by_reach;
  const reached = direct + transitive;
  const reach = [
    ...(reached === 0 ? [] : [split(reached, direct, "required directly", "pulled in")]),
    ...(unreached === 0 ? [] : [`${unreached} unreached`]),
  ].join(", ");
  return [split(total, depth.production, "in production", "dev-only"), ...(reach === "" ? [] : [reach])];
}

function securityClauses(report: Report2): string[] {
  const { security, run } = report;
  const incomplete =
    security.check === "partial" ||
    security.check === "not_run" ||
    security.packages.unchecked > 0 ||
    report.note_details.some(({ code }) => code === "advisories_not_checked");
  const counted = security.advisories.counted;
  if (counted === 0) {
    return [incomplete ? "no advisory found, but the advisory check was incomplete" : "no security advisory"];
  }

  const severities: Readonly<Record<string, number>> = security.severities;
  const bySeverity = run.score_model.severities
    .filter(({ id }) => (severities[id] ?? 0) > 0)
    .map(({ id }) => `${severities[id]} ${id}`);
  const found = `${plural(counted, "security advisory", "security advisories")} on ${plural(security.packages.vulnerable, "package", "packages")} (severity: ${bySeverity.join(", ")})`;

  const fixes: Readonly<Record<string, number>> = security.fixes;
  const kinds = run.score_model.fix_kinds.map(({ id }) => id);
  const byFix = [...kinds, ...Object.keys(fixes).filter((kind) => !kinds.includes(kind))]
    .filter((kind) => (fixes[kind] ?? 0) > 0)
    .map((kind) => `${fixes[kind]} ${fixLabel(kind)}`);
  return [
    incomplete ? `${found} (advisory check incomplete, so the list may be partial)` : found,
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
