/**
 * The page's keyboard shortcuts as one decision: given what was pressed and where, what should
 * happen. Ported from legacy report.js:1021-1049 (js-4.md §8), with the fixes DESIGN.md §5 lists:
 *
 * - M5: Enter or Space on a link (or any other control) inside a row is left to that control;
 *   only a keypress on the row itself opens its detail — and, like a click, never closes the package
 *   that is already open (PD-ROWS-7); Escape does that.
 * - M7/M8/M9: `j`/`k` walk the rows the current view has on screen, in the order it shows them,
 *   starting from the row that holds focus, else the open package. The legacy page kept a separate
 *   cursor over a list that could differ from the rows drawn, and could open a package that had no
 *   row at all.
 * - PD-ROWS-11: focus follows the selection. `j`/`k` move from the focused row, so after Escape
 *   hands focus back to a row, `j` continues below it instead of restarting at the top; and Escape
 *   pressed in a text field closes the detail without pulling focus out of the field. A package
 *   listed on two rows (Advisories, Blast radius) is walked row by row, by position, not by name.
 * - PD-ROWS-12: while the detail is a sheet over the whole page, the list under it is out of reach,
 *   so `/` closes the sheet on its way to the search box, and a second Escape from the search box
 *   hands focus to the list's row instead of dropping it on the page.
 * - M10: nothing but Escape acts while the glossary is open; the legacy page kept moving the
 *   selection behind it.
 * - PD-GLOSSARY-6, PD-SUMMARY-4: an open popover (a verdict pill's, the header's gate fact) eats
 *   Escape before the glossary and the detail do, so closing the popover never also closes what
 *   sits underneath it.
 *
 * `decideKey` reads no DOM and changes nothing, so every rule is a unit test. `keyInputFrom` is the
 * thin adapter from a real KeyboardEvent, and `findRow` the one DOM lookup the shell needs.
 */

export interface KeyInput {
  key: string;
  /** Ctrl, Meta or Alt held: a browser or OS shortcut, never one of the page's. */
  modified: boolean;
  /** Focus is in a text field, so a printable key is text being typed. */
  typing: boolean;
  /** Focus is in the page's search box, the one field Escape blurs. */
  searchFocused: boolean;
  dialogOpen: boolean;
  /** A native popover (`popover="auto"`: a verdict pill's definition, PD-GLOSSARY-4, or the
   *  header's gate fact, PD-SUMMARY-2) is open. Escape leaves it to the browser's own light-dismiss
   *  instead of also closing what sits underneath — `decideEscape` returning `ignore` here matters
   *  as much as what it returns: `prevents()` then stays false, so the keydown's default action is
   *  never cancelled and the native dismissal still runs. */
  popoverOpen: boolean;
  /** `data-pkg` of the row the key was pressed in, or null outside any row. */
  rowPkg: string | null;
  /** That row's position among the view's rows (`listRows`), or null outside any row. Only read for
   *  `j`/`k`: it tells two rows of the same package apart. */
  rowIndex: number | null;
  /** The key landed on a link, button or field inside that row, which has its own Enter/Space. */
  onControl: boolean;
  /** The open package, or null. */
  selected: string | null;
  /** The rows of the current view, in screen order. Only read for `j`/`k`. */
  rendered: readonly string[];
  /** The detail is a sheet over the whole page (below the wide layout), so nothing under it can
   *  take focus (PD-ROWS-12). */
  sheetOpen: boolean;
  /** The current tab draws the search box. */
  searchAvailable: boolean;
}

export type KeyDecision =
  | { type: "ignore" }
  | { type: "openRow"; pkg: string }
  /** `index` is the position of the row to move to among the view's rows. */
  | { type: "move"; pkg: string; index: number }
  /** `closeDetail`: the sheet covering the search box closes first (PD-ROWS-12). */
  | { type: "focusSearch"; closeDetail: boolean }
  | { type: "openGlossary" }
  | { type: "closeGlossary" }
  /** `restore` is the row to hand focus back to, or null to leave focus where it is (a text field). */
  | { type: "closeDetail"; restore: string | null }
  | { type: "blurSearch" };

const IGNORE: KeyDecision = { type: "ignore" };

