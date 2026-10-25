// Every page-golden field of SPEC §7.9.14 that the page renders, from the `src/domain/` function
// that the view reads, against lockrot's `page-goldens.json` on every page case. `title` and
// `description` are lockrot's (`HtmlFormatter` fills the template), and `panel` and the copy summary
// are held in `pageTexts.test.ts`.
import { describe, expect, test } from "vitest";

import { advisoryGroupNotes } from "../../../src/domain/advisories";
import { dataCaption, showsDataColumn, signalKey } from "../../../src/domain/packageCells";
import { findingsGroups, findingsRowFacts } from "../../../src/domain/findingsRows";
import { firstMoves, gateLineTarget } from "../../../src/domain/firstMoves";
import { libyearsLead } from "../../../src/domain/libyearsLead";
import { applyFilters2 } from "../../../src/domain/list";
import {
  acceptedLine,
  depthSentence,
  gradeChips,
  leadScope,
  multiFlagLine,
  OVERVIEW_WORDS,
  securityBlock,
} from "../../../src/domain/overviewBand";
import { depthRows, exposureBars, libyearsTop, OVERVIEW_TAB_WORDS } from "../../../src/domain/overviewTab";
import { gradeLine, gradeLineText, waffleCaption, weighsMost } from "../../../src/domain/projectGrade";
import { gatePartition, readyCount } from "../../../src/domain/readyToRun";
import { runNotes } from "../../../src/domain/runTab";
import { windowRows } from "../../../src/domain/phpWindow";
import { stateLineText, stateLines } from "../../../src/domain/runState";
import { waffleRuns } from "../../../src/domain/summary";
import type { Report2 } from "../../../src/model/report";
import { linkHref, linkState } from "../../../src/state/hash";
import type { LinkTarget } from "../../../src/state/types";
import { blockGolden } from "../blocks/blockGoldens";
import { pageGoldenMetadata, pageGoldens } from "../words/recorded";

const href = (target: LinkTarget | null): string | null => (target === null ? null : linkHref(target));

/** The golden check of a count link: the rows of the view that the link opens. */
const rows = (report: Report2, target: LinkTarget | null): number | null =>
  target === null ? null : applyFilters2(report, linkState(target), target.view).length;

function ready(report: Report2): unknown {
  if (report.packages_checked === 0) return null;
  const block = firstMoves(report);
  return {
    note: block.note,
    moves: block.moves.map((move) => ({
      package: move.package,
      link: href(move.link),
      grade: move.grade,
      new_major: move.newLine !== null,
      command: move.command,
      clears: move.clears,
      after: move.after,
      also_holds: move.alsoHolds,
    })),
    more: block.more,
    more_link: href(block.moreLink),
    more_link_rows: rows(report, block.moreLink),
    held_line: block.held,
    held_link: href(block.heldLink),
    held_link_rows: rows(report, block.heldLink),
    way_out: block.wayOut,
    way_out_link: href(block.wayOutLink),
    way_out_link_rows: rows(report, block.wayOutLink),
    none: block.none,
  };
}

function security(report: Report2): unknown {
  if (report.packages_checked === 0) return null;
  const block = securityBlock(report);
  return {
    figure: block.figure,
    unit: block.unit,
    lookup_complete: report.security.check === "complete",
    counted_as: block.severities.flatMap(({ countedAs }) => (countedAs === null ? [] : [countedAs])),
  };
}

function weighs(report: Report2): unknown {
  const block = weighsMost(report);
  if (block === null) return null;
  return {
    caption: block.caption,
    rows: block.rows.map((row) => ({
      grade: row.grade,
      package: row.package,
      link: href(row.link),
      reach: row.reach,
      total: row.total,
      terms: row.terms.join(" · "),
      terms_total: row.termsTotal,
    })),
    rest: block.rest,
    rest_link: href(block.restLink),
  };
}

function exposure(report: Report2): unknown {
  const bars = exposureBars(report);
  if (bars.rows.length === 0 && bars.shared === null) return null;
  return {
    head: [OVERVIEW_TAB_WORDS.requirement, bars.scale],
    rows: bars.rows.map((row) => ({
      package: row.package,
      flagged: row.flagged,
      link: href({ view: "radius", pkg: row.package }),
    })),
    count: bars.count,
    overlap: bars.overlap,
    more: bars.more,
    shared: bars.shared,
  };
}

function libyears(report: Report2): unknown {
  if (report.packages_checked === 0) return null;
  const lead = libyearsLead(report);
  const top = libyearsTop(report);
  return {
    ...lead,
    top: top.map((row) => [`${row.package} ${row.version}`, row.libyears, row.release]),
    none: report.libyears.measured > 0 && top.length === 0 ? OVERVIEW_TAB_WORDS.libyearsNone : null,
  };
}

