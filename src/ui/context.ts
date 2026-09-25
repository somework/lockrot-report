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
  /** The package whose row is the list's one Tab stop (`rowCursor.ts#pickCursor`, PD-ROWS-11), or
   *  null when the view draws no rows. */
  cursor: string | null;
  /** Opens the glossary dialog, returning focus to whatever was focused when it closes (usually
   *  `document.activeElement` at the moment it opens — the "?" key's row, the header's own
   *  button). */
  openGlossary: () => void;
  /** Opens the glossary and, once it closes, returns focus to `returnTo` instead of reading
   *  `document.activeElement` fresh. A verdict pill's popover offers this as "In the glossary" so
   *  a reader who wants the full entry never has to close the popover and go hunting for the
   *  glossary button themselves (PD-GLOSSARY-4, DESIGN.md §5) — its own "In the glossary" button
   *  hides itself in the same click (`popovertargetaction="hide"`), so by the time the glossary's
   *  dialog opens, that button is gone and `document.activeElement` has already fallen back to
   *  `<body>`. Passing the pill's own button here is what focus returns to instead.
   *
   *  `term`, when given, is the verdict word to scroll to, mark and focus once the dialog opens
   *  (PD-GLOSSARY-7, DESIGN.md §5, `Glossary.tsx#useHighlightTerm`) — so "In the glossary" lands a
   *  reader on the entry they asked for rather than the top of the list. */
  openGlossaryFrom: (returnTo: HTMLElement | null, term?: string) => void;
}

export const ReportContext = createContext<ReportContextValue | null>(null);

export function useReport(): ReportContextValue {
  const value = useContext(ReportContext);
  if (value === null) {
    throw new Error("useReport() outside <ReportContext.Provider>: mount the page through App");
  }

  return value;
}
