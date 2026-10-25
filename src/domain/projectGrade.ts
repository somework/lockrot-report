/**
 * The Overview's answer to "how bad is this project overall" (SPEC §7.9.4): the grade line, the
 * figure line, the load line, the points of a flag and "Weighs most". These are the counts and sums
 * SPEC §7.9.1 lets the page make; every score, grade and term is lockrot's.
 */

import type { Finding, Report2 } from "../model/report";
import { isScoreGraded } from "../model/report";
import type { LinkTarget } from "../state/types";
import { decimal, plural, pluralNoun } from "./format";
import { lookupWord } from "./pageVocabulary";
import { scoreBar, type BarSegment } from "./scoreBar";

/** How many findings "Weighs most" draws before its rest line. */
export const WEIGHS_SHOWN = 10;

export const WEIGHS_WORDS = {
  head: "Weighs most",
  note: "highest score first",
  dev: "dev",
} as const;

export const GRADE_HEAD = "Project grade:";
const NOTHING_FLAGGED = "nothing flagged";
/** The last verdict that "high or worse" holds. */
const HIGH = "high";

const graded = (report: Report2): Finding[] => {
  const verdicts: readonly string[] = report.run.graded_verdicts;
  return report.findings.filter((f) => verdicts.includes(f.verdict) && isScoreGraded(f.score));
};

const total = (f: Finding): number => (isScoreGraded(f.score) ? f.score.total : 0);

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** The graded verdicts from the first one up to and including high. */
function highOrWorse({ run }: Report2): readonly string[] {
  const verdicts: readonly string[] = run.graded_verdicts;
  return verdicts.slice(0, verdicts.indexOf(HIGH) + 1);
}

export interface GradeLine {
  /** The first graded verdict any package holds, or null when none does. */
  grade: string | null;
  /** Findings under that grade, the chip's target; null with no grade. */
  link: LinkTarget | null;
  /** Everything after the grade word, each joined with " · ". */
  clauses: string[];
}

export function gradeLine(report: Report2): GradeLine | null {
  const { counts, packages_checked: checked, security } = report;
  if (checked === 0) return null;
  const byVerdict: Readonly<Record<string, number>> = counts;
  const grade = report.run.graded_verdicts.find((v) => (byVerdict[v] ?? 0) > 0) ?? null;
  const worse = sum(highOrWorse(report).map((v) => byVerdict[v] ?? 0));
  const known = graded(report).filter((f) => f.baseline?.status === "known").length;

  const clauses = [
    ...(grade === null
      ? []
      : [
          plural(byVerdict[grade] ?? 0, `${grade} finding`, `${grade} findings`),
          `${String(worse)} of ${plural(checked, "package", "packages")} high or worse`,
        ]),
    ...(security.check === "partial" ? [lookupWord(security.check, null)] : []),
    ...(counts.unknown > 0 ? [`${String(counts.unknown)} not judged`] : []),
    ...(report.baseline !== null && known > 0 ? [`${String(known)} known to the baseline`] : []),
  ];
  return {
    grade,
    link: grade === null ? null : { view: "findings", filters: { verdict: [grade] } },
    clauses,
  };
}

/** The grade line as one string, the page's text of it. */
export const gradeLineHead = ({ grade }: GradeLine): string => `${GRADE_HEAD} ${grade ?? NOTHING_FLAGGED}`;

export const gradeLineText = (line: GradeLine): string => [gradeLineHead(line), ...line.clauses].join(" · ");

function figureParts(
  { packages_checked: checked, packages_flagged: flagged, counts }: Report2,
  keyed: boolean,
) {
  return [
    `${String(flagged)} of ${plural(checked, "package", "packages")} flagged`,
    ...(keyed && counts.unknown > 0 ? [`${String(counts.unknown)} not judged`] : []),
    `${String(counts.ok)} ok`,
    `${String(counts.finished)} finished`,
  ];
}

export function figureLine(report: Report2): string | null {
  return report.packages_checked === 0 ? null : figureParts(report, false).join(" · ");
}

/** The waffle's caption, the key of its squares: the figure line with "{n} not judged" after the
 *  flagged count when `counts.unknown` is above 0, so its parts sum to `packages_checked`. */
