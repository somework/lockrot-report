/** The All packages cells of a report-2 document (SPEC §7.9.6). */

import type { Finding, Report2 } from "../model/report";
import type { SortKey } from "../state/types";
import { ago } from "./ago";
import { day, decimal, plural } from "./format";
import { causeWord, signalName } from "./pageVocabulary";

export interface Cell {
  readonly text: string;
  /** The accessible label and tooltip when the text alone does not say it. */
  readonly label: string | null;
}

const DASH = "—";

export function libyearsCell(f: Finding): Cell {
  if (f.libyears === null)
    return { text: DASH, label: causeWord(f.libyears_unmeasured ?? "", f.origin.kind) };
  const value = decimal(f.libyears, 2);
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

/** Accepted derivation 4: the column shows when a finding's day differs from the report's. */
export function showsDataColumn(report: Report2): boolean {
  if (report.data_date === null) return false;
  const page = day(report.data_date);
  return report.findings.some((f) => f.data_date !== null && day(f.data_date) !== page);
}

/** The caption that stands for the hidden column; null while the column shows. */
export function dataCaption(report: Report2): string | null {
  if (report.data_date === null) return "No row has repository data";
  if (showsDataColumn(report)) return null;
  const missing = report.findings.filter((f) => f.data_date === null).length;
  return `Every row has data as of ${day(report.data_date)}${missing > 0 ? ` (${missing} read no repository data)` : ""}`;
}

/** The signal ids the rows carry, in id order, each with its glossary name. */
export function signalKey(rows: readonly Finding[]): readonly { id: string; name: string }[] {
  const ids = [...new Set(rows.flatMap((f) => f.signals.map((signal) => signal.id)))];
  return ids
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((id) => ({ id, name: signalName(id) }));
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
