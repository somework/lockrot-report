/**
 * The Release branches timeline of a report-2 detail sheet (SPEC §7.9.8), as rows on one years-ago
 * axis that ends at the run. Every length is a published years field: the page lays them out and
 * reads no date against a clock, no php floor and no constraint.
 */

import type { Finding, ReleaseBranch, RepositoryMetadata, Run } from "../model/report2";
import { ago } from "./ago";
import { phpConstraintWord } from "./phpAlternatives";

/** Past this many newer branches, the ones between the newest and yours fold, so the two rows that
 *  answer the question stay in view. */
const BETWEEN_MAX = 4;

/** Folding two would save one line and hide two answers. */
const FOLD_MIN = 3;

export interface BranchLane {
  readonly branch: string;
  /** Null when lockrot could not date the branch: the row draws no bar. */
  readonly years: number | null;
  readonly version: string;
  readonly php: string | null;
  readonly installed: boolean;
  /** The first row, unless it is the installed one: nothing newer to point at then. */
  readonly newest: boolean;
  readonly datedBy: string | null;
}

export type BranchTimelineRow =
  | { readonly kind: "lane"; readonly lane: BranchLane }
  | { readonly kind: "fold"; readonly which: "between" | "older"; readonly lanes: readonly BranchLane[] };

export interface AgeGuide {
  readonly years: number;
  readonly level: "warn" | "high";
}

export interface BranchTimeline {
  readonly rows: readonly BranchTimelineRow[];
  /** The axis's left end, in whole years before the run; the right end is the run. */
  readonly span: number;
  /** The run's release age limits that fall inside the axis; none when the run has no thresholds. */
  readonly guides: readonly AgeGuide[];
  /** `age.branch_release.level`, which tones the installed row. */
  readonly installedLevel: "warn" | "high" | null;
}

function lane(row: ReleaseBranch, index: number, finding: Finding): BranchLane {
  return {
    branch: row.branch,
    years: row.installed ? (finding.age.branch_release?.years ?? null) : row.released_years,
    version: row.installed ? (finding.age.branch_release?.version ?? row.highest) : row.highest,
    php: row.highest_php === null ? null : phpConstraintWord(row.highest_php),
    installed: row.installed,
    newest: index === 0 && !row.installed,
    datedBy: row.installed ? (finding.age.branch_release?.dated_by ?? null) : row.dated_by,
  };
}

function foldOlder(older: readonly BranchLane[]): BranchTimelineRow[] {
  if (older.length >= FOLD_MIN) return [{ kind: "fold", which: "older", lanes: older }];
  return older.map((l) => ({ kind: "lane", lane: l }));
}

/** Every newer branch (the middle folded past BETWEEN_MAX), yours, then the older ones folded. */
function rowsAround(lanes: readonly BranchLane[], index: number): BranchTimelineRow[] {
  const newer = lanes.slice(0, index);
  const [first, ...between] = newer;
  const above: BranchTimelineRow[] =
    first !== undefined && newer.length > BETWEEN_MAX
      ? [
          { kind: "lane", lane: first },
          { kind: "fold", which: "between", lanes: between },
        ]
      : newer.map((l) => ({ kind: "lane", lane: l }));
  const mine = lanes[index];
  return [
    ...above,
    ...(mine === undefined ? [] : [{ kind: "lane" as const, lane: mine }]),
    ...foldOlder(lanes.slice(index + 1)),
  ];
}

/** `null` when the report carries fewer than two branches: one bar on an axis answers nothing. */
export function branchTimeline(
  finding: Finding,
  metadata: RepositoryMetadata | null,
  run: Pick<Run, "thresholds">,
): BranchTimeline | null {
  const lanes = (metadata?.branches ?? []).map((row, index) => lane(row, index, finding));
  const [top, ...rest] = lanes;
  if (top === undefined || rest.length === 0) return null;

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

  const installedAt = lanes.findIndex((l) => l.installed);
  return {
    rows:
      installedAt >= 0 ? rowsAround(lanes, installedAt) : [{ kind: "lane", lane: top }, ...foldOlder(rest)],
    span,
    guides,
    installedLevel: finding.age.branch_release?.level ?? null,
  };
}

/** A lane's or a guide's place on the axis, 0 to 100 from the left end to the run. */
export function xOfYears(years: number, span: number): number {
  return Math.min(100, Math.max(0, 100 - (years / span) * 100));
}

/** What a row's strip says to a screen reader, and its tooltip: "v5.4.52, released 0.4 years ago". */
export function laneWords(l: BranchLane): string {
  const released = l.years === null ? `${l.version}, undated` : `${l.version}, released ${ago(l.years)}`;
  return l.datedBy === null ? released : `${released}, dated by ${l.datedBy}`;
}

/** The fixed words of the timeline: its column heads, marks, key and fold buttons. */
export const TIMELINE_WORDS = {
  branch: "branch",
  strip: "time since its last release, on one axis that ends at the run",
  latest: "latest",
  php: "PHP",
  yours: ", yours",
  newest: ", the newest",
  noPhp: "none recorded",
  you: "you",
  newestKey: "newest",
  line: "time since its last release",
  guide: "age limit, in years before the run",
  older: "older branches",
  between: "branches, between the newest and yours",
  years: "{n}y",
} as const;
