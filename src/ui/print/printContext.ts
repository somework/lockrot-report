import { createContext } from "preact";
import { useContext } from "preact/hooks";

/**
 * True inside the printed report (`PrintDocument`), false everywhere on screen. The tabs' own views
 * are what the print is made of; this is how the few of them that paper needs laid out differently
 * know it — the Findings ledger as a table whose group and column heads repeat on every page, the
 * All packages table's heads as plain words (a heading's sort button is not repeated on a
 * continuation page), and no "opens its detail" where nothing opens.
 */
export const PrintContext = createContext(false);

export function usePrinted(): boolean {
  return useContext(PrintContext);
}
