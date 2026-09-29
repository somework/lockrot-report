/**
 * Advisories: the S9 signal's payload, flattened across findings — ported from legacy's
 * `advisoriesOf`, `fixLadder`, `sevTone` and the sort the Advisories tab and the detail's "Every
 * advisory" list both use (report.js:140-171,525-546; js-1.md, js-2.md, js-3.md), corrected per
 * critic.md C1, M1, M33.
 */

import type { Advisory, Finding, Model, Severity } from "../model/types";
import { severityRank } from "./severity";

/**
 * The advisories of one finding. `normalize()` already does the S9-signal flattening legacy's
 * `advisoriesOf` did (`Finding.advisories` in model/types.ts), so this is a thin named accessor —
 * kept so this module, and its callers, read the way legacy's did rather than reaching into
 * `finding.advisories` directly at every call site.
 */
export function advisoriesOf(finding: Finding): readonly Advisory[] {
  return finding.advisories;
}

export interface FixRung {
  readonly version: string | null;
  readonly onBranch: boolean;
  readonly n: number;
  /** No release was read for these advisories, so a null `version` is not "no fix". */
  readonly unchecked: boolean;
}

/** An advisory's null `fixedBy` in words: "no fix" only where its S9 read the releases. */
export function noFixWords(advisory: Pick<Advisory, "releasesRead">): string {
  return advisory.releasesRead === false ? "fix not checked" : "no fix listed";
}

/** Distinct releases that clear a finding's advisories: one on the installed branch first, then the
 *  one clearing more. Ties keep first-seen order, and a rung keeps its first advisory's
 *  `fixed_on_branch` where two disagree. */
export function fixLadder(finding: Finding): readonly FixRung[] {
  const buckets = new Map<string, FixRung>();
  for (const advisory of advisoriesOf(finding)) {
    const unchecked = advisory.fixedBy === null && advisory.releasesRead === false;
    const key = advisory.fixedBy ?? (unchecked ? "\u0000unchecked" : "\u0000none");
    const existing = buckets.get(key);
    buckets.set(
      key,
      existing
        ? { ...existing, n: existing.n + 1 }
        : { version: advisory.fixedBy, onBranch: advisory.fixedOnBranch, n: 1, unchecked },
    );
  }
  return Array.from(buckets.values()).sort((x, y) => {
    if (x.onBranch !== y.onBranch) return x.onBranch ? -1 : 1;
    return y.n - x.n;
  });
}

/** The design-token suffix an advisory severity renders with (report.js:140-142). `unrated`, and
 *  any value this renderer does not know, fall back to `"low"` — the same fallback legacy's
 *  `sevTone` gave anything outside its four named tiers. */
export function sevTone(severity: Severity): "crit" | "high" | "med" | "low" {
  switch (severity) {
    case "critical":
      return "crit";
    case "high":
      return "high";
    case "medium":
      return "med";
    default:
      return "low";
  }
}

/**
 * The sort the Advisories tab and the detail's "Every advisory" list both use. Legacy ran two
 * near-duplicate sorts, each ranking the *raw* severity string with `SEV_ORDER.indexOf`
 * (report.js:526, report.js:814) — a value outside the four named tiers gets `-1`, which sorts
 * before `"critical"` instead of after `"low"` as intended (critic.md C1). `Advisory.severity` is
 * already normalised by the time it reaches here (domain/severity.ts), so ranking by
 * `severityRank` alone fixes that: `"unrated"` is the last rank, not `indexOf`'s `-1`.
 *
 * `Array#sort` has been a stable sort since ES2019, so items tied on severity keep the document
 * order they arrived in. That replaces the Advisories tab's `reported_at`-descending tiebreak
 * (report.js:528) — a deliberate simplification, not a byte-for-byte port of the tiebreak.
 */
export function sortAdvisories<T>(items: readonly T[], severityOf: (item: T) => Severity): readonly T[] {
  return [...items].sort((a, b) => severityRank(severityOf(a)) - severityRank(severityOf(b)));
}

export interface AdvisoryWithFinding {
  readonly advisory: Advisory;
  readonly finding: Finding;
}

/** lockrot's note codes for an advisory check that stopped early or lost a repository. */
const ADVISORY_GAP_CODES: ReadonlySet<string> = new Set(["advisories_not_checked", "advisories_unavailable"]);

/** Whether the run says its advisory check did not cover every package. */
export function advisoryCheckIncomplete(model: Model): boolean {
  return model.report.noteDetails.some((note) => ADVISORY_GAP_CODES.has(note.code));
}

/** Every advisory of every finding in the report, paired with its finding and sorted for the
 *  Advisories tab (legacy's `ALL_ADVISORIES`, report.js:147-157, plus its sort at report.js:525-529). */
