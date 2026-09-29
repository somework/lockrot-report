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

function fits(row: HTMLElement, height: number, spot: string): boolean {
  const box = row.getBoundingClientRect();
  if (box.height > height + 0.5) return false;
  const mark = row.querySelector(`.gate-at-${spot}`)?.getBoundingClientRect();
  if (mark === undefined || mark.width === 0 || !inside(mark, box)) return false;
  // Over the age column the words must not run into the reason beside it.
  const age = spot === "age" ? row.querySelector(".fc-age")?.getBoundingClientRect() : undefined;
  return age === undefined || inside(mark, age);
}

/** Shows each row's gate words in the first place where they add no height and stay inside the row
 *  (PD-GATE-3): each place with its separator, then without, before the next. */
export function fitGateMarks(list: HTMLElement, fit: GateFit): void {
  const rows = [...list.querySelectorAll<HTMLElement>(fit.rows)];
  if (rows.length === 0) return;
  for (const row of rows) {
    row.dataset["gateAt"] = "none";
    row.removeAttribute("data-gate-tight");
  }
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  const whole = list.getBoundingClientRect().height;
  let pending: readonly number[] = rows.map((_, i) => i);
  for (const spot of fit.order(list.clientWidth)) {
    pending = place(rows, heights, spot, false, pending);
    pending = place(rows, heights, spot, true, pending);
  }
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

/** Tries one place for the rows still pending, all written before any is measured; returns the
 *  ones it did not fit. */
function place(
  rows: readonly HTMLElement[],
  heights: readonly number[],
  spot: string,
  tight: boolean,
  pending: readonly number[],
): readonly number[] {
  for (const i of pending) {
    const row = rows[i];
    if (row === undefined) continue;
    row.dataset["gateAt"] = spot;
    row.toggleAttribute("data-gate-tight", tight);
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
