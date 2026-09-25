import { toneClass } from "../common/common";
import { TONE } from "../../domain/vocab";
import { waffleRows, type WaffleRun } from "../../domain/summary";

/**
 * The most squares one waffle row may hold at each of ledger.css's three waffle widths. The square
 * itself never changes size within a width, so two reports compare at the same scale; a bigger
 * lock grows more rows instead. Each budget is what fits the narrowest viewport of its range:
 * 26 × 11px under 760px (288px at 320), 34 × 17px up to 1399px (the lead's stacked or right-hand
 * column), 46 × 17px from 1400px (so a mid-sized lock fills the band instead of leaving a gap).
 */
const COLUMNS = { narrow: 26, mid: 34, wide: 46 } as const;

/**
 * One square per package the run checked: the flagged ones first, most urgent first, each in its
 * priority's tone, then every other package in a quiet fill. Filled column by column
 * (ledger.css), so it reads left to right like a stacked bar whose units can still be counted —
 * three critical packages are three squares, not a sliver.
 *
 * `aria-hidden`: the figure and the chips beside it say every number this draws, in words. Tones
 * are classes and the only inline style is the row count, a number (DESIGN.md §1.3).
 */
export function Waffle({ runs, total }: { runs: readonly WaffleRun[]; total: number }) {
  const flagged = runs.reduce((sum, run) => sum + run.count, 0);
  const rest = Math.max(0, total - flagged);
  const cells = runs.flatMap((run) =>
    Array.from({ length: run.count }, (_, index) => (
      <i key={`${run.priority}-${index}`} className={`waffle-cell ${toneClass(TONE(run.priority))}`} />
    )),
  );
  const quiet = Array.from({ length: rest }, (_, index) => (
    <i key={`rest-${index}`} className="waffle-cell waffle-rest" />
  ));
  const squares = flagged + rest;

  return (
    <div
      className={flagged === 0 ? "waffle is-clean" : "waffle"}
      aria-hidden="true"
      style={{
        "--rows-narrow": String(waffleRows(squares, COLUMNS.narrow)),
        "--rows-mid": String(waffleRows(squares, COLUMNS.mid)),
        "--rows-wide": String(waffleRows(squares, COLUMNS.wide)),
      }}
    >
      {cells}
      {quiet}
    </div>
  );
}