export function allAdvisories(model: Model): readonly AdvisoryWithFinding[] {
  const pairs: AdvisoryWithFinding[] = [];
  for (const finding of model.report.findings) {
    for (const advisory of advisoriesOf(finding)) {
      pairs.push({ advisory, finding });
    }
  }
  return sortAdvisories(pairs, (pair) => pair.advisory.severity);
}

/** One package the advisories touch, with the `fixed_by` versions its advisories name, verbatim. */
export interface AdvisoryPackage {
  readonly package: string;
  /** Distinct, in the order its advisories list them; empty when none names a fix. */
  readonly fixedBy: readonly string[];
  /** True when at least one of its advisories names no fix though its releases were read. */
  readonly someUnfixed: boolean;
  /** True when at least one of its advisories names no fix because no release was read. */
  readonly someUnchecked: boolean;
}

/**
 * The packages behind a list of advisories, in the list's own order (so, from `allAdvisories`, the
 * package carrying the most severe advisory first), each with the fix versions its advisories name.
 * Display only: the versions are the advisories' own `fixed_by` text, never compared or ranked.
 */
export function advisoryPackages(pairs: readonly AdvisoryWithFinding[]): readonly AdvisoryPackage[] {
  const byPackage = new Map<string, { fixedBy: string[]; someUnfixed: boolean; someUnchecked: boolean }>();
  for (const { advisory, finding } of pairs) {
    const entry = byPackage.get(finding.package) ?? { fixedBy: [], someUnfixed: false, someUnchecked: false };
    const fix = advisory.fixedBy;
    const shape = fixShapeOf(advisory);
    const fixedBy = fix && !entry.fixedBy.includes(fix) ? [...entry.fixedBy, fix] : entry.fixedBy;
    byPackage.set(finding.package, {
      fixedBy,
      someUnfixed: entry.someUnfixed || shape === "none",
      someUnchecked: entry.someUnchecked || shape === "unchecked",
    });
  }

  return [...byPackage].map(([name, entry]) => ({ package: name, ...entry }));
}

/** An advisory's fix shape: a release that clears it exists on the installed branch, exists only on
 *  another branch, or none is listed; or no release was read, so nobody looked (`unchecked`). Drives
 *  the Advisories tab's groups and the rail's `fix` filter. */
export type FixShape = "branch" | "move" | "none" | "unchecked";

export function fixShapeOf(advisory: Advisory): FixShape {
  if (!advisory.fixedBy) return advisory.releasesRead === false ? "unchecked" : "none";
  return advisory.fixedOnBranch ? "branch" : "move";
}

/**
 * Whether one advisory clears the rail's own `sev`/`fix` selections. `domain/filters.ts`'s
 * `passesRail` only ever answers this at *finding* granularity (does the finding have at least one
 * matching advisory) — correct for narrowing which packages are eligible, but not enough to count or
 * order individual Advisories-tab rows, where a finding can pass the rail on one advisory while
 * carrying several that individually do not. Legacy's `advisoryMatches` made the same two checks at
 * the row level (`report.js:507,509`); this is that half of it, kept here as the one definition
 * `SearchBar`'s count line and `ui/views/order.ts`'s row order both call, so the two can never
 * disagree (quality finding: this check used to be hand-duplicated in both places).
 */
export function passesAdvisoryRail(
  filters: { readonly sev: readonly string[]; readonly fix: readonly string[] },
  advisory: Advisory,
): boolean {
  if (filters.sev.length > 0 && !filters.sev.includes(advisory.severity)) return false;
  if (filters.fix.length > 0 && !filters.fix.includes(fixShapeOf(advisory))) return false;
  return true;
}

export interface AdvisoryGroup {
  readonly shape: FixShape;
  readonly heading: string;
  readonly hint: string;
  readonly advisories: readonly AdvisoryWithFinding[];
}

/** The Advisories tab's fix-shape groups, in a fixed order. */
const GROUP_TEXT: readonly { shape: FixShape; heading: string; hint: string }[] = [
  {
    shape: "branch",
    heading: "A release on the branch you are on",
    hint: "The cheapest move: a patch or minor bump, no migration.",
  },
  {
    shape: "move",
    heading: "Only a move to another branch",
    hint: "The fix never landed on your branch. This is an upgrade, not a bump.",
  },
  {
    shape: "none",
    heading: "No fix listed",
    hint: "Nothing published clears it. Replacement or mitigation.",
  },
  {
    shape: "unchecked",
    heading: "Fix not checked",
    hint: "lockrot read no release list for it, so whether a release clears it is not known.",
  },
];

/** Buckets already-sorted advisory/finding pairs into the Advisories tab's fix-shape groups;
 *  a group with nothing in it is omitted rather than rendered empty (report.js:540). */
export function groupAdvisories(pairs: readonly AdvisoryWithFinding[]): readonly AdvisoryGroup[] {
  return GROUP_TEXT.map((group) => ({
    ...group,
    advisories: pairs.filter((pair) => fixShapeOf(pair.advisory) === group.shape),
  })).filter((group) => group.advisories.length > 0);
}
