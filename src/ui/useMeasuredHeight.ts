import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** The one list head on screen: the Findings column head or the Advisories head. */
export const LIST_HEAD_H = "--list-head-h";

// An unmount can run after the next owner of the same variable has set it.
const owners = new Map<string, object>();

/** Publishes the ceiling of the element's height as `varName` on the root, while it is mounted, so
 *  CSS can clear a sticky element by its measured height (DESIGN.md §8). */
export function useMeasuredHeight<T extends Element>(varName: string): RefObject<T> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const owner = {};
    owners.set(varName, owner);
    const observer = new ResizeObserver(() => {
      if (owners.get(varName) !== owner) return;
      root.style.setProperty(varName, `${Math.ceil(node.getBoundingClientRect().height)}px`);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (owners.get(varName) !== owner) return;
      owners.delete(varName);
      root.style.removeProperty(varName);
    };
  }, [varName]);

  return ref;
}
