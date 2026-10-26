/** Words and clauses that the detail sheet's blocks (SPEC §7.9.13) and its Why lines (§7.9.8.8) share. */

import type {
  CheckMissing,
  CheckSkipped,
  Finding,
  Modifier,
  Run,
  S1,
  S2,
  S3,
  S4,
  S5,
  S6,
  S8,
  S9,
  S11,
  SecurityVulnerable,
  Severity,
  SignalId,
} from "../model/report";
import { advisoryRows } from "./advisoryRows";
import { decimal, pluralNoun } from "./format";
import { joinAnd } from "./joinWords";
import {
  activityProvenanceWord,
  allowlistReason,
  causeWord,
  halvingWord,
  metadataProvenanceWord,
  metadataStatusWord,
  originKindWord,
  signalName,
  skippedCheckWord,
} from "./pageVocabulary";

/** The reach of every list of names a sentence prints before "and {n} more". */
export const NAMES_SHOWN = 3;

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
export const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);
export const isAre = (n: number): string => pluralNoun(n, "is", "are");

/** At most three names, then "and {n} more". */
export function namesCapped(names: readonly string[]): string {
  if (names.length <= NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, NAMES_SHOWN).join(", ")} and ${names.length - NAMES_SHOWN} more`;
}

/** SPEC §5.10's R words, with no trailing comma: "the newest PHP, 8.5". */
export function newestPhpWords({ newest_php: php, newest_php_source: source }: S11): string {
  switch (source) {
    case "require_php":
      return `${php}, the newest PHP that require.php allows`;
    case "platform_php":
      return `${php}, the newest PHP that the lock's platform allows`;
    default:
      return `the newest PHP, ${php}`;
  }
}

export const oneDecimal = (years: number | null): string => (years === null ? "" : decimal(years, 1));

interface SignalData {
  S1: S1;
  S2: S2;
  S3: S3;
  S4: S4;
  S5: S5;
  S6: S6;
  S8: S8;
  S9: S9;
  S11: S11;
}

export function signalData<I extends keyof SignalData>(finding: Finding, id: I): SignalData[I] | null {
  const signal = finding.signals.find((s) => s.id === id);
  return signal ? (signal.data as SignalData[I]) : null;
}

/** An advisory as every sentence names it: its S9 row's cve, else its id. */
export function advisoryName(finding: Finding, id: string): string {
  return advisoryRows(finding).find((row) => row.id === id)?.cve ?? id;
}

export function countsAs(run: Run, severity: Severity): Severity | null {
  return run.score_model.severities.find((s) => s.id === severity)?.counts_as ?? null;
}

export function checkReasonWords(finding: Finding, reason: string | null): string {
  return reason === null ? "" : causeWord(reason, finding.origin.kind);
}

/** The Provenance words of SPEC §7.9.8.13: a word for every closed id, and a reason as its cause words. */
export function provenanceWords(finding: Finding): { origin: string; metadata: string; activity: string } {
  const { origin, metadata, activity } = finding;
  const status = (word: string, reason: string | null): string =>
    reason === null ? word : `${word} (${checkReasonWords(finding, reason)})`;
  return {
    origin: originKindWord(origin.kind),
    metadata: status(metadataProvenanceWord(metadata.status), metadata.reason),
    activity: status(activityProvenanceWord(activity.status), activity.reason),
  };
}

export const metadataWords = (finding: Finding): string =>
  metadataStatusWord(finding.metadata.status, finding.origin.kind);

/** One check entry's reason as a sentence words it; an accepted check carries the project's own reason. */
export function entryReasonWords(finding: Finding, entry: CheckMissing | CheckSkipped): string {
  if (entry.reason === "accepted_by_config") {
    const accepted = finding.unchecked_accepted.find((u) => u.check === entry.check);
    if (accepted) {
      return `${entryReasonWords(finding, accepted)}; ${causeWord("accepted_by_config", finding.origin.kind)}: ${accepted.accepted_by.reason}`;
    }
  }
  const words = checkReasonWords(finding, entry.reason);
  const host = finding.activity.host;
  return entry.reason === "host_not_supported" && host ? `${words}: lockrot cannot ask ${host}` : words;
}

function idsReasonWords(
  finding: Finding,
  entries: readonly (CheckMissing | CheckSkipped)[],
  id: SignalId,
): string {
  const words: string[] = [];
  for (const entry of entries) {
    if (!entry.blocks.includes(id)) continue;
    const w = entryReasonWords(finding, entry);
    if (!words.includes(w)) words.push(w);
  }
  return words.join(", ");
}

/** Ids grouped by the reason words of the entries that block them, groups in first-seen order. */
function byReason(
  finding: Finding,
  entries: readonly (CheckMissing | CheckSkipped)[],
  ids: readonly SignalId[],
): { ids: SignalId[]; words: string }[] {
  const groups: { ids: SignalId[]; words: string }[] = [];
  for (const id of ids) {
    const words = idsReasonWords(finding, entries, id);
    const group = groups.find((g) => g.words === words);
    if (group) group.ids.push(id);
    else groups.push({ ids: [id], words });
  }
  return groups;
}

