import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Shell } from "../domain/shellArgv";
import type { Model } from "../model/types";
import type { Action, State } from "../state/types";

/**
 * Everything a component needs from the page, provided once by `App`.
 *
 * The model never changes while the page is open; the state changes on every interaction and is
 * owned by `App`'s reducer. `now` is the report's own `generated_at`, not the reader's clock: every
 * age on the page is "as of the run", so the same file reads the same next year.
 */
export interface ReportContextValue {
  model: Model;
  state: State;
  dispatch: (action: Action) => void;
  now: Date;
  /** The two-column layout (`WIDE_QUERY`): the detail sits beside the list instead of over it. */
  wide: boolean;
  /** The package whose row is the list's one Tab stop (`rowCursor.ts#pickCursor`, PD-ROWS-11), or
   *  null when the view draws no rows. */
  cursor: string | null;
  /** Opens the glossary dialog, returning focus to whatever was focused when it closes (usually
   *  `document.activeElement` at the moment it opens — the "?" key's row, the header's own
   *  button). */
  openGlossary: () => void;
  /** The shell of every command box on the page (`useShell.ts`). */
  shell: Shell;
  pickShell: (shell: Shell) => void;
}

export const ReportContext = createContext<ReportContextValue | null>(null);

export function useReport(): ReportContextValue {
  const value = useContext(ReportContext);
  if (value === null) {
    throw new Error("useReport() outside <ReportContext.Provider>: mount the page through App");
  }

  return value;
}
