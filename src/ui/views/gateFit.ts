import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** Where a list's rows carry copies of their gate words, and the order to try them in. */
export interface GateFit {
  readonly rows: string;
  readonly order: (listWidth: number) => readonly string[];
  /** A table's columns take the width of their widest cell, so words in one row can grow another. */
  readonly table?: boolean;
}

/** ledger-rows.css switches from three lines to two at this list width. */
const TWO_LINES_FROM = 480;

/** ledger-rows.css puts a row on one line from this list width. */
const ONE_LINE_FROM = 990;

/** Findings: one place per layout, so the words stand in one column down the list (the top line's
 *  end, the age column's top, the Reached column); the others only for a row with no room there. */
export const FINDINGS_FIT: GateFit = {
  rows: "li.frow.has-gate",
  order: (width) =>
    width < TWO_LINES_FROM
      ? ["pkg", "reach", "why"]
      : width < ONE_LINE_FROM
        ? ["age", "reach", "why", "pkg"]
        : ["reach", "why", "pkg"],
};

/** packages.css stacks a row on two lines under this list width. */
const PACKAGES_STACKED_UNDER = 1000;

/** All packages: after the way in, where the Reached column is; stacked, after a verdict short
 *  enough to leave room (an unflagged `ok`); then after the name. */
export const PACKAGES_FIT: GateFit = {
  rows: "tr.pk-row.has-gate",
  order: (width) => (width < PACKAGES_STACKED_UNDER ? ["reach", "verdict", "name"] : ["reach", "name"]),
  table: true,
};

function inside(inner: DOMRect, outer: DOMRect): boolean {
  return (
    inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5
  );
}

/** Below a layout unit: two measures of the same layout differ by no more. */
const HEIGHT_NOISE = 0.01;

function fits(row: HTMLElement, height: number, spot: string): boolean {
  const box = row.getBoundingClientRect();
  // A place that rewraps the row's other words can make it shorter as well as taller.
  if (Math.abs(box.height - height) > HEIGHT_NOISE) return false;
  const mark = row.querySelector(`.gate-at-${spot}`)?.getBoundingClientRect();
  if (mark === undefined || mark.width === 0 || !inside(mark, box)) return false;
  // Over the age column the words must not run into the reason beside it.
  const age = spot === "age" ? row.querySelector(".fc-age")?.getBoundingClientRect() : undefined;
  if (age !== undefined && !inside(mark, age)) return false;
  return !overflowsCell(row, spot);
}

/** A stacked table row's cells are grid items that do not grow with their words, so words wider
 *  than their cell run over the one beside it; a table's own cells widen instead. */
function overflowsCell(row: HTMLElement, spot: string): boolean {
  if (row.tagName !== "TR" || getComputedStyle(row).display !== "grid") return false;
  const cell = row.querySelector(`.gate-at-${spot}`)?.closest("td");
  // Both widths are rounded to whole pixels.
  return cell != null && cell.scrollWidth > cell.clientWidth + 1;
}

interface Way {
  readonly tight: boolean;
  readonly short: boolean;
}

/** How a place is tried, fullest first: with the words' reason and the separator before them, then
 *  without the separator, then the same without the reason. */
const WAYS: readonly Way[] = [
  { tight: false, short: false },
  { tight: true, short: false },
  { tight: false, short: true },
  { tight: true, short: true },
];

/** Every row without its reason: the words then read the same down the list. */
const SHORT_WAYS: readonly Way[] = WAYS.filter((way) => way.short);

function reset(row: HTMLElement): void {
  row.dataset["gateAt"] = "none";
  row.removeAttribute("data-gate-tight");
  row.removeAttribute("data-gate-short");
}

/** Shows each row's gate words in the first place where they add no height and stay inside the row
 *  (PD-GATE-3): each place in every way (`WAYS`) before the next. A reason shown on some rows and
 *  not on others would read as two kinds of failing, so unless every row carries it, none does. */
export function fitGateMarks(list: HTMLElement, fit: GateFit): void {
  const rows = [...list.querySelectorAll<HTMLElement>(fit.rows)];
  if (rows.length === 0) return;
  for (const row of rows) reset(row);
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  const whole = list.getBoundingClientRect().height;
  const order = fit.order(list.clientWidth);
  const table = { list, whole, order, table: fit.table === true };
  fitWith(rows, heights, table, WAYS);
  const reasoned = rows.filter((row) => hasWhy(row));
  const allLong = reasoned.every(
    (row) => row.dataset["gateAt"] !== "none" && !row.hasAttribute("data-gate-short"),
  );
  if (allLong) return;
  // Short words everywhere find room in more rows than a mix: a long word left widening a column
  // squeezes the rows beside it.
  for (const row of rows) reset(row);
  fitWith(rows, heights, table, SHORT_WAYS);
}

interface Table {
  readonly list: HTMLElement;
  readonly whole: number;
  readonly order: readonly string[];
  readonly table: boolean;
}