export function waffleCaption(report: Report2): string | null {
  return report.packages_checked === 0 ? null : figureParts(report, true).join(" · ");
}

export function loadLine(report: Report2): string | null {
  if (report.packages_checked === 0) return null;
  const findings = graded(report);
  if (findings.length === 0) return null;
  const worse = highOrWorse(report);
  const load = sum(findings.map(total));
  const high = sum(findings.filter((f) => worse.includes(f.verdict)).map(total));
  const share = load === 0 ? "" : ` (${String(Math.floor((100 * high) / load))} %)`;
  const dev = findings.filter((f) => f.dev);
  return [
    `${String(load)} points on ${plural(report.packages_flagged, "flagged package", "flagged packages")}`,
    `${String(high)}${share} from high or worse`,
    `score model ${String(report.run.score_model.id)}`,
    ...(dev.length === 0 ? [] : [`${String(sum(dev.map(total)))} from packages-dev`]),
  ].join(" · ");
}

/** Σ `score.terms[].contribution` per flag over the graded findings: half points kept. */
export function flagPoints(report: Report2): ReadonlyMap<string, number> {
  const points = new Map<string, number>();
  for (const { score } of graded(report)) {
    if (!isScoreGraded(score)) continue;
    for (const term of score.terms) points.set(term.flag, (points.get(term.flag) ?? 0) + term.contribution);
  }
  return points;
}

/** "{points} pts", a half point as ".5". */
export const pointsNumber = (points: number): string =>
  Number.isInteger(points) ? String(points) : decimal(points, 1);

export const pointsText = (points: number): string => `${pointsNumber(points)} pts`;

export interface WeighsRow {
  package: string;
  grade: string;
  total: number;
  /** "points" or "point", the total's unit for a screen reader. */
  unit: string;
  /** `reach` unless direct, then "dev" when `dev` is true, joined " · ". */
  reach: string;
  /** Each `score.terms[]` entry as "{flag} {contribution}", in term order; the page joins them " · ". */
  terms: readonly string[];
  /** "(score {total})" when the terms do not sum to `score.total`, else null; no term is adjusted. */
  termsTotal: string | null;
  segments: readonly BarSegment[];
  /** The terms run past `bar_max`. */
  over: boolean;
  link: LinkTarget;
}

export interface WeighsMost {
  caption: string;
  rows: WeighsRow[];
  /** "{n} more flagged packages hold {points} points", or null when every graded finding is drawn. */
  rest: string | null;
  restLink: LinkTarget | null;
}

/** The graded findings with the highest `score.total`, highest first, ties in `findings[]` order. */
export function weighsMost(report: Report2): WeighsMost | null {
  if (graded(report).length === 0) return null;
  const ranked = [...graded(report)].sort((a, b) => total(b) - total(a));
  const shown = ranked.slice(0, WEIGHS_SHOWN);
  const others = ranked.slice(WEIGHS_SHOWN);

  const rows = shown.map((f) => {
    const bar = scoreBar(f.score, report.run);
    return {
      package: f.package,
      grade: f.verdict,
      total: total(f),
      unit: pluralNoun(total(f), "point", "points"),
      reach: [...(f.direct ? [] : [f.reach]), ...(f.dev ? [WEIGHS_WORDS.dev] : [])].join(" · "),
      terms: isScoreGraded(f.score)
        ? f.score.terms.map((t) => `${t.flag} ${pointsNumber(t.contribution)}`)
        : [],
      termsTotal:
        isScoreGraded(f.score) && sum(f.score.terms.map((t) => t.contribution)) !== f.score.total
          ? `(score ${String(f.score.total)})`
          : null,
      segments: bar.segments,
      over: bar.over,
      link: { view: "findings", pkg: f.package } satisfies LinkTarget,
    };
  });
  const rest =
    others.length === 0
      ? null
      : `${plural(others.length, "more flagged package holds", "more flagged packages hold")} ${String(sum(others.map(total)))} points`;
  return { caption: WEIGHS_WORDS.note, rows, rest, restLink: rest === null ? null : { view: "findings" } };
}
