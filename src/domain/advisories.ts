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
}

/**
 * Distinct releases that clear a finding's advisories, cheapest move first: a release already on
 * the installed branch beats one that is not, and among ties the release that clears more
 * advisories comes first (report.js:160-171). Legacy bucketed by `fixed_by` in a plain object and
 * read it back with `Object.keys`, which visits integer-like keys (a `fixed_by` of `"2"`) in
 * numeric order ahead of insertion order — a JS engine quirk, not anything `Priority::of()` or the
 * advisory feed intends. A `Map` keeps first-seen order instead, so ties after the onBranch/n sort
 * follow the order advisories arrived in, not JS's object-key order (critic.md M33). Also per M33,
 * a bucket keeps the *first* advisory's `fixed_on_branch` flag when two advisories share a
 * `fixed_by` but disagree on it — this port keeps that same behaviour, not averaging or overwriting
 * it.
 */
export function fixLadder(finding: Finding): readonly FixRung[] {
  const buckets = new Map<string, FixRung>();
  for (const advisory of advisoriesOf(finding)) {
    const key = advisory.fixedBy ?? "\u0000none";
    const existing = buckets.get(key);
    if (existing) {
      buckets.set(key, { version: existing.version, onBranch: existing.onBranch, n: existing.n + 1 });
    } else {
      buckets.set(key, { version: advisory.fixedBy, onBranch: advisory.fixedOnBranch, n: 1 });
    }
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

/** An advisory's fix shape: a release that clears it either exists on the installed branch, exists
 *  only on another branch, or does not exist at all (report.js:508,538). Drives both the Advisories
 *  tab's three groups and the query grammar's `fix:` filter. */
export type FixShape = "branch" | "move" | "none";

export function fixShapeOf(advisory: Advisory): FixShape {
  if (!advisory.fixedBy) return "none";
  return advisory.fixedOnBranch ? "branch" : "move";
}

export interface AdvisoryGroup {
  readonly shape: FixShape;
  readonly heading: string;
  readonly hint: string;
  readonly advisories: readonly AdvisoryWithFinding[];
}

/** The Advisories tab's three fix-shape groups, in the fixed order and with the fixed copy
 *  report.js:530-534 declares. */
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
];

/** Buckets already-sorted advisory/finding pairs into the Advisories tab's three fix-shape groups;
 *  a group with nothing in it is omitted rather than rendered empty (report.js:540). */
export function groupAdvisories(pairs: readonly AdvisoryWithFinding[]): readonly AdvisoryGroup[] {
  return GROUP_TEXT.map((group) => ({
    ...group,
    advisories: pairs.filter((pair) => fixShapeOf(pair.advisory) === group.shape),
  })).filter((group) => group.advisories.length > 0);
}
