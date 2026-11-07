import { useCallback, useState } from "preact/hooks";

/** Beside `lockrot-theme` and `lockrot-shell`: one viewer's choice, kept in their own browser only. */
export const SHORTCUTS_KEY = "lockrot-shortcuts";

function readOn(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveOn(on: boolean): void {
  try {
    window.localStorage.setItem(SHORTCUTS_KEY, on ? "on" : "off");
  } catch {
    // Not persisted: the choice still holds for this page view.
  }
}

/** Whether `?`, `/`, `j` and `k` act on the page (WCAG 2.1.4): on unless the viewer turned them off. */
export function useShortcutsSwitch(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(readOn);
  const pick = useCallback((next: boolean) => {
    setOn(next);
    saveOn(next);
  }, []);
  return [on, pick];
}
