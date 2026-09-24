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
 * Builds a lookup table with no prototype, so a document-supplied key such as `"constructor"`,
 * `"__proto__"` or `"toString"` can never resolve to an inherited `Object.prototype` member instead
 * of `undefined` — every vocabulary table below is indexed by a string a report chose (a verdict, a
 * signal id), so a plain `{}` literal would silently hand that value back as if it were real data
 * (security finding: prototype lookups on the vocabulary tables). One helper, used by every table
 * here and by `PRIORITY_BASE` in `./priority`, rather than a guard at each call site.
 */
export function vocabTable<T extends object>(entries: T): Readonly<T> {
  return Object.assign(Object.create(null) as T, entries);
}

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

/**
 * A priority or verdict key's tone, `"low"` for anything not in the table. Ported from legacy
 * `tone()` (`report.js:185`: `TONE[key] || "low"`) — a typo, or a future verdict this renderer does
 * not yet know, never errors; it just reads as low-severity instead of crashing the page.
 */
export function TONE(key: string): Tone {
  return TONE_TABLE[key] ?? "low";
}

/** Short labels for S1-S10, verbatim from legacy `SIGNAL_NAMES` (`report.js:28-33`) plus S10. */
export const SIGNAL_NAMES: Readonly<Record<string, string>> = vocabTable({
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
});

/** Tooltip/glossary text for S1-S10, verbatim from legacy `SIGNAL_DEFS` (`report.js:49-59`) plus S10. */
export const SIGNAL_DEFS: Readonly<Record<string, string>> = vocabTable({
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
});

/** Tooltip/glossary text per verdict, verbatim from legacy `VERDICT_DEFS` (`report.js:38-48`). */
export const VERDICT_DEFS: Record<string, string> = vocabTable({
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
});

/** A run's own threshold values, in document key order — `Model.report.run.thresholds`'s own shape
 *  (`model/types.ts#RunSettings`), restated here so `annotateThresholds` does not have to import a
 *  model type into a module that otherwise only ever imports from `model/types` for the enum ids. */
export type Thresholds = readonly (readonly [name: string, years: number])[];

/**
 * A glossary definition names lockrot's own config keys (`release-warn-years`,
 * `push-high-years`, …) rather than a number, since that is what a reader would actually set
 * (`SIGNAL_DEFS.S2`, `VERDICT_DEFS.silent`, …) — but a key name alone gives no sense of where this
 * run's own gate sits. Where the run recorded a value for a name this text mentions, this replaces
 * the bare name with the fact first and the key beside it, `"5 years (release-high-years)"` — a
 * reader wants the number a sentence like "no stable release for at least …" is building toward
 * before the name of the setting that produced it, which also reads as the definition's own prose
 * continuing rather than an aside interrupting it (earlier: `"release-high-years (5 years in this
 * run)"`, the key first). The key name itself is unchanged either way, and a name the run never
 * recorded is left unannotated (PD-GLOSSARY-8, DESIGN.md §5). Every occurrence of every recorded
 * name is annotated, not just the first, since S2 and S4's own definitions each name their pair of
 * thresholds once apiece in the same sentence.
 */
export function annotateThresholds(text: string, thresholds: Thresholds): string {
  let annotated = text;
  for (const [name, years] of thresholds) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    annotated = annotated.replace(new RegExp(`\\b${escaped}\\b`, "g"), `${years} years (${name})`);
  }
  return annotated;
}

/** The base of the glossary's verdict-family docs (legacy `DOCS`, `report.js:34`). */
export const DOCS_URL = "https://lockrot.dev/verdicts/";

/** The base of lockrot's configuration docs — a different page from `DOCS_URL`'s verdict family,
 *  used by the glossary's `finished` note (PD-GLOSSARY-9, DESIGN.md §5) to point at how a package a
 *  reader considers complete gets accepted the same way the built-in allowlist does. Matches the
 *  literal `domain/sniff.ts#noteDocLink` already falls back to; kept as its own constant here rather
 *  than imported from there, since that module is deliberately the one place reading PHP-rendered
 *  prose, not a shared URL table. */
export const CONFIG_DOCS_URL = "https://lockrot.dev/configuration/";

/**
 * Dedicated glossary anchors for the three signals that link out instead of just naming themselves
 * (legacy `SIGNAL_DOC`, `report.js:37`). Every other signal id — including S10 — has no entry here;
 * a caller falls back to `` `${DOCS_URL}#the-signals` `` (`report.js:399`, `report.js:720`).
 */
export const SIGNAL_DOC: Readonly<Partial<Record<SignalId, string>>> = vocabTable({
  S7: `${DOCS_URL}#transitive-exposure`,
  S8: `${DOCS_URL}#left-behind`,
  S9: `${DOCS_URL}#security-advisories`,
});

/**
 * Whether `verdict` is one of the run's flagged verdicts. Ported from legacy `FLAGGED`'s filter
 * predicate (`report.js:118`: `FLAGGED_VERDICTS.indexOf(f.verdict) !== -1`). `flaggedVerdicts` is
 * `Model.report.run.flaggedVerdicts`, which normalize.ts has already defaulted to `DEFAULT_FLAGGED`
 * for a document that carries none of its own.
 */
export function isFlagged(verdict: Verdict, flaggedVerdicts: readonly Verdict[]): boolean {
  return flaggedVerdicts.includes(verdict);
}
