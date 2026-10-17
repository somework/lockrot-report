/**
 * Release branches on the detail sheet (SPEC §7.9.8.11, §7.9.13.7): the lead, then a timeline of
 * rows on one years-ago axis that ends at the run. Every length is a published years field: the
 * page lays them out and reads no date against a clock, no php floor and no constraint.
 */

import type { Finding, ReleaseBranch, RepositoryMetadata, Run } from "../model/report";
import { signalData } from "./findingWords";
import { ago } from "./ago";
import { decimal } from "./format";
import { phpConstraintWord } from "./phpAlternatives";
import { TL_BETWEEN_MAX, TL_BETWEEN_RUN_MIN, TL_FOLD_MIN } from "./sheetThresholds";

export type FoldKind = "between" | "older";

export interface BranchLane {
  readonly branch: string;
  /** Null when lockrot could not date the branch: the row draws no bar. */
  readonly years: number | null;
  readonly version: string;
  readonly php: string | null;
  /** G147: why the release's php is out of reach. */
  readonly phpWords: string | null;
  readonly installed: boolean;
  /** The row of `next_step.to_branch`. */
  readonly move: boolean;
  /** The first row, unless it is the installed one: nothing newer to point at then. */
  readonly newest: boolean;
  readonly datedBy: string | null;
  /** The latest release's short age: "{y}y", "< 3 wk" or "undated" (G148). */
  readonly age: string;
  readonly foldedIn: FoldKind | null;
}

export type BranchTimelineRow =
  | { readonly kind: "lane"; readonly lane: BranchLane }
  | { readonly kind: "fold"; readonly which: FoldKind; readonly lanes: readonly BranchLane[] };

export interface AgeGuide {
  readonly years: number;
  readonly level: "warn" | "high";
}

export interface BranchTimeline {
  readonly lanes: readonly BranchLane[];
  readonly rows: readonly BranchTimelineRow[];
  /** The axis's left end, in whole years before the run; the right end is the run. */
  readonly span: number;
  /** The run's release age limits that fall inside the axis; none when the run has no thresholds. */
  readonly guides: readonly AgeGuide[];
  /** `age.branch_release.level`, which tones the installed row. */
  readonly installedLevel: "warn" | "high" | null;
}

function phpWords(row: ReleaseBranch): string | null {
  if (row.highest_admits_target_php === false) return "your target does not run it";
  if (row.highest_admits_project_php !== false) return null;
  return row.highest_misses_project_php === "needs_newer"
    ? "above your require.php"
    : "your require.php does not admit it";
}

const shortAge = (years: number | null): string =>
  years === null ? "undated" : years === 0 ? "< 3 wk" : `${decimal(years, 1)}y`;

/** Which fold holds each row: a run between the newest and yours past TL_BETWEEN_MAX, the older ones. */
function foldsOf(rows: readonly ReleaseBranch[], moveBranch: string | null): (FoldKind | null)[] {
  const folded: (FoldKind | null)[] = rows.map(() => null);
  const foldOlder = (from: number): void => {
    if (rows.length - from >= TL_FOLD_MIN) for (let i = from; i < rows.length; i++) folded[i] = "older";
  };
  const at = rows.findIndex((r) => r.installed);
  if (at < 0) {
    foldOlder(1);
    return folded;
  }
  if (at > TL_BETWEEN_MAX) {
    const between = Array.from({ length: at - 1 }, (_, i) => i + 1);
    const m = between.find((i) => moveBranch !== null && rows[i]?.branch === moveBranch);
    const runs = m === undefined ? [between] : [between.filter((i) => i < m), between.filter((i) => i > m)];
    for (const run of runs) if (run.length >= TL_BETWEEN_RUN_MIN) for (const i of run) folded[i] = "between";
  }
  foldOlder(at + 1);
  return folded;
}

function lanesOf(finding: Finding, metadata: RepositoryMetadata | null): BranchLane[] {
  const rows = metadata?.branches ?? [];
  const release = finding.age.branch_release;
  const moveBranch = finding.next_step?.to_branch ?? null;
  const folded = foldsOf(rows, moveBranch);
  return rows.map((row, i) => {
    const years = row.installed ? (release?.years ?? null) : row.released_years;
    return {
      branch: row.branch,
      years,
      version: row.installed ? (release?.version ?? row.highest) : row.highest,
      php: row.highest_php === null ? null : phpConstraintWord(row.highest_php),
      phpWords: phpWords(row),
      installed: row.installed,
      move: moveBranch !== null && row.branch === moveBranch,
      newest: i === 0 && !row.installed,
      datedBy: row.installed ? (release?.dated_by ?? null) : row.dated_by,
      age: shortAge(years),
      foldedIn: folded[i] ?? null,
    };
  });
}