const FIELDS: Readonly<Record<string, (report: Report2) => unknown>> = {
  kicker: () => OVERVIEW_WORDS.kicker,
  grade_line: (report) => {
    const line = gradeLine(report);
    return line === null ? null : gradeLineText(line);
  },
  gate_link: (report) => href(gateLineTarget(report)),
  gate_link_rows: (report) => rows(report, gateLineTarget(report)),
  state_lines: (report) => stateLines(report).map(stateLineText),
  waffle_caption: waffleCaption,
  lead_scope: (report) => (report.packages_flagged === 0 ? null : leadScope(report).join(" · ")),
  grade_chips: (report) => gradeChips(report).map(({ grade, count }) => `${grade} ${count}`),
  waffle: (report) =>
    report.packages_checked === 0
      ? []
      : waffleRuns(report).map(({ verdict, label, mark, count }) => ({ verdict, word: label, mark, count })),
  ready,
  security,
  weighs_most: weighs,
  flags_notes: (report) =>
    [
      multiFlagLine(report),
      report.packages_flagged === 0 ? null : abandonedNote(report),
      acceptedLine(report),
    ].filter((line) => line !== null),
  exposure,
  depth: (report) => ({
    rows: depthRows(report).map(({ label, flagged }) => `${label} ${flagged}`),
    sentence: depthSentence(report),
  }),
  libyears,
  findings_groups: findingsGroups,
  findings_rows: (report) => findingsRowsOf(report),
  ready_count: readyCount,
  gate_partition: gatePartition,
  data_caption: dataCaption,
  data_column: showsDataColumn,
  signals_key: (report) => signalKey(report.findings).map(({ id, name }) => `${id} ${name}`),
  advisory_groups: advisoryGroupNotes,
  run_notes: runNotes,
  php_rows: windowRows,
};

/** The sheet's move cards of the packages that the golden names, in the `moves` block shape. */
function sheetMoves(report: Report2, packages: readonly string[]): unknown {
  return Object.fromEntries(
    report.findings
      .filter((f) => packages.includes(f.package))
      .map((f) => [f.package, blockGolden("moves", f, report.run, null)]),
  );
}
function abandonedNote(report: Report2): string | null {
  return report.abandoned.total > 0
    ? OVERVIEW_WORDS.abandoned(report.abandoned.total, report.abandoned.with_replacement)
    : null;
}

function findingsRowsOf(report: Report2): unknown {
  const graded: readonly string[] = report.run.graded_verdicts;
  return report.findings
    .filter((f) => graded.includes(f.verdict))
    .sort((a, b) => a.rank - b.rank)
    .map((f) => findingsRowFacts(f, report.run));
}

const cases = pageGoldens().flatMap(({ id, golden, report }) =>
  Object.keys(FIELDS).map((field) => ({
    id,
    field,
    golden: (golden as unknown as Record<string, unknown>)[field],
    report,
  })),
);

describe("every page-golden field equals lockrot's page golden (SPEC §7.9.14)", () => {
  test("the pinned goldens hold every field", () => {
    for (const { golden } of pageGoldens()) {
      expect(Object.keys(golden)).toEqual(expect.arrayContaining(Object.keys(FIELDS)));
    }
  });

  test.each(cases)("$id: $field", ({ field, golden, report }) => {
    expect(FIELDS[field]?.(report)).toEqual(golden);
  });

  test.each(pageGoldens())("$id: sheet_holders and sheet_ladder", ({ golden, report }) => {
    const { sheet_holders: holders, sheet_ladder: ladder } = golden as unknown as Record<
      "sheet_holders" | "sheet_ladder",
      Record<string, unknown>
    >;
    const block = (key: "held_by" | "security", pkg: string): unknown => {
      const finding = report.findings.find((f) => f.package === pkg);
      if (finding === undefined) throw new Error(`no finding ${pkg}`);
      return blockGolden(key, finding, report.run, pageGoldenMetadata(golden.document, pkg));
    };

    expect(Object.fromEntries(Object.keys(holders).map((pkg) => [pkg, block("held_by", pkg)]))).toEqual(
      holders,
    );
    expect(
      Object.fromEntries(
        Object.keys(ladder).map((pkg) => [pkg, (block("security", pkg) as { ladder: unknown }).ladder]),
      ),
    ).toEqual(ladder);
  });

  test.each(pageGoldens())("$id: sheet_moves", ({ golden, report }) => {
    const expected = (golden as unknown as { sheet_moves: Record<string, unknown> }).sheet_moves;

    expect(sheetMoves(report, Object.keys(expected))).toEqual(expected);
  });

  test("sheet_moves covers the four check lines of SPEC §7.9.21", () => {
    const lines = pageGoldens().flatMap(({ golden }) =>
      Object.values((golden as unknown as { sheet_moves: Record<string, GoldenCard[]> }).sheet_moves).flatMap(
        (cards) => cards.flatMap((card) => card.after?.conditions ?? []),
      ),
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        "checked with Composer",
        "Composer refuses the move",
        "if Composer resolves it (not checked: a package it needs could not be loaded)",
        "if Composer resolves it (not checked: Composer's solver refuses the lock itself at the target PHP; see the PHP line in the Overview)",
      ]),
    );
  });
});

interface GoldenCard {
  after: { conditions: string[] } | null;
}

describe("the gate partition (SPEC §7.9.7)", () => {
  test.each(pageGoldens().filter(({ report }) => report.gate.fails))(
    "$id: ready, held and another way out sum to the root gate.failing",
    ({ report }) => {
      const partition = gatePartition(report);

      expect(partition).not.toBeNull();
      expect((partition?.ready ?? 0) + (partition?.held ?? 0) + (partition?.wayout ?? 0)).toBe(
        report.gate.failing,
      );
    },
  );
});
