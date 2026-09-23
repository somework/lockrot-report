import { useLayoutEffect, useState } from "preact/hooks";
import { useMediaQuery } from "./useWide";

export type Theme = "light" | "dark";

/** The storage key the legacy page used (report.js:1011, 1115); a reader's saved choice carries over. */
export const THEME_KEY = "lockrot-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function asTheme(value: string | null): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}

/**
 * The saved choice, or null. Storage throws in a private window and in an opaque-origin frame
 * (history.md §5); either way the page follows the OS for this visit. An unrecognised stored value
 * is treated as no choice at all instead of being written onto the page.
 */
function readSaved(): Theme | null {
  try {
    return asTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

function save(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not persisted; the choice still holds for this page view.
  }
}

/** The theme a click switches to: always the other one from what the reader is looking at. */
export function nextTheme(effective: Theme): Theme {
  return effective === "dark" ? "light" : "dark";
}

/** The theme button's label names its action, as on the legacy page: "Dark" switches to dark. */
export function themeButtonLabel(effective: Theme): "Dark" | "Light" {
  return effective === "dark" ? "Light" : "Dark";
}

export interface ThemeControl {
  /** What is on screen: the pinned theme, or the OS preference when nothing is pinned. */
  effective: Theme;
  toggle: () => void;
}

/**
 * The page theme. It is pinned through `data-theme` on `<html>`, which the stylesheet reads
 * (styles/tokens.css); with nothing pinned the stylesheet follows `prefers-color-scheme`. Fixes
 * DESIGN.md §5 M11: the legacy button computed the next theme from the attribute alone, so under an
 * OS dark preference its first click "switched" to the dark the page already showed.
 */
export function useTheme(): ThemeControl {
  const [pinned, setPinned] = useState<Theme | null>(
    () => readSaved() ?? asTheme(document.documentElement.getAttribute("data-theme")),
  );
  const osDark = useMediaQuery(DARK_QUERY, false);

  // A layout effect, so the saved theme is on the page before its first paint and a dark reader
  // never sees a flash of the light palette.
  useLayoutEffect(() => {
    if (pinned !== null) document.documentElement.setAttribute("data-theme", pinned);
  }, [pinned]);

  const effective: Theme = pinned ?? (osDark ? "dark" : "light");

  return {
    effective,
    toggle: () => {
      const next = nextTheme(effective);
      setPinned(next);
      save(next);
    },
  };
}
