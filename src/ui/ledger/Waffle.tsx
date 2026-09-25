import { toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { wafflePadding, waffleRows, type WaffleRun } from "../../domain/summary";

/**
 * The most squares one waffle row may hold at each of ledger.css's four waffle widths. The square
 * itself never changes size within a width, so two reports compare at the same scale; a bigger
 * lock grows more rows instead. Each budget is what fits beside (or, on a phone, under) the answer
 * at the narrowest viewport of its range: 26 × 11px under 760px, 26 × 12px to 1180px, 38 × 17px
 * to 1439px, 50 × 17px from 1440px.
 */
const COLUMNS = { narrow: 26, mid: 26, wide: 38, xwide: 50 } as const;
type Budget = keyof typeof COLUMNS;
const BUDGETS = Object.keys(COLUMNS) as Budget[];

/**
 * One square per package the run checked: the flagged ones first, most urgent first, each in its
 * priority's tone, then every other package in a quiet fill. Filled column by column (ledger.css),
 * so it reads left to right like a stacked bar whose units can still be counted — three critical
 * packages are three squares, not a sliver.
 *
 * The last, partial column fills from the bottom: each width gets its own blank pads, placed just
 * before that column and shown only at that width (`waffle-pad-*`, ledger.css), since each width
 * has its own row count.
 *
 * `aria-hidden`: the figure and the chips beside it say every number this draws, in words. Tones
 * are classes and the only inline styles are the row counts, numbers (DESIGN.md §1.3).
 */
export function Waffle({ runs, total }: { runs: readonly WaffleRun[]; total: number }) {
  const flagged = runs.reduce((sum, run) => sum + run.count, 0);
  const squares = Math.max(total, flagged);
  const tones = runs.flatMap((run) => Array.from({ length: run.count }, () => toneClass(TONE(run.priority))));
  const rows = Object.fromEntries(BUDGETS.map((b) => [b, waffleRows(squares, COLUMNS[b])])) as Record<
    Budget,
    number
  >;
  const pads = BUDGETS.map((budget) => ({ budget, ...wafflePadding(squares, rows[budget]) }));

  const cells = Array.from({ length: squares }, (_, index) => {
    const before = pads
      .filter((pad) => pad.at === index && pad.pads > 0)
      .flatMap((pad) =>
        Array.from({ length: pad.pads }, (_, n) => (
          <i key={`pad-${pad.budget}-${n}`} className={`waffle-pad waffle-pad-${pad.budget}`} />
        )),
      );
    const tone = tones[index];
    const cell = (
      <i
        key={`cell-${index}`}
        className={tone === undefined ? "waffle-cell waffle-rest" : `waffle-cell ${tone}`}
      />
    );

    return before.length > 0 ? [...before, cell] : [cell];
  }).flat();

  return (
    <div
      className={flagged === 0 ? "waffle is-clean" : "waffle"}
      aria-hidden="true"
      style={{
        "--rows-narrow": String(rows.narrow),
        "--rows-mid": String(rows.mid),
        "--rows-wide": String(rows.wide),
        "--rows-xwide": String(rows.xwide),
      }}
    >
      {cells}
    </div>
  );
}
