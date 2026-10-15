/** The All packages cells of a report-2 document (SPEC §7.9.6). */

import type { Finding } from "../model/report";
import type { SortKey } from "../state/types";
import { ago } from "./ago";
import { day, plural } from "./format";
import { causeWord } from "./pageVocabulary";

export interface Cell {
  readonly text: string;
  /** The accessible label and tooltip when the text alone does not say it. */
  readonly label: string | null;
}

const DASH = "—";

export function libyearsCell(f: Finding): Cell {
  if (f.libyears === null)
    return { text: DASH, label: causeWord(f.libyears_unmeasured ?? "", f.origin.kind) };
  const value = f.libyears.toFixed(2);
  return f.libyears_at_least
    ? { text: `≥ ${value}`, label: `at least ${value}` }
    : { text: value, label: null };
}

export function installedAge(f: Finding): Cell {
  const installed = f.age.installed;
  if (installed === null)
    return { text: DASH, label: causeWord(f.age.installed_unmeasured ?? "", f.origin.kind) };
  return { text: ago(installed.years), label: null };
}

/** The page reads `depth`; it never counts the chain. */
export function reachedWord(f: Finding): string {
  const way = f.reach === "transitive" ? (f.depth === null ? DASH : plural(f.depth, "hop", "hops")) : f.reach;
  return f.dev ? `${way} · dev` : way;
}

export function signalIds(f: Finding): string {
  return f.signals.length === 0 ? DASH : f.signals.map((signal) => signal.id).join(" ");
}

export function dataAsOf(f: Finding): string {
  return f.data_date === null ? DASH : day(f.data_date);
}

/** The All packages columns in display order, each with the sort key its head sets. */
export const PACKAGES_COLUMNS = [
  { key: "package", label: "Package" },
  { key: "version", label: "Version" },
  { key: "libyears", label: "Libyears" },
  { key: "age", label: "Age" },
  { key: "verdict", label: "Verdict" },
  { key: "score", label: "Score" },
  { key: "flags", label: "Flags" },
  { key: "reached", label: "Reached" },
  { key: "signals", label: "Signals" },
  { key: "data", label: "Data as of" },
] as const satisfies readonly { key: SortKey; label: string }[];
