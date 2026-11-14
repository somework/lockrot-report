import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../pages";

/** The recorded page-level goldens of one case: the strings lockrot's model renders from the
 *  document's root fields (`contract/page-goldens.json`). */
export interface PageGolden {
  grade_line: string;
  figure_line: string;
  load_line: string;
  kicker: string;
  waffle_caption: string;
  lead_scope: string;
  grade_chips: string[];
  waffle: { verdict: string; word: string; mark: string; count: number }[];
  gate_link_rows: number;
  state_lines: unknown[];
  ready: {
    moves: unknown[];
    held_line: string | null;
    way_out: string | null;
    none: string | null;
  };
  security: { figure: string | null; unit: string; counted_as: string[] };
  weighs_most: { caption: string; rows: { package: string; grade: string; total: number; terms: string }[] };
  advisory_groups: { package: string; same_cve_as: string[]; fix_notes: string[] }[];
  findings_groups: { grade: string; count: string; gate: string | null; major: string | null }[];
  findings_rows: {
    package: string;
    reach: string;
    held: string | null;
    after: string | null;
    major: string | null;
    command: string | null;
  }[];
  flags_notes: string[];
  depth: { rows: string[]; sentence: string | null };
  [field: string]: unknown;
}

const ALL = JSON.parse(
  readFileSync(join(REPO_ROOT, ".lockrot", "tests", "fixtures", "contract", "page-goldens.json"), "utf8"),
) as { goldens: Record<string, PageGolden> };

export function pageGolden(caseName: string): PageGolden {
  const golden = ALL.goldens[caseName];
  if (golden === undefined) throw new Error(`no page golden for ${caseName}`);
  return golden;
}
