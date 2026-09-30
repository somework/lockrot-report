import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

/** How many lines a block's text takes, from its height and its own line height. */
export function linesOf(node: HTMLElement): number {
  const line = parseFloat(getComputedStyle(node).lineHeight);
  if (!(line > 0)) return 1;
  return Math.round(node.getBoundingClientRect().height / line);
}

/** Calls `onWidth` whenever the node's width changes, never for its first width; follows the node
 *  when a render replaces it. */
function useWidthWatch(ref: RefObject<HTMLElement>, onWidth: () => void): void {
  const watched = useRef<{ node: HTMLElement; observer: ResizeObserver } | null>(null);
  const callback = useRef(onWidth);
  callback.current = onWidth;
  useLayoutEffect(() => {
    const node = ref.current;
    if (watched.current?.node === node) return;
    watched.current?.observer.disconnect();
    watched.current = null;
    if (node === null || typeof ResizeObserver === "undefined") return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      callback.current();
    });
    observer.observe(node);
    watched.current = { node, observer };
  });
  useLayoutEffect(
    () => () => {
      watched.current?.observer.disconnect();
    },
    [],
  );
}

/**
 * Sets the node's `data-fit` to the first of `steps` (each a shorter wording or a smaller size, which
 * CSS draws) under which `fits` holds in this browser's own fonts, none when the full one fits.
 * When none does, `giveUp` says whether to keep the last step or go back to the full one. Refits
 * after every render and whenever the node's width changes; a node out of sight is left as it is.
 */
export function useFitSteps<T extends HTMLElement>(
  steps: readonly string[],
  fits: (node: T) => boolean,
  giveUp: "last" | "full" = "last",
): RefObject<T> {
  const ref = useRef<T>(null);
  const fit = () => {
    const node = ref.current;
    if (node === null || node.clientWidth === 0) return;
    delete node.dataset["fit"];
    if (fits(node)) return;
    for (const step of steps) {
      node.dataset["fit"] = step;
      if (fits(node)) return;
    }
    if (giveUp === "full") delete node.dataset["fit"];
  };
  useLayoutEffect(fit);
  useWidthWatch(ref, fit);
  return ref;
}

/**
 * The index of the first of `count` wordings (0 the fullest) under which `fits` holds for the node,
 * for a block whose steps change more than CSS can switch; the last when none does. Starts over
 * when the node's width or `key` changes.
 */
export function useFitStep<T extends HTMLElement>(
  count: number,
  fits: (node: T) => boolean,
  key: string,
): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [step, setStep] = useState(0);
  const [, remeasure] = useState(0);
  const seen = useRef<{ key: string; width: number; done: boolean } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || node.clientWidth === 0) return;
    const width = node.clientWidth;
    const last = seen.current;
    if (last === null || last.key !== key || last.width !== width) {
      seen.current = { key, width, done: false };
      if (step !== 0) {
        setStep(0);
        return;
      }
    } else if (last.done) {
      return;
    }
    if (fits(node) || step >= count - 1) {
      seen.current = { key, width, done: true };
      return;
    }
    setStep(step + 1);
  });
  useWidthWatch(ref, () => {
    remeasure((n) => n + 1);
  });
  return [ref, step];
}