export function decideKey(input: KeyInput): KeyDecision {
  if (input.modified) return IGNORE;
  if (input.key === "Escape") return decideEscape(input);
  if (input.dialogOpen) return IGNORE;

  if (input.key === "Enter" || input.key === " ") {
    if (input.rowPkg === null || input.onControl || input.typing) return IGNORE;
    return { type: "openRow", pkg: input.rowPkg };
  }
  if (input.typing) return IGNORE;
  if (input.key === "?") return { type: "openGlossary" };
  if (input.key === "/") return decideSlash(input);
  if (input.key === "j" || input.key === "k") return decideMove(input, input.key === "j" ? 1 : -1);

  return IGNORE;
}

/** Escape closes one thing per press, the topmost first: an open popover, then the glossary, then
 *  the detail, then search focus — which the shell hands to the list's row (PD-ROWS-12). The popover is topmost of all — a pill's can be open over the
 *  detail, over the glossary, or over neither — and closes by the browser's own doing, not a
 *  dispatch (PD-GLOSSARY-6, PD-SUMMARY-4). */
function decideEscape(input: KeyInput): KeyDecision {
  if (input.popoverOpen) return IGNORE;
  if (input.dialogOpen) return { type: "closeGlossary" };
  // Escape typed in the search box closes the detail but leaves the caret where it is: pulling focus
  // out to a row would steal it from the field the reader is typing in (PD-ROWS-11).
  if (input.selected !== null) return { type: "closeDetail", restore: input.typing ? null : input.selected };
  if (input.searchFocused) return { type: "blurSearch" };

  return IGNORE;
}

/** `/` goes to the search box. With a sheet over the page the box is under it, so the sheet closes
 *  first rather than focus landing on a field nobody can see (PD-ROWS-12). */
function decideSlash(input: KeyInput): KeyDecision {
  if (!input.sheetOpen) return { type: "focusSearch", closeDetail: false };
  if (!input.searchAvailable) return IGNORE;

  return { type: "focusSearch", closeDetail: true };
}

/**
 * The next row from where the reader is, clamped at both ends: the row that holds focus (the key
 * landed in it) when it is one of the view's rows, else the open package. Focus and the open package
 * agree after every `j`/`k`, click and Enter; they part only once Escape closes the detail and hands
 * focus back to its row, and `j` then continues from that row rather than from the top (PD-ROWS-11).
 * With neither on screen (filtered out, or on another tab's list), both keys start at the first
 * row, as the legacy cursor did from -1.
 *
 * The focused row is placed by its position, not its name: a package Advisories lists under two
 * advisories used to send `j` from its second row back to its first (the first match by name), so
 * `j` could never walk past it.
 */
function decideMove(input: KeyInput, step: 1 | -1): KeyDecision {
  const count = input.rendered.length;
  if (count === 0) return IGNORE;
  const at = focusedAt(input) ?? (input.selected === null ? -1 : input.rendered.indexOf(input.selected));
  const next = at < 0 ? 0 : Math.min(count - 1, Math.max(0, at + step));
  const pkg = input.rendered[next];

  return pkg === undefined ? IGNORE : { type: "move", pkg, index: next };
}

/** The focused row's position, when the key landed on one of the view's rows; else null. */
function focusedAt(input: KeyInput): number | null {
  if (input.rowPkg === null) return null;
  if (input.rowIndex !== null && input.rendered[input.rowIndex] === input.rowPkg) return input.rowIndex;
  const at = input.rendered.indexOf(input.rowPkg);

  return at < 0 ? null : at;
}

/**
 * Whether the browser's own handling of the key should be cancelled. Blurring the search box keeps
 * the native Escape (which also clears a search field, as it did on the legacy page); everything
 * else the page acts on is the page's alone. Space on a row would otherwise scroll the page.
 */
export function prevents(decision: KeyDecision): boolean {
  return decision.type !== "ignore" && decision.type !== "blurSearch";
}

const CONTROLS = "a[href], button, input, select, textarea, summary, [contenteditable]";
const TEXT_FIELDS = "input, select, textarea, [contenteditable]";

export interface KeyContext {
  search: HTMLInputElement | null;
  dialogOpen: boolean;
  selected: string | null;
  /** Called only for `j`/`k`, so the rendered order is not recomputed on every keystroke typed. */
  rendered: () => readonly string[];
  sheetOpen: boolean;
}

