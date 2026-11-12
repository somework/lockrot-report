/**
 * ArrowLeft and ArrowRight on a row, as the ARIA Authoring Practices say for its widget role. In a
 * treegrid the row takes focus, and the keys walk its cells. In a tree, they unfold and fold an
 * item, and step between an item and the items listed under it. Up, Down, Home and End stay with
 * `keyboard.ts`, which walks the rows.
 */

export type SideStep = { focus: HTMLElement } | { toggle: HTMLElement } | { stay: true };

const STAY: SideStep = { stay: true };

/** What ArrowLeft or ArrowRight does on `target`, or null to leave the key to the page. */
export function sideStep(key: string, target: Element | null): SideStep | null {
  if ((key !== "ArrowLeft" && key !== "ArrowRight") || target === null) return null;
  const right = key === "ArrowRight";
  const role = target.getAttribute("role");
  if (role === "treeitem") return treeStep(target, right);
  const row = target.closest<HTMLElement>('[role="treegrid"] [role="row"][data-pkg]');
  if (row === null) return null;
  const cell = target.closest<HTMLElement>('[role="gridcell"]');
  // An empty cell has nothing to read, and on a narrow screen it is clipped to a pixel.
  const cells = [...row.querySelectorAll<HTMLElement>('[role="gridcell"]')].filter(
    (each) => each === cell || each.hasAttribute("aria-label") || each.textContent.trim() !== "",
  );
  const at = cell === null ? -1 : cells.indexOf(cell);
  const next = right ? cells[at + 1] : at === 0 ? row : cells[at - 1];

  return next === undefined ? STAY : { focus: next };
}

function treeStep(item: Element, right: boolean): SideStep {
  const expanded = item.getAttribute("aria-expanded");
  const toggle = item.querySelector<HTMLElement>(":scope > * > button[aria-expanded]");
  if (right && expanded === "false" && toggle !== null) return { toggle };
  if (!right && expanded === "true" && toggle !== null) return { toggle };
  if (right && expanded === "true") {
    const child = item.querySelector<HTMLElement>(':scope > [role="group"] > [role="treeitem"]');
    return child === null ? STAY : { focus: child };
  }
  if (right) return STAY;
  const parent = drawnUnder(item) ?? item.parentElement?.closest<HTMLElement>('[role="treeitem"]');

  return parent === null || parent === undefined ? STAY : { focus: parent };
}

/** The listed item that a deeper item is drawn under: the nearest earlier sibling one level up. */
function drawnUnder(item: Element): HTMLElement | null {
  const level = Number(item.getAttribute("aria-level"));
  for (let prev = item.previousElementSibling; prev !== null; prev = prev.previousElementSibling) {
    if (Number(prev.getAttribute("aria-level")) < level && prev instanceof HTMLElement) return prev;
  }

  return null;
}
