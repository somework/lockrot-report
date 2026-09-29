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

/** Findings: the right end of the top line first, so the words stand in one column down the list;
 *  in two lines the age column, which spans both, has room above its bar as a last resort. */
export const FINDINGS_FIT: GateFit = {
  rows: "li.frow.has-gate",
  order: (width) =>
    width < TWO_LINES_FROM
      ? ["pkg", "why", "reach"]
      : width < ONE_LINE_FROM
        ? ["reach", "why", "pkg", "age"]
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

function fits(row: HTMLElement, height: number, spot: string): boolean {
  const box = row.getBoundingClientRect();
  if (box.height > height + 0.5) return false;
  const mark = row.querySelector(`.gate-at-${spot}`)?.getBoundingClientRect();
  return (
    mark !== undefined &&
    mark.width > 0 &&
    mark.left >= box.left - 0.5 &&
    mark.right <= box.right + 0.5 &&
    mark.bottom <= box.bottom + 0.5
  );
}

/**
 * Shows each row's gate words in the first place where they add no height and stay inside the row
 * (PD-GATE-3). Writes and reads are batched: one layout per place tried, not one per row.
 */
export function fitGateMarks(list: HTMLElement, fit: GateFit): void {
  const rows = [...list.querySelectorAll<HTMLElement>(fit.rows)];
  if (rows.length === 0) return;
  for (const row of rows) {
    row.dataset["gateAt"] = "none";
    row.removeAttribute("data-gate-tight");
  }
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  const whole = list.getBoundingClientRect().height;
  const order = fit.order(list.clientWidth);
  let pending = place(
    rows,
    heights,
    order,
    rows.map((_, i) => i),
  );
  // Without its separator the word is narrower; only a row with room nowhere else goes without it.
  for (const i of pending) rows[i]?.setAttribute("data-gate-tight", "");
  pending = place(rows, heights, order, pending);
  for (const i of pending) {
    const row = rows[i];
    if (row === undefined) continue;
    row.dataset["gateAt"] = "none";
    row.removeAttribute("data-gate-tight");
  }
  if (fit.table === true) unwiden(list, rows, whole);
}

/** Takes the widest words back out of a table until it is its own height again. */
function unwiden(list: HTMLElement, rows: readonly HTMLElement[], whole: number): void {
  if (list.getBoundingClientRect().height <= whole + 0.5) return;
  const placed = rows
    .filter((row) => row.dataset["gateAt"] !== "none")
    .map((row) => ({
      row,
      width: row.querySelector(`.gate-at-${row.dataset["gateAt"] ?? ""}`)?.getBoundingClientRect().width ?? 0,
    }))
    .sort((a, b) => b.width - a.width);
  for (const { row } of placed) {
    row.dataset["gateAt"] = "none";
    if (list.getBoundingClientRect().height <= whole + 0.5) return;
  }
}

/** Tries each spot in turn for the rows still pending; returns the ones that found none. */
function place(
  rows: readonly HTMLElement[],
  heights: readonly number[],
  order: readonly string[],
  pending: readonly number[],
): readonly number[] {
  let left = pending;
  for (const spot of order) {
    for (const i of left) {
      const row = rows[i];
      if (row !== undefined) row.dataset["gateAt"] = spot;
    }
    left = left.filter((i) => {
      const row = rows[i];
      return row === undefined || !fits(row, heights[i] ?? 0, spot);
    });
  }
  return left;
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
