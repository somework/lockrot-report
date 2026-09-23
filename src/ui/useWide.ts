import { useEffect, useState } from "preact/hooks";

/** The three-column layout: the detail sits beside the list (legacy report.js:1129). */
export const WIDE_QUERY = "(min-width: 1181px)";
/** Phone widths: the list comes first, the ledger and the rail fold away above it (DESIGN.md §8). */
export const NARROW_QUERY = "(max-width: 759px)";

function currentMatch(query: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return fallback;

  return window.matchMedia(query).matches;
}

/**
 * Whether a media query matches, now and after every change. The first value is read synchronously
 * so the very first render already knows the layout: the boot-time pick of a package depends on it
 * (critic.md M16). `fallback` is the answer where `matchMedia` does not exist.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() => currentMatch(query, fallback));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const sync = () => {
      setMatches(list.matches);
    };
    // The query may have flipped between the first render and this effect.
    sync();
    list.addEventListener("change", sync);

    return () => {
      list.removeEventListener("change", sync);
    };
  }, [query]);

  return matches;
}

/**
 * The wide layout, following the window as it is resized (DESIGN.md §5 "WIDE": the legacy page
 * measured it once at boot). Without `matchMedia` the page assumes a wide screen, as legacy did.
 */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY, true);
}

export function useNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY, false);
}
