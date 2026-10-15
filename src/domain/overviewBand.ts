/**
 * The overview band of a report-2 (SPEC §7.9.4) as words and counts, from root fields only. Every
 * count here is lockrot's; the page lays them out.
 */

import type { Report2 } from "../model/report2";
import { advisoryListPartial, fixCounts, noAdvisoryWords, PARTIAL_HEDGE, scopeClauses } from "./copySummary";
import { isAre, namesCapped } from "./findingWords";
import { fixed, plural, pluralNoun } from "./format";
import { sharePhrase } from "./summary";

export const OVERVIEW_WORDS = {
  band: "Overview",
  flagged: "Flagged packages",
  grades: "Grade",
  perPackage: "One square per package",
  flags: "Flags",
  flagsNote: "packages carrying each; a package counts once per flag",
  security: "Security advisories",
  perAdvisory: "One square per advisory",
  bySeverity: "Advisories by severity",
  byFix: "By fix (packages)",
  libyears: "Libyears",
  more: "More about this lock",
} as const;

export type Lead =
  | { kind: "empty"; text: string }
  | { kind: "clean"; text: string }
  | { kind: "flagged"; figure: string; of: string; flagged: string; share: string };

const packages = (n: number): string => plural(n, "package", "packages");

export function leadFigure({ packages_checked: checked, packages_flagged: flagged }: Report2): Lead {
  if (checked === 0) return { kind: "empty", text: "No packages in this lock" };
  if (flagged === 0) return { kind: "clean", text: `Nothing flagged in ${packages(checked)}` };
  return {
    kind: "flagged",
    figure: String(flagged),
    of: `of ${packages(checked)}`,
    flagged: "flagged",
    share: `· ${sharePhrase(flagged, checked)} of the lock`,
  };
}

export const leadScope = (report: Report2): string[] => scopeClauses(report);

export interface GradeCount {
  grade: string;
  count: number;
}

/** One chip per graded verdict, a zero kept so the whole scale shows; none for an empty lock. */
export function gradeChips({ counts, run, packages_checked: checked }: Report2): GradeCount[] {
  if (checked === 0) return [];
  const byGrade: Readonly<Record<string, number>> = counts;
  return run.graded_verdicts.map((grade) => ({ grade, count: byGrade[grade] ?? 0 }));
}

export interface FlagBar {
  flag: string;
  carrying: number;
  parts: GradeCount[];
  split: string;
}

type RootFlag = Report2["flags"][keyof Report2["flags"]];

const rootFlags = ({ flags }: Report2): Readonly<Record<string, RootFlag | undefined>> => flags;

export type GateState = "fails" | "passes" | "off";

/** What the `gate:` line says, from fields: a run with no gate value and no strict network gates nothing. */
export function gateState({ gate, run }: Report2): GateState {
  if (gate.fails) return "fails";
  return run.gates.length === 0 && !run.strict_network ? "off" : "passes";
}

export const GATE_GLYPHS: Readonly<Record<GateState, string>> = { fails: "✕", passes: "✓", off: "" };

export function flagBars(report: Report2): FlagBar[] {
  const flags = rootFlags(report);
  return report.run.score_model.flag_order.flatMap((flag) => {
    const entry = flags[flag];
    if (entry === undefined || entry.carrying === 0) return [];
    const byVerdict: Readonly<Record<string, number>> = entry.by_verdict;
    const parts = report.run.graded_verdicts
      .map((grade) => ({ grade, count: byVerdict[grade] ?? 0 }))
      .filter(({ count }) => count > 0);
    const split = `graded ${parts.map(({ grade, count }) => `${grade} ${count}`).join(" · ")}`;
    return [{ flag, carrying: entry.carrying, parts, split }];
  });
}

export function multiFlagLine({
  packages_flagged: flagged,
  packages_multi_flag: multi,
  run,
}: Report2): string | null {
  if (flagged === 0) return null;
  return `${multi} ${pluralNoun(multi, "carries", "carry")} more than one flag · score model ${run.score_model.id}`;
}

export function depthSentence({ rot_depth: depth }: Report2): string | null {
  if (depth.flagged === 0) return null;
  const lockOnly = depth.unmeasured.no_composer_json;
  if (lockOnly > 0) {
    return `lockrot did not read composer.json, so it does not know how deep the ${plural(lockOnly, "flagged package", "flagged packages")} ${pluralNoun(lockOnly, "sits", "sit")}.`;
  }
  const unnamed = depth.not_in_composer_json;
  const head = `${unnamed} of ${plural(depth.flagged, "flagged package", "flagged packages")} ${isAre(unnamed)} named by no line of composer.json`;
  const { deepest, max_depth: hops } = depth;
  if (deepest.length === 0 || hops === null) return `${head}.`;
  const names = namesCapped(deepest.map(({ package: name }) => name));
  return `${head}; the deepest, ${names}, ${pluralNoun(deepest.length, "sits", "sit")} ${plural(hops, "hop", "hops")} from the nearest line.`;
}

export function acceptedLine(report: Report2): string | null {
  if (report.packages_flagged === 0) return null;
  const flags = rootFlags(report);
  const accepted = report.run.score_model.flag_order.flatMap((flag) => {
    const inGraded = flags[flag]?.accepted?.in_graded ?? 0;
    return inGraded > 0 ? [`${flag} ${inGraded}`] : [];
  });
  return accepted.length === 0
    ? "Accepted by the allowlist: none in flagged packages"
    : `Accepted by the allowlist in flagged packages: ${accepted.join(", ")}`;
}

export interface SeverityCount {
  id: string;
  band: string;
  /** A severity counted as another one: drawn outlined, so it never shares that one's look alone. */
  outlined: boolean;
  count: number;
}

export interface SecurityBlock {
  figure: string | null;
  unit: string;
  note: string | null;
  severities: SeverityCount[];
  fixes: { label: string; count: number }[];
}

export function securityBlock(report: Report2): SecurityBlock {
  const { security, run } = report;
  const counted = security.advisories.counted;
  if (counted === 0)
    return { figure: null, unit: noAdvisoryWords(report), note: null, severities: [], fixes: [] };
  const bySeverity: Readonly<Record<string, number>> = security.severities;
  return {
    figure: String(counted),
    unit: `${pluralNoun(counted, "advisory", "advisories")} on ${packages(security.packages.vulnerable)}`,
    note: advisoryListPartial(report) ? PARTIAL_HEDGE : null,
    severities: run.score_model.severities
      .map(({ id, band, counts_as: countsAs }) => ({
        id,
        band,
        outlined: countsAs !== null,
        count: bySeverity[id] ?? 0,
      }))
      .filter(({ count }) => count > 0),
    fixes: fixCounts(report).map(({ label, count }) => ({ label, count })),
  };
}

/** The closed phone fold's one line: what the folded tier holds. */
export function foldPeek2(report: Report2): string[] {
  const flags = flagBars(report).length;
  const advisories = report.security.advisories.counted;
  const { libyears } = report;
  return [
    flags === 0 ? "no flag" : plural(flags, "flag", "flags"),
    advisories === 0 ? "no advisory" : plural(advisories, "advisory", "advisories"),
    ...(libyears.measured > 0 ? [`${fixed(libyears.total, 1)} libyears`] : []),
  ];
}
