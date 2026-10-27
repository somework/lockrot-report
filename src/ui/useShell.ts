import { useCallback, useState } from "preact/hooks";
import { SHELLS, type Shell } from "../domain/shellArgv";

/** Beside `lockrot-theme`: one viewer's choice, kept in their own browser only. */
export const SHELL_KEY = "lockrot-shell";

function readShell(): Shell {
  try {
    const saved = window.localStorage.getItem(SHELL_KEY);
    return SHELLS.find((shell) => shell === saved) ?? "posix";
  } catch {
    return "posix";
  }
}

function saveShell(shell: Shell): void {
  try {
    window.localStorage.setItem(SHELL_KEY, shell);
  } catch {
    // Not persisted: the choice still holds for this page view.
  }
}

/** The page's one shell: a pick in any command box changes every box (R4-30). */
export function useShell(): [Shell, (shell: Shell) => void] {
  const [shell, setShell] = useState<Shell>(readShell);
  const pick = useCallback((next: Shell) => {
    setShell(next);
    saveShell(next);
  }, []);
  return [shell, pick];
}
