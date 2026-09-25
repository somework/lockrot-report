/**
 * Which list row sits in the page's Tab order (PD-ROWS-11, DESIGN.md §5): one, a roving tabindex.
 *
 * Every row used to carry `tabindex="0"`, and each Findings row a signal-id link besides, so Tab
 * walked two stops per package — 400 on a large lock — before it reached the open package's detail.
 * Now one row is the list's Tab stop: the open package's, else the one last opened (Escape just
 * closed it and handed it focus), else the first. `j`/`k` move between rows, and each row stays
 * focusable by click and by script (`tabindex="-1"`). The links and controls inside a row join the
 * Tab order only on that one row, so Tab from it goes to its own links and then leaves the list.
 *
 * A package listed twice (an Advisories package under two advisories, a Blast radius package under
 * two direct requirements) is the Tab stop on each of its rows; the rows name the same package.
 */

/** The package whose row is the list's Tab stop, or null when the view draws no rows. */
export function pickCursor(
  rendered: readonly string[],
  selected: string | null,
  lastOpened: string | null,
): string | null {
  if (selected !== null && rendered.includes(selected)) return selected;
  if (lastOpened !== null && rendered.includes(lastOpened)) return lastOpened;

  return rendered[0] ?? null;
}

/** A row's own `tabIndex`: 0 for the Tab stop, -1 (focusable, never tabbed to) for the rest. */
export function rowTabIndex(pkg: string, cursor: string | null): 0 | -1 {
  return pkg === cursor ? 0 : -1;
}

/** The `tabIndex` of a link or control inside a row: left alone on the Tab stop's row, -1 on every
 *  other row, so Tab never walks a link per row. A click still reaches it. */
export function innerTabIndex(pkg: string, cursor: string | null): -1 | undefined {
  return pkg === cursor ? undefined : -1;
}
