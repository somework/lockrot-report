/** Grades and signals: the vocabulary tables, and the tone tokens that colour every pill, chip and
 *  bar. */

import type { SignalId } from "../model/types";
import { SIGNAL_IDS } from "../model/types";

/** The CSS tone tokens a grade pill, chip or bar segment can carry: one per band, "none" for a zero
 *  score, "unk" for no data. */
export type Tone = "crit" | "high" | "med" | "low" | "none" | "unk";

/** No prototype, so a key a report chose (`constructor`, `__proto__`, `toString`) finds nothing
 *  rather than an inherited member. */
export function vocabTable<T extends object>(entries: T): Readonly<T> {
  return Object.assign(Object.create(null) as T, entries);
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

/** The three signals with an anchor of their own; any other id links to the list of signals. */
const SIGNAL_DOC: Readonly<Partial<Record<SignalId, string>>> = vocabTable({
  S7: `${DOCS_URL}#transitive-exposure`,
  S8: `${DOCS_URL}#left-behind`,
  S9: `${DOCS_URL}#security-advisories`,
});

const KNOWN_SIGNAL_IDS: ReadonlySet<string> = new Set(SIGNAL_IDS);

function isKnownSignalId(id: string): boolean {
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
