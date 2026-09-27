/** Verdicts, priorities and signals: the vocabulary tables and the tone map that colours every
 *  pill, chip and bar. */

import type { SignalId, Verdict } from "../model/types";
import { SIGNAL_IDS } from "../model/types";

/** The five CSS tone tokens a verdict or priority pill, chip or bar segment can carry. */
export type Tone = "crit" | "high" | "med" | "low" | "none";

/** No prototype, so a key a report chose (`constructor`, `__proto__`, `toString`) finds nothing
 *  rather than an inherited member. */
export function vocabTable<T extends object>(entries: T): Readonly<T> {
  return Object.assign(Object.create(null) as T, entries);
}

/** Mirrors lockrot's `Verdict::flagged()`, so the page and lockrot agree on the count; `unknown` is
 *  a note, not a finding. */
export const DEFAULT_FLAGGED: readonly Verdict[] = [
  "abandoned",
  "silent",
  "pinned",
  "left-behind",
  "old-promise",
  "stale",
];

/** Excludes `finished` and `ok`, which are not rot; an unknown verdict sorts after every entry. */
export const VERDICT_ORDER: readonly Verdict[] = [
  "abandoned",
  "silent",
  "pinned",
  "left-behind",
  "old-promise",
  "stale",
  "unknown",
];

const TONE_TABLE: Readonly<Record<string, Tone>> = vocabTable({
  critical: "crit",
  high: "high",
  medium: "med",
  low: "low",
  none: "none",
  abandoned: "crit",
  silent: "crit",
  pinned: "high",
  "left-behind": "high",
  "old-promise": "med",
  stale: "med",
  unknown: "low",
  finished: "none",
  ok: "none",
});

/** An unknown key reads as low, never an error. */
export function TONE(key: string): Tone {
  return TONE_TABLE[key] ?? "low";
}

export const SIGNAL_NAMES: Readonly<Record<string, string>> = vocabTable({
  S1: "marked abandoned",
  S2: "no recent release",
  S3: "repository archived",
  S4: "no push to the repository",
  S5: "release predates the target PHP",
  // PD-S6-1: S2 is an age; S6 is a snapshot or a repository with no tag at all.
  S6: "branch snapshot or never tagged",
  S7: "pulls in flagged packages",
  S8: "the installed branch stopped",
  S9: "security advisories",
  S10: "a check could not run",
});

/** A check's subject, not a verdict on it, so the words fit a fired, quiet or blocked cell
 *  (PD-DETAIL-12). */
export const CHECK_NAMES: Readonly<Record<string, string>> = vocabTable({
  S1: "abandoned",
  S2: "release age",
  S3: "archived",
  S4: "push age",
  S5: "predates PHP",
  S6: "snapshot/untagged",
  S7: "flagged deps",
  S8: "branch stopped",
  S9: "advisories",
  S10: "check gaps",
});

export const SIGNAL_DEFS: Readonly<Record<string, string>> = vocabTable({
  S1: "The Composer repository marks the package abandoned, sometimes naming a replacement.",
  S2: "Time since the newest dated release, pre-releases included, against release-warn-years / release-high-years.",
  S3: "The repository is archived — on GitHub, or on GitLab when the run has credentials there.",
  S4: "Time since the last push to any branch, against push-warn-years / push-high-years.",
  S5: "The installed release predates the target PHP's GA date and require.php has no upper bound.",
  S6: "The installed version is a branch snapshot, or the package's repository lists no tag at all (a pre-release counts as one).",
  S7: "A direct requirement pulls in flagged transitive packages. Informational, never a verdict.",
  S8: "Time since the last stable release on the installed branch, counted only when a higher branch has released since.",
  S9: "Security advisories affecting the installed version. Never a verdict; raises the priority where no fix is coming.",
  S10: "A check lockrot relies on could not run for this package, so a verdict may be missing a signal; the data says which and why.",
});

export const VERDICT_DEFS: Record<string, string> = vocabTable({
  abandoned:
    "The package's Composer repository marks it abandoned, or its repository is archived on GitHub or GitLab.",
  silent:
    "No release for at least release-high-years, pre-releases included, and no repository push for at least push-high-years.",
  pinned:
    "The installed version is a branch snapshot — dev-master, a 2.x-dev alias, a #hash — or the package's repository lists no tag at all.",
  "left-behind":
    "No stable release on the installed branch for release-warn-years, while a higher branch kept releasing. The package is alive; the branch you are on is not.",
  "old-promise":
    "The installed version was released before the target PHP's GA date, and its require.php constraint is open-ended for that target.",
  stale: "Old release or old push, but not old enough on both fronts for silent.",
  unknown:
    "No data could be obtained — not found in any configured Composer repository, or every lookup failed.",
  finished: "Matched the built-in or project allowlist. The package is complete by design, not neglected.",
  ok: "None of the above.",
});

export type Thresholds = readonly (readonly [name: string, years: number])[];

/** Each config key a definition names gets this run's value first, "5 years (release-high-years)";
 *  a key the run never recorded is left as it is (PD-GLOSSARY-8). */
export function annotateThresholds(text: string, thresholds: Thresholds): string {
  let annotated = text;
  for (const [name, years] of thresholds) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    annotated = annotated.replace(new RegExp(`\\b${escaped}\\b`, "g"), `${years} years (${name})`);
  }
  return annotated;
}

export const DOCS_URL = "https://lockrot.dev/verdicts/";

/** The configuration docs, where a reader learns to accept a finished package (PD-GLOSSARY-9). */
export const CONFIG_DOCS_URL = "https://lockrot.dev/configuration/";

/** The three signals with an anchor of their own; any other id links to the list of signals. */
export const SIGNAL_DOC: Readonly<Partial<Record<SignalId, string>>> = vocabTable({
  S7: `${DOCS_URL}#transitive-exposure`,
  S8: `${DOCS_URL}#left-behind`,
  S9: `${DOCS_URL}#security-advisories`,
});

const KNOWN_SIGNAL_IDS: ReadonlySet<string> = new Set(SIGNAL_IDS);

export function isKnownSignalId(id: string): boolean {
  return KNOWN_SIGNAL_IDS.has(id);
}

/** lockrot's own id, `S` and a number with no leading zero (the report schema's `signalId`). */
const LOCKROT_SIGNAL_ID = /^S[1-9][0-9]*$/;
/** `<vendor>:<name>`, which the report schema keeps for a signal that does not come from lockrot. */
const VENDOR_SIGNAL_ID = /^[a-z0-9][a-z0-9_.-]*:[a-z0-9][a-z0-9_.-]*$/;

/** Read off the id's shape only, never in a known check's words: an S-number is a newer lockrot
 *  check, `vendor:name` is not lockrot's. */
function unknownSignalDef(id: string): string {
  if (LOCKROT_SIGNAL_ID.test(id)) return "A lockrot check this page does not know.";
  if (VENDOR_SIGNAL_ID.test(id)) return "A check from outside lockrot, which this page does not know.";
  return "A check this page does not know.";
}

export function signalDef(id: string): string {
  return SIGNAL_DEFS[id] ?? unknownSignalDef(id);
}

/** `null` for an id that is not lockrot's, which its docs do not describe. */
export function signalDocUrl(id: string): string | null {
  if (!isKnownSignalId(id) && !LOCKROT_SIGNAL_ID.test(id)) return null;
  return SIGNAL_DOC[id] ?? `${DOCS_URL}#the-signals`;
}

export function isFlagged(verdict: Verdict, flaggedVerdicts: readonly Verdict[]): boolean {
  return flaggedVerdicts.includes(verdict);
}
