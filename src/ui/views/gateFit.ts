import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** A cell of a Findings row that can carry the row's gate mark (FindingRow.tsx, gate.css). */
export type GateSpot = "pkg" | "why" | "reach";

/** ledger-rows.css switches from three lines to two at this list width. */
const TWO_LINES_FROM = 480;
const PHONE: readonly GateSpot[] = ["pkg", "why", "reach"];
const WIDER: readonly GateSpot[] = ["reach", "why", "pkg"];

function fits(row: HTMLElement, height: number, spot: GateSpot): boolean {
  const box = row.getBoundingClientRect();
  if (box.height > height + 0.5) return false;
  const mark = row.querySelector(`.gate-at-${spot}`)?.getBoundingClientRect();
  return mark !== undefined && mark.width > 0 && mark.left >= box.left - 0.5 && mark.right <= box.right + 0.5;
}

/**
 * Puts each row's gate mark in the first of its cells where it adds no height and stays inside the
 * row (PD-GATE-3); a row with room nowhere keeps the mark on its verdict. Writes and reads are
 * batched, so a list costs one layout per place tried, not one per row.
 */
export function fitGateMarks(list: HTMLElement): void {
  const rows = [...list.querySelectorAll<HTMLElement>("li.frow.has-gate")];
  if (rows.length === 0) return;
  const order = list.clientWidth < TWO_LINES_FROM ? PHONE : WIDER;
  for (const row of rows) row.dataset["gateAt"] = "none";
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  let pending = rows.map((_, i) => i);
  for (const spot of order) {
    for (const i of pending) {
      const row = rows[i];
      if (row !== undefined) row.dataset["gateAt"] = spot;
    }
    pending = pending.filter((i) => {
      const row = rows[i];
      return row === undefined || !fits(row, heights[i] ?? 0, spot);
    });
  }
  for (const i of pending) {
    const row = rows[i];
    if (row !== undefined) row.dataset["gateAt"] = "none";
  }
}

/** Refits after every render of the list and whenever its width changes. */
export function useGateFit(): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const watched = useRef<{ list: HTMLElement; observer: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (list !== null) fitGateMarks(list);
    if (watched.current?.list === list) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (list === null || typeof ResizeObserver === "undefined") return;
    let width = list.clientWidth;
    const observer = new ResizeObserver(() => {
      if (list.clientWidth === width) return;
      width = list.clientWidth;
      fitGateMarks(list);
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
