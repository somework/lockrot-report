/**
 * The Checks line of the detail sheet (SPEC §7.9.8): how many of the signal ids fired, how many
 * stayed quiet, and which could not run, with the reason words of each group.
 */

import type { Finding, Run, UncheckedAccepted } from "../model/report";
import { causeWord } from "./pageVocabulary";

type Blocking = { reason: string; blocks: readonly string[]; check: string };

interface Blocked {
  id: string;
  state: "not run" | "not checked" | "incomplete";
  words: string;
}

function acceptedWords(entry: Blocking, accepted: readonly UncheckedAccepted[], origin: string): string {
  const held = accepted.find(({ check }) => check === entry.check);
  return held === undefined ? causeWord(entry.reason, origin) : `${causeWord(held.reason, origin)}, accepted`;
}

function blockedIds(finding: Finding, fired: ReadonlySet<string>): Blocked[] {
  const origin = finding.origin.kind;
  const entries = [
    ...finding.checks_skipped
      .filter(({ reason }) => reason !== "branch_snapshot")
      .map((entry) => ({ entry, state: "not run" as const })),
    ...finding.checks_missing.map((entry) => ({ entry, state: "not checked" as const })),
  ];
  const wordsOf = (id: string): string[] =>
    entries
      .filter(({ entry }) => entry.blocks.includes(id))
      .map(({ entry }) =>
        entry.reason === "accepted_by_config"
          ? acceptedWords(entry, finding.unchecked_accepted, origin)
          : causeWord(entry.reason, origin),
      )
      .filter((word, index, all) => all.indexOf(word) === index);

  return entries
    .flatMap(({ entry, state }) => entry.blocks.map((id) => ({ id, state })))
    .filter(({ id }, index, all) => all.findIndex((other) => other.id === id) === index)
    .map(({ id, state }) => ({
      id,
      state: fired.has(id) ? ("incomplete" as const) : state,
      words: wordsOf(id).join(", "),
    }));
}

function groups(blocked: readonly Blocked[], state: Blocked["state"], order: readonly string[]): string[] {
  const inState = blocked.filter((entry) => entry.state === state);
  return [...new Set(inState.map(({ words }) => words))].map((words) => {
    const ids = inState
      .filter((entry) => entry.words === words)
      .map(({ id }) => id)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return `${ids.join(", ")} ${state} (${words})`;
  });
}

/** The Checks row's items, one per line on the sheet (SPEC §7.9.8.9). */
export function checksItems(finding: Finding, run: Run): string[] {
  const order = run.signal_ids;
  const fired = new Set(finding.signals.map(({ id }) => id));
  const firedIds = order.filter((id) => fired.has(id));
  const blocked = blockedIds(finding, fired);
  const notApplicable = finding.checks_skipped
    .filter(({ reason }) => reason === "branch_snapshot")
    .flatMap(({ blocks }) => blocks);
  const ignored = finding.abandoned_ignored === null ? [] : ["S1"];
  const listed = new Set([...blocked.map(({ id }) => id), ...notApplicable, ...ignored]);
  const quiet = order.filter((id) => !fired.has(id) && !listed.has(id)).length;

  const lists = [
    ...groups(blocked, "not run", order),
    ...(notApplicable.length === 0 ? [] : [`${notApplicable.join(", ")} not applicable (branch snapshot)`]),
    ...groups(blocked, "not checked", order),
    ...groups(blocked, "incomplete", order),
  ];
  const everyCheckRan =
    blocked.length > 0 ? [] : [notApplicable.length > 0 ? "every other check ran" : "every check ran"];

  return [
    `${firedIds.length} fired${firedIds.length > 0 ? ` (${firedIds.join(", ")})` : ""}`,
    `${quiet} quiet`,
    ...(ignored.length > 0 ? ["S1 ignored (Composer policy)"] : []),
    ...lists,
    ...everyCheckRan,
  ];
}

export const checksLine = (finding: Finding, run: Run): string => checksItems(finding, run).join(" · ");
