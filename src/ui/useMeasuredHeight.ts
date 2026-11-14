import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** The one list head on screen: the Findings column head or the Advisories head. */
export const LIST_HEAD_H = "--list-head-h";

interface Owner {
  height: string | null;
}

// Mount order, newest last: the newest owner writes the variable, and when it unmounts the variable
// goes back to the one before it (the print document mounts a second head and unmounts it first).
const owners = new Map<string, Owner[]>();

function publish(varName: string): void {
  const height = owners.get(varName)?.at(-1)?.height ?? null;
  if (height === null) document.documentElement.style.removeProperty(varName);
  else document.documentElement.style.setProperty(varName, height);
}

/** Publishes the ceiling of the element's height as `varName` on the root, while it is mounted, so
 *  CSS can clear a sticky element by its measured height (DESIGN.md §8). */
export function useMeasuredHeight<T extends Element>(varName: string): RefObject<T> {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return undefined;
    const owner: Owner = { height: null };
    owners.set(varName, [...(owners.get(varName) ?? []), owner]);
    const observer = new ResizeObserver(() => {
      owner.height = `${Math.ceil(node.getBoundingClientRect().height)}px`;
      publish(varName);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      owners.set(
        varName,
        (owners.get(varName) ?? []).filter((other) => other !== owner),
      );
      publish(varName);
    };
  }, [varName]);

  return ref;
}
