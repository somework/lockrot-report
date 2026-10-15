import type { TargetedMouseEvent } from "preact";
import type { Action } from "../state/types";

/**
 * Every list row: a click opens `pkg` and never closes the open one (PD-ROWS-7). A click on a real
 * link, button, open popover, `data-no-open` part or nested row is left alone. Keyboard activation
 * lives in `ui/keyboard.ts`, which reads `data-pkg` through one listener; a row `onKeyDown` would
 * race it.
 */
export function openInteractions(
  pkg: string,
  dispatch: (action: Action) => void,
): {
  onClick: (event: TargetedMouseEvent<HTMLElement>) => void;
} {
  return {
    onClick: (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, [popover], [data-no-open]")) return;
      // A row nested in this one (a Blast radius row's own packages) opens its own package.
      const row = target.closest("[data-pkg]");
      if (row !== null && row !== event.currentTarget) return;
      dispatch({ type: "select", pkg });
    },
  };
}
