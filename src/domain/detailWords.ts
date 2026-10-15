/** The fixed words of the report-2 detail sheet (SPEC §7.9.8): its headings, controls and reference rows. */

import type { Finding } from "../model/report";
import { day } from "./format";
import { namesCapped } from "./findingWords";

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
  firstWayOnly: "Show the first way out only",
  move: "The move",
  moveInOrder: "The move, in order",
  copy: "Copy",
  copied: "Copied",
  copyByHand: "Select it and copy",
  shell: "Shell",
  shellFor: "Shell: {shell}",
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

/** The header's reach text: "direct requirement", "via a, b and 3 more", "unreached", with "· dev" for packages-dev. */
export function detailReach(finding: Finding): string {
  const way =
    finding.reach === "direct"
      ? "direct requirement"
      : finding.reach === "transitive"
        ? `via ${namesCapped(finding.direct_dependents)}`
        : finding.reach;
  return finding.dev ? `${way} · dev` : way;
}
