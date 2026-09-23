/**
 * Verdicts, priorities and signals: the fixed vocabulary tables from the top of legacy report.js
 * (lines 1-200) and the tone map that colours every pill, chip and bar segment on the page.
 *
 * Ported from `legacy/report.js:21-63` and `legacy/report.js:96-142` (constants only — the
 * functions that read the DOM or a Finding live in other domain/ modules or in ui/).
 */

import type { SignalId, Verdict } from "../model/types";

/** The five CSS tone tokens a verdict or priority pill, chip or bar segment can carry. */
export type Tone = "crit" | "high" | "med" | "low" | "none";

/**
 * The verdicts that count as findings when a document carries no `run.flaggedVerdicts` of its own
 * (legacy `FLAGGED_VERDICTS`, `report.js:116-117`). Mirrors `Verdict::flagged()` server-side, so
 * this page and lockrot's own table always agree on the count. Deliberately excludes `unknown`: a
 * package lockrot could not check is a note, not a finding, and counting it would put the page one
 * ahead of its own headline.
 *
 * `Model.report.run.flaggedVerdicts` already carries this fallback applied (DESIGN.md §"Compatibility",
 * `model/normalize.ts`'s job) — this constant exists for the same fallback anywhere it is still
 * needed directly, and as the source of truth `normalize.ts` falls back to.
 */
export const DEFAULT_FLAGGED: readonly Verdict[] = [
  "abandoned",
  "silent",
  "pinned",
  "left-behind",
  "old-promise",
  "stale",
];

/**
 * Severity order for the packages table's verdict column (legacy `SEVERITY_ORDER`, `report.js:133`).
 * Seven entries — excludes `finished` and `ok` on purpose, since neither is a "rot" verdict. A
 * verdict not in this list sorts after every entry here (DESIGN.md M1: unlike the legacy page,
 * which compared severity case-sensitively and gave `moderate`/`High` no bucket at all, the caller
 * is expected to normalise case first and only fall back to "sorts last" for a genuinely unknown
 * verdict — that normalisation is not this module's job).
 */
export const VERDICT_ORDER: readonly Verdict[] = [
  "abandoned",
  "silent",
  "pinned",
  "left-behind",
  "old-promise",
  "stale",
  "unknown",
];

const TONE_TABLE: Readonly<Record<string, Tone>> = {
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
};

/**
 * A priority or verdict key's tone, `"low"` for anything not in the table. Ported from legacy
 * `tone()` (`report.js:185`: `TONE[key] || "low"`) — a typo, or a future verdict this renderer does
 * not yet know, never errors; it just reads as low-severity instead of crashing the page.
 */
export function TONE(key: string): Tone {
  return TONE_TABLE[key] ?? "low";
}

/** Short labels for S1-S10, verbatim from legacy `SIGNAL_NAMES` (`report.js:28-33`) plus S10. */
export const SIGNAL_NAMES: Readonly<Record<string, string>> = {
  S1: "marked abandoned",
  S2: "no stable release",
  S3: "repository archived",
  S4: "no push to the repository",
  S5: "release predates the target PHP",
  S6: "branch snapshot, not a release",
  S7: "pulls in flagged packages",
  S8: "the installed branch stopped",
  S9: "security advisories",
  // DESIGN.md §5 M2 / critic.md M2: the legacy page emits S10 (NotCheckedRule) but has no name or
  // glossary entry for it, and a plain string .sort() puts it between S1 and S2. Fixed on purpose:
  // named here, and a caller sorts signal ids in SIGNAL_IDS' numeric order instead of lexicographic.
  S10: "a check could not run",
};

/** Tooltip/glossary text for S1-S10, verbatim from legacy `SIGNAL_DEFS` (`report.js:49-59`) plus S10. */
export const SIGNAL_DEFS: Readonly<Record<string, string>> = {
  S1: "The Composer repository marks the package abandoned, sometimes naming a replacement.",
  S2: "Time since the last stable release, against release-warn-years / release-high-years.",
  S3: "The repository is archived — on GitHub, or on GitLab when the run has credentials there.",
  S4: "Time since the last push to any branch, against push-warn-years / push-high-years.",
  S5: "The installed release predates the target PHP's GA date and require.php has no upper bound.",
  S6: "The installed version is a branch snapshot, or the package has no stable release.",
  S7: "A direct requirement pulls in flagged transitive packages. Informational, never a verdict.",
  S8: "Time since the last stable release on the installed branch, counted only when a higher branch has released since.",
  S9: "Security advisories affecting the installed version. Never a verdict; raises the priority where no fix is coming.",
  S10: "A check lockrot relies on could not run for this package, so a verdict may be missing a signal; the data says which and why.",
};

/** Tooltip/glossary text per verdict, verbatim from legacy `VERDICT_DEFS` (`report.js:38-48`). */
export const VERDICT_DEFS: Record<string, string> = {
  abandoned:
    "The package's Composer repository marks it abandoned, or its repository is archived on GitHub or GitLab.",
  silent:
    "No stable release for at least release-high-years and no repository push for at least push-high-years.",
  pinned:
    "The installed version is a branch snapshot — dev-master, a 2.x-dev alias, a #hash — or the package has no stable release at all.",
  "left-behind":
    "No stable release on the installed branch for release-warn-years, while a higher branch kept releasing. The package is alive; the branch you are on is not.",
  "old-promise":
    "The installed version was released before the target PHP's GA date, and its require.php constraint is open-ended for that target.",
  stale: "Old release or old push, but not old enough on both fronts for silent.",
  unknown:
    "No data could be obtained — not found in any configured Composer repository, or every lookup failed.",
  finished: "Matched the built-in or project allowlist. The package is complete by design, not neglected.",
  ok: "None of the above.",
};

/** The base of the glossary's verdict-family docs (legacy `DOCS`, `report.js:34`). */
export const DOCS_URL = "https://lockrot.dev/verdicts/";

/**
 * Dedicated glossary anchors for the three signals that link out instead of just naming themselves
 * (legacy `SIGNAL_DOC`, `report.js:37`). Every other signal id — including S10 — has no entry here;
 * a caller falls back to `` `${DOCS_URL}#the-signals` `` (`report.js:399`, `report.js:720`).
 */
export const SIGNAL_DOC: Readonly<Partial<Record<SignalId, string>>> = {
  S7: `${DOCS_URL}#transitive-exposure`,
  S8: `${DOCS_URL}#left-behind`,
  S9: `${DOCS_URL}#security-advisories`,
};

/**
 * Whether `verdict` is one of the run's flagged verdicts. Ported from legacy `FLAGGED`'s filter
 * predicate (`report.js:118`: `FLAGGED_VERDICTS.indexOf(f.verdict) !== -1`). `flaggedVerdicts` is
 * `Model.report.run.flaggedVerdicts`, which normalize.ts has already defaulted to `DEFAULT_FLAGGED`
 * for a document that carries none of its own.
 */
export function isFlagged(verdict: Verdict, flaggedVerdicts: readonly Verdict[]): boolean {
  return flaggedVerdicts.includes(verdict);
}