/** Whether any native popover (a verdict pill's, Header's gate fact) is currently open. Read from the DOM, not
 *  application state: `popover="auto"` opens and closes without either (DESIGN.md §8). Guarded
 *  the same way `useHeaderHeight` guards `ResizeObserver` — an engine that does not know the
 *  `:popover-open` pseudo-class must read as "no popover open", never throw out of a keydown
 *  handler. */
function hasOpenPopover(): boolean {
  try {
    return document.querySelector(":popover-open") !== null;
  } catch {
    return false;
  }
}

/**
 * The shortcut a key press means, read from the physical key where the layout would hide it: on a
 * Russian (or any non-Latin) layout the J key reports `key: "о"`, and with Caps Lock on it reports
 * `"J"`, so matching `event.key` alone left `j`/`k` dead for those readers. `/` and `?` sit on the
 * Slash key only on a US-style layout, so their own `key` still counts wherever the layout puts
 * them. Shift+J stays unmapped: only Caps Lock's capital (no Shift held) is read as `j`.
 */
export function shortcutKey(event: Pick<KeyboardEvent, "key" | "code" | "shiftKey">): string {
  if (event.key === "j" || event.key === "k" || event.key === "/" || event.key === "?") return event.key;
  if (!event.shiftKey && event.code === "KeyJ") return "j";
  if (!event.shiftKey && event.code === "KeyK") return "k";
  if (event.code === "Slash") return event.shiftKey ? "?" : "/";

  return event.key;
}

/** Reads a KeyboardEvent and the page around it into a `KeyInput`. */
export function keyInputFrom(event: KeyboardEvent, context: KeyContext): KeyInput {
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest("[data-pkg]") ?? null;
  const control = target?.closest(CONTROLS) ?? null;
  const active = document.activeElement;
  const key = shortcutKey(event);

  return {
    key,
    modified: event.ctrlKey || event.metaKey || event.altKey,
    typing: target?.closest(TEXT_FIELDS) != null,
    searchFocused: context.search !== null && active === context.search,
    dialogOpen: context.dialogOpen,
    // Read fresh on each Escape rather than tracked in Preact state: the browser opens and closes a
    // `popover="auto"` natively, without a dispatch either way. Only Escape reads it.
    popoverOpen: event.key === "Escape" && hasOpenPopover(),
    rowPkg: row?.getAttribute("data-pkg") ?? null,
    rowIndex: row !== null && (key === "j" || key === "k") ? rowPosition(document, row) : null,
    // A control that contains the row is not "inside" it; a row that is itself a control is, since
    // its native activation already fires its click.
    onControl: control !== null && (row === null || row.contains(control)),
    selected: context.selected,
    rendered: key === "j" || key === "k" ? context.rendered() : [],
    sheetOpen: context.sheetOpen,
    searchAvailable: context.search !== null,
  };
}

/**
 * The element carrying `data-pkg` equal to `pkg`, first in document order. Compared attribute by
 * attribute rather than through a built selector: a package name is document data, and a `\` or
 * `[` in one would make `querySelector` throw (history.md §4).
 */
export function findRow(root: ParentNode, pkg: string): HTMLElement | null {
  for (const node of listRows(root)) {
    if (node.getAttribute("data-pkg") === pkg) return node;
  }

  return null;
}

/** The current view's rows, in document order — the order `renderedPackages` lists them in. A row
 *  inside a closed fold (`hidden`, Blast radius) is not on screen, so it is not one of them. */
export function listRows(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-pkg]")).filter(
    (node) => node.closest("[hidden]") === null,
  );
}

/** A row's position among the view's rows, or null when it is not one. */
export function rowPosition(root: ParentNode, row: Element): number | null {
  const at = listRows(root).indexOf(row as HTMLElement);

  return at < 0 ? null : at;
}

/** The row at `index` when it still shows `pkg`, else `pkg`'s first row: the row a `j` walked to,
 *  even when the same package has an earlier row too (PD-ROWS-11). */
export function rowAt(root: ParentNode, pkg: string, index: number | null): HTMLElement | null {
  const row = index === null ? undefined : listRows(root)[index];
  if (row?.getAttribute("data-pkg") === pkg) return row;

  return findRow(root, pkg);
}