const checkNames = (ids: readonly string[]): string => joinAnd(ids.map((id) => `${signalName(id)} (${id})`));

/** "release age (S2) not checked (undated releases); release branch (S8) incomplete (undated releases)", or null. */
export function checksMissingBody(finding: Finding, run: Run): string | null {
  if (finding.checks_missing.length === 0) return null;
  const order = (id: SignalId): number => {
    const at = run.signal_ids.indexOf(id);
    return at === -1 ? run.signal_ids.length : at;
  };
  const ids = [...new Set(finding.checks_missing.flatMap((c) => c.blocks))].sort(
    (a, b) => order(a) - order(b),
  );
  const fired = new Set(finding.signals.map((s) => s.id));
  const parts = [
    { ids: ids.filter((id) => !fired.has(id)), state: "not checked" },
    { ids: ids.filter((id) => fired.has(id)), state: "incomplete" },
  ].flatMap(({ ids: group, state }) =>
    byReason(finding, finding.checks_missing, group).map((g) => `${checkNames(g.ids)} ${state} (${g.words})`),
  );
  return parts.join("; ");
}

/**
 * The checks lockrot chose not to run, grouped by reason: "its repository activity (allowlisted)". A snapshot's
 * release branch is left out, and the release metadata too when another sentence already says it was not read.
 */
export function checksSkippedBody(
  finding: Finding,
  { metadataSaid = false, acceptedOnly = false }: { metadataSaid?: boolean; acceptedOnly?: boolean },
): string | null {
  const groups: { words: string; checks: string[] }[] = [];
  for (const entry of finding.checks_skipped) {
    const accepted = entry.reason === "accepted_by_config";
    if (entry.reason === "branch_snapshot") continue;
    if (metadataSaid && entry.check === "release_metadata" && !accepted) continue;
    if (acceptedOnly && !accepted) continue;
    const words = entryReasonWords(finding, entry);
    const check = skippedCheckWord(entry.check);
    const group = groups.find((g) => g.words === words);
    if (group) group.checks.push(check);
    else groups.push({ words, checks: [check] });
  }
  if (groups.length === 0) return null;
  return groups.map((g) => `${g.checks.join(" and ")} (${g.words})`).join("; ");
}

/** The checks the `release_metadata` gap blocks, named as the Checks strip names them, and how many. */
export function unjudgedChecks(finding: Finding): { names: string; count: number } {
  const ids = [
    ...new Set(
      [...finding.checks_skipped, ...finding.checks_missing]
        .filter((c) => c.check === "release_metadata")
        .flatMap((c) => c.blocks),
    ),
  ];
  return ids.length === 0
    ? { names: "its release checks", count: 1 }
    : { names: checkNames(ids), count: ids.length };
}

/** No release metadata was read and no maintenance term counts. */
export function maintenanceNotJudged(finding: Finding): boolean {
  const score = finding.score;
  const status = "parts" in score ? score.parts.maintenance.status : null;
  return !finding.maintenance_judged && status !== "counted";
}

/** " (its maintenance counts half: not required directly)" for the halvings a rerun applied, or "". */
export function rerunHalving(modifiers: readonly Modifier[]): string {
  const words = modifiers.filter((m) => m.before !== m.after).map((m) => halvingWord(m.reason, m.divide_by));
  return words.length > 0 ? ` (${words.join("; ")})` : "";
}

export const printedModifiers = (modifiers: readonly Modifier[]): Modifier[] =>
  modifiers.filter((m) => m.before !== m.after);

/** The words of the entry that allowlists the package: the vocabulary's for lockrot's own reasons. */
export function allowlistReasonWords(allowlist: NonNullable<Finding["allowlist"]>): string {
  const vocabulary = allowlist.reason_id === null ? null : allowlistReason(allowlist.reason_id);
  if (allowlist.reason_by === "lockrot" && vocabulary) return vocabulary;
  return allowlist.reason || "no reason given";
}

/** What `security.partial` clears: its flags by id, then "{k} of its {n} advisories". */
export function partialClears(finding: Finding, partial: NonNullable<SecurityVulnerable["partial"]>): string {
  const of = "parts" in finding.score ? finding.score.parts.security.of : 0;
  const flags = partial.clears.filter((c) => c.kind === "flag").map((c) => c.id);
  const advisories = partial.clears.filter((c) => c.kind === "advisory").length;
  return [...flags, `${advisories} of its ${of} advisories`].join(" and ");
}

export const acceptsWholePackage = (finding: Finding): boolean =>
  finding.allowlist !== null && finding.allowlist.flag_ids === null;
