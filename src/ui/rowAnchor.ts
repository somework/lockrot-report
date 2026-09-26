import { findRow } from "./keyboard";

/**
 * Keeps a row where the reader saw it while the list reflows under it (PD-ROWS-10, DESIGN.md §5).
 *
 * From 1181px up, opening a package puts the detail beside the list, and closing it gives the width
 * back (PD-ROWS-9). The Findings rows follow the list's width (PD-ROWS-4): one line on the full-width
 * list, two beside the detail. Every row above the one clicked grows or shrinks with that switch, so
 * a row thirty down slid 350-400px, off the bottom of the screen, on the very click that opened it.
 * The shell measures the row the action is about before dispatching it, and scrolls the page by
 * however far the row moved once the new layout is in, before the browser paints.
 */
export interface RowAnchor {
  readonly pkg: string;
  /** The row's top edge in the viewport, in CSS pixels. */
  readonly top: number;
}

/** Where `pkg`'s row sits now, or null with no package or no row for it on screen (another tab's
 *  package, or one the quiet note names that the list itself leaves out). */
export function measureRow(root: ParentNode, pkg: string | null): RowAnchor | null {
  if (pkg === null) return null;
  const row = findRow(root, pkg);

  return row === null ? null : { pkg, top: row.getBoundingClientRect().top };
}

/** How far the page has to scroll to put the anchored row back where it was measured: 0 when it
 *  did not move (a sheet over the page, a detail already open), or when it has no row any more. A
 *  sub-pixel move is left alone, so a rounding difference never scrolls the page. */
export function anchorShift(root: ParentNode, anchor: RowAnchor | null): number {
  if (anchor === null) return 0;
  const row = findRow(root, anchor.pkg);
  if (row === null) return 0;
  const shift = row.getBoundingClientRect().top - anchor.top;

  return Math.abs(shift) < 1 ? 0 : shift;
}