/** "yours", "the move" and "newest", the hidden mark (G148). */
export const laneMarks = (l: BranchLane): string[] => [
  ...(l.installed ? ["yours"] : []),
  ...(l.move ? ["the move"] : []),
  ...(l.newest ? ["newest"] : []),
];

/** Consecutive lanes of one fold make one fold row. */
function rowsOf(lanes: readonly BranchLane[]): BranchTimelineRow[] {
  const rows: BranchTimelineRow[] = [];
  for (const lane of lanes) {
    const last = rows.at(-1);
    if (lane.foldedIn === null) rows.push({ kind: "lane", lane });
    else if (last?.kind === "fold" && last.which === lane.foldedIn)
      rows[rows.length - 1] = { ...last, lanes: [...last.lanes, lane] };
    else rows.push({ kind: "fold", which: lane.foldedIn, lanes: [lane] });
  }
  return rows;
}

/** `null` when the report carries fewer than two branches: one bar on an axis answers nothing. */
export function branchTimeline(
  finding: Finding,
  metadata: RepositoryMetadata | null,
  run: Pick<Run, "thresholds">,
): BranchTimeline | null {
  const lanes = lanesOf(finding, metadata);
  if (lanes.length < 2) return null;
  const dated = lanes.flatMap((l) => (l.years === null ? [] : [l.years]));
  const span = Math.max(1, Math.ceil(Math.max(0, ...dated)));
  const thresholds = run.thresholds;
  const guides: AgeGuide[] =
    thresholds === null
      ? []
      : [
          { years: thresholds["release-warn-years"], level: "warn" as const },
          { years: thresholds["release-high-years"], level: "high" as const },
        ].filter((guide) => guide.years > 0 && guide.years < span);
  return {
    lanes,
    rows: rowsOf(lanes),
    span,
    guides,
    installedLevel: finding.age.branch_release?.level ?? null,
  };
}

/** A lane's or a guide's place on the axis, 0 to 100 from the left end to the run. */
export function xOfYears(years: number, span: number): number {
  return Math.min(100, Math.max(0, 100 - (years / span) * 100));
}

/** The bar's text equivalent and tooltip (G146): "v5.4.52, released 0.4 years ago". */
export function laneWords(l: BranchLane): string {
  const released = l.years === null ? `${l.version}, undated` : `${l.version}, released ${ago(l.years)}`;
  return l.datedBy === null ? released : `${released}, dated by ${l.datedBy}`;
}

/** G141 to G145: the installed branch and its last release, then the branch S8 reads against. */
export function branchesLead(finding: Finding, metadata: RepositoryMetadata | null): string[] {
  const rows = metadata?.branches ?? [];
  if (rows.length === 0) return [];
  const at = rows.findIndex((r) => r.installed);
  const branch = at >= 0 ? (rows[at]?.branch ?? null) : finding.branch;
  const last = finding.age.branch_release;
  const mine =
    branch === null
      ? `A branch snapshot, ${finding.version}, is installed.`
      : `Your branch, ${branch}, ${last === null ? "has no dated release" : `had its last release, ${last.version}, ${ago(last.years)}`}.`;
  if (at === 0) return [mine, "It has no higher branch."];
  const s8 = signalData(finding, "S8");
  if (!s8) return [mine];
  const reached = s8.reachable_branch !== null;
  const [higher, version, years] = reached
    ? [s8.reachable_branch, s8.reachable_version, s8.reachable_years]
    : [s8.newest_branch, s8.newest_version, s8.newest_years];
  if (higher === null) return [mine];
  const who =
    higher === finding.next_step?.to_branch
      ? "The move's branch"
      : reached
        ? "The highest branch within reach"
        : "The newest branch";
  return [mine, `${who}, ${higher}, released ${version ?? ""}${years === null ? "" : ` ${ago(years)}`}.`];
}

/** The fixed words of the timeline: its column heads, marks, key and fold buttons. */
export const TIMELINE_WORDS = {
  branch: "branch",
  strip: "time since its last release, on one axis that ends at the run",
  latest: "latest",
  php: "PHP",
  yours: "yours",
  move: "the move",
  newest: ", the newest",
  noPhp: "none recorded",
  you: "you",
  newestKey: "newest",
  line: "time since its last release",
  guide: "age limit, in years before the run",
  older: " branches",
  between: " the newest branch and yours",
  years: "{n}y",
} as const;