function fitWith(
  rows: readonly HTMLElement[],
  heights: readonly number[],
  { list, whole, order, table }: Table,
  ways: readonly Way[],
): void {
  placeFrom(
    rows,
    heights,
    order,
    rows.map((_, i) => i),
    ways,
  );
  if (table) {
    unwiden(list, rows, heights, whole, order, ways);
    refill(list, rows, heights, whole, order, ways);
  }
}

function placeFrom(
  rows: readonly HTMLElement[],
  heights: readonly number[],
  spots: readonly string[],
  indices: readonly number[],
  ways: readonly Way[],
): void {
  let pending = indices;
  for (const spot of spots) {
    for (const way of ways) {
      // A row whose words carry no reason has nothing to shorten.
      const tried = way.short ? pending.filter((i) => hasWhy(rows[i])) : pending;
      // Words that did not fit leave the row, so they widen no column while the others are measured.
      for (const i of pending) {
        const row = rows[i];
        if (row !== undefined && !tried.includes(i)) reset(row);
      }
      const failed = new Set(place(rows, heights, spot, way.tight, way.short, tried));
      pending = pending.filter((i) => !tried.includes(i) || failed.has(i));
    }
  }
  for (const i of pending) {
    const row = rows[i];
    if (row !== undefined) reset(row);
  }
}

function hasWhy(row: HTMLElement | undefined): boolean {
  return row?.querySelector(".gate-mark-why") != null;
}

/** A column is as wide as its widest cell, so words that grow a table grow it for every row in
 *  their column: while the table is taller than its own height, a whole column's words drop their
 *  reason, then move on to the next place together. */
function unwiden(
  list: HTMLElement,
  rows: readonly HTMLElement[],
  heights: readonly number[],
  whole: number,
  order: readonly string[],
  ways: readonly Way[],
): void {
  for (let k = 0; k < order.length; k++) {
    if (list.getBoundingClientRect().height <= whole + 0.5) return;
    const spot = order[k];
    const long = rows.filter((row) => row.dataset["gateAt"] === spot && !row.hasAttribute("data-gate-short"));
    const reasoned = long.filter((row) => hasWhy(row));
    for (const row of reasoned) row.setAttribute("data-gate-short", "");
    if (reasoned.length > 0 && list.getBoundingClientRect().height <= whole + 0.5) return;
    const moved = rows.flatMap((row, i) => (row.dataset["gateAt"] === spot ? [i] : []));
    if (moved.length > 0) placeFrom(rows, heights, order.slice(k + 1), moved, ways);
  }
}

/** Words that moved on can widen the column they moved to, which makes room there for rows that had
 *  none: those rows try the places still in use, and keep them only while the table keeps its
 *  height. */
function refill(
  list: HTMLElement,
  rows: readonly HTMLElement[],
  heights: readonly number[],
  whole: number,
  order: readonly string[],
  ways: readonly Way[],
): void {
  const used = new Set(rows.map((row) => row.dataset["gateAt"]));
  const spots = order.filter((spot) => used.has(spot));
  const bare = rows.flatMap((row, i) => (row.dataset["gateAt"] === "none" ? [i] : []));
  if (spots.length === 0 || bare.length === 0) return;
  placeFrom(rows, heights, spots, bare, ways);
  if (list.getBoundingClientRect().height <= whole + 0.5) return;
  for (const i of bare) {
    const row = rows[i];
    if (row !== undefined) reset(row);
  }
}

/** Tries one place for the rows still pending, all written before any is measured; returns the
 *  ones it did not fit. */
function place(
  rows: readonly HTMLElement[],
  heights: readonly number[],
  spot: string,
  tight: boolean,
  short: boolean,
  pending: readonly number[],
): readonly number[] {
  for (const i of pending) {
    const row = rows[i];
    if (row === undefined) continue;
    row.dataset["gateAt"] = spot;
    row.toggleAttribute("data-gate-tight", tight);
    row.toggleAttribute("data-gate-short", short);
  }
  return pending.filter((i) => {
    const row = rows[i];
    return row === undefined || !fits(row, heights[i] ?? 0, spot);
  });
}

/** Refits after every render of the list and whenever its width changes. */
export function useGateFit<T extends HTMLElement>(fit: GateFit, given?: RefObject<T>): RefObject<T> {
  const own = useRef<T>(null);
  const ref = given ?? own;
  const watched = useRef<{ list: HTMLElement; observer: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (list !== null) fitGateMarks(list, fit);
    if (watched.current?.list === list) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (list === null || typeof ResizeObserver === "undefined") return;
    let width = list.clientWidth;
    const observer = new ResizeObserver(() => {
      if (list.clientWidth === width) return;
      width = list.clientWidth;
      fitGateMarks(list, fit);
    });
    observer.observe(list);
    watched.current = { list, observer };
  });
  useLayoutEffect(
    () => () => {
      watched.current?.observer.disconnect();
    },
    [],
  );
  return ref;
}
