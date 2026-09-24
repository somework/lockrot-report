/**
 * The page's keyboard shortcuts as one decision: given what was pressed and where, what should
 * happen. Ported from legacy report.js:1021-1049 (js-4.md §8), with the fixes DESIGN.md §5 lists:
 *
 * - M5: Enter or Space on a link (or any other control) inside a row is left to that control;
 *   only a keypress on the row itself toggles its detail.
 * - M7/M8/M9: `j`/`k` walk the rows the current view has on screen, in the order it shows them,
 *   starting from the open package. The legacy page kept a separate cursor over a list that could
 *   differ from the rows drawn, and could open a package that had no row at all.
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
  /** The key landed on a link, button or field inside that row, which has its own Enter/Space. */
  onControl: boolean;
  /** The open package, or null. */
  selected: string | null;
  /** The rows of the current view, in screen order. Only read for `j`/`k`. */
  rendered: readonly string[];
}

export type KeyDecision =
  | { type: "ignore" }
  | { type: "toggleRow"; pkg: string | null }
  | { type: "move"; pkg: string }
  | { type: "focusSearch" }
  | { type: "openGlossary" }
  | { type: "closeGlossary" }
  | { type: "closeDetail"; restore: string }
  | { type: "blurSearch" };

const IGNORE: KeyDecision = { type: "ignore" };

export function decideKey(input: KeyInput): KeyDecision {
  if (input.modified) return IGNORE;
  if (input.key === "Escape") return decideEscape(input);
  if (input.dialogOpen) return IGNORE;

  if (input.key === "Enter" || input.key === " ") {
    if (input.rowPkg === null || input.onControl || input.typing) return IGNORE;
    return { type: "toggleRow", pkg: input.selected === input.rowPkg ? null : input.rowPkg };
  }
  if (input.typing) return IGNORE;
  if (input.key === "?") return { type: "openGlossary" };
  if (input.key === "/") return { type: "focusSearch" };
  if (input.key === "j" || input.key === "k") return decideMove(input, input.key === "j" ? 1 : -1);

  return IGNORE;
}

/** Escape closes one thing per press, the topmost first: an open popover, then the glossary, then
 *  the detail, then search focus. The popover is topmost of all — a pill's can be open over the
 *  detail, over the glossary, or over neither — and closes by the browser's own doing, not a
 *  dispatch (PD-GLOSSARY-6, PD-SUMMARY-4). */
function decideEscape(input: KeyInput): KeyDecision {
  if (input.popoverOpen) return IGNORE;
  if (input.dialogOpen) return { type: "closeGlossary" };
  if (input.selected !== null) return { type: "closeDetail", restore: input.selected };
  if (input.searchFocused) return { type: "blurSearch" };

  return IGNORE;
}

/**
 * The next row from the open package, clamped at both ends. With nothing open, or with the open
 * package not on screen (filtered out, or on another tab's list), both keys start at the first row,
 * as the legacy cursor did from -1.
 */
function decideMove(input: KeyInput, step: 1 | -1): KeyDecision {
  const count = input.rendered.length;
  if (count === 0) return IGNORE;
  const at = input.selected === null ? -1 : input.rendered.indexOf(input.selected);
  const next = at < 0 ? 0 : Math.min(count - 1, Math.max(0, at + step));
  const pkg = input.rendered[next];

  return pkg === undefined ? IGNORE : { type: "move", pkg };
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

/** Reads a KeyboardEvent and the page around it into a `KeyInput`. */
export function keyInputFrom(event: KeyboardEvent, context: KeyContext): KeyInput {
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest("[data-pkg]") ?? null;
  const control = target?.closest(CONTROLS) ?? null;
  const active = document.activeElement;

  return {
    key: event.key,
    modified: event.ctrlKey || event.metaKey || event.altKey,
    typing: target?.closest(TEXT_FIELDS) != null,
    searchFocused: context.search !== null && active === context.search,
    dialogOpen: context.dialogOpen,
    // Read fresh on each Escape rather than tracked in Preact state: the browser opens and closes a
    // `popover="auto"` natively, without a dispatch either way. Only Escape reads it.
    popoverOpen: event.key === "Escape" && hasOpenPopover(),
    rowPkg: row?.getAttribute("data-pkg") ?? null,
    // A control that contains the row is not "inside" it; a row that is itself a control is, since
    // its native activation already fires its click.
    onControl: control !== null && (row === null || row.contains(control)),
    selected: context.selected,
    rendered: event.key === "j" || event.key === "k" ? context.rendered() : [],
  };
}

/**
 * The element carrying `data-pkg` equal to `pkg`, first in document order. Compared attribute by
 * attribute rather than through a built selector: a package name is document data, and a `\` or
 * `[` in one would make `querySelector` throw (history.md §4).
 */
export function findRow(root: ParentNode, pkg: string): HTMLElement | null {
  for (const node of root.querySelectorAll<HTMLElement>("[data-pkg]")) {
    if (node.getAttribute("data-pkg") === pkg) return node;
  }

  return null;
}
