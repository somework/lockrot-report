import { createContext } from "preact";
import { useContext } from "preact/hooks";
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
  /** The two-column layout (≥ 1181px): the detail sits beside the list instead of over it. */
  wide: boolean;
  /** Opens the glossary dialog. A verdict pill's popover offers this as "In the glossary" so a
   *  reader who wants the full entry never has to close the popover and go hunting for the
   *  glossary button themselves (PD-GLOSSARY-4, DESIGN.md §5). */
  openGlossary: () => void;
}

export const ReportContext = createContext<ReportContextValue | null>(null);

export function useReport(): ReportContextValue {
  const value = useContext(ReportContext);
  if (value === null) {
    throw new Error("useReport() outside <ReportContext.Provider>: mount the page through App");
  }

  return value;
}
