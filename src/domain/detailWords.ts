/** The fixed words of the report-2 detail sheet (SPEC §7.9.8): its headings, controls and reference rows. */

import type { Finding, Run } from "../model/report";
import { day } from "./format";
import { namesShown } from "./moveCards";
import { dependentNames, noPathWords } from "./qualifierRows";

export const DETAIL_WORDS = {
  close: "Close",
  hidden: "Hidden by the current filters.",
  clearFilters: "Clear filters",
  checks: "Checks",
  security: "Security",
  feeds: "Advisory feeds",
  branches: "Release branches",
  age: "Age",
  repository: "Repository",
  baseline: "Baseline",
  lockEntry: "The lock entry",
  provenance: "Provenance",
  showArithmetic: "Show the arithmetic",
  copy: "Copy",
  copied: "Copied",
  copyByHand: "Select it and copy",
  shell: "Shell",
  shellFor: "Shell: {shell}",
  verdict: "Verdict",
  otherFlags: "The other counted flags",
  reach: "Reach",
  origin: "Origin",
  notJudged: "Not judged",
  unchecked: "Unchecked",
  notRun: "Not run",
  php: "PHP",
  accepted: "Accepted",
  gate: "Gate",
  more: "{n} more",
  showFewer: "show fewer",
  clears: "Clears",
  stays: "Stays",
  notChecked: "Not checked",
  adds: "Adds",
  after: "After",
  composer: "Composer",
  heldBy: "Held by",
  yes: "yes: ",
  no: "no: ",
} as const;

/** "The lock entry" and "Provenance" row labels. */
export const REFERENCE_WORDS = {
  installed: "installed",
  php: "php constraint",
  released: "released",
  snapshotDated: "snapshot dated",
  repository: "repository",
  type: "type",
  dev: "packages-dev",
  snapshot: "branch snapshot",
  yes: "yes",
  origin: "origin",
  registry: "registry",
  local: "installed from a local path",
  metadata: "package metadata",
  metadataAsOf: "metadata as of",
  releases: "releases listed",
  activity: "repository activity",
  fetched: "fetched",
  cached: "cached",
} as const;

export const agesAsOf = (generatedAt: string): string => `Ages as of ${day(generatedAt)}`;

export const whyTitle = (verdict: string): string => `Why ${verdict}`;

/** The header's reach text on a sheet with no flag (G46 to G49): "direct requirement", "via a, b
 *  and 3 more" or the unreached words, with " · dev" for packages-dev. */
export function detailReach(finding: Finding, run: Run): string {
  const way =
    finding.reach === "direct"
      ? "direct requirement"
      : finding.reach === "transitive"
        ? `via ${namesShown(dependentNames(finding))}`
        : noPathWords(finding, run);
  return finding.dev ? `${way} · dev` : way;
}
