import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * Whether an element's content is wider than the element, now and after every resize of either —
 * the All packages wrap asks it so that, only while its table actually scrolls sideways, the wrap
 * becomes a named, focusable region a keyboard can scroll (PD-PACKAGES-5, DESIGN.md §5). Without
 * `ResizeObserver` (an old engine, the unit tests' DOM) it answers false: nothing is announced as a
 * scroller that the page cannot watch.
 */
export function useOverflowX(ref: RefObject<HTMLElement>): boolean {
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver !== "function") return undefined;
    const sync = () => {
      setOverflows(node.scrollWidth > node.clientWidth + 1);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    // The table inside changes width with the rows a filter leaves, the wrap does not.
    if (node.firstElementChild !== null) observer.observe(node.firstElementChild);

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return overflows;
}
