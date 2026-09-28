/** How far a package's installed release is behind the newest one, in fractional years, or why it
 *  could not be measured. */

import type { ExplainMetadata, Finding, LibyearsBlock, PackageDetails } from "../model/types";
import { fixed } from "./format";
import { readPinnedFacts } from "./pinned";
import { vocabTable } from "./vocab";

const NOT_FROM_COMPOSER_NOTE = "not from a Composer repository, not checked";

const UNMEASURED_LABELS: Readonly<Record<string, string>> = vocabTable({
  no_stable_release_date: "no dated release",
});

/** A key of the report's `unmeasured` block, in words. */
export function unmeasuredLabel(reason: string): string {
  return UNMEASURED_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/** An unmeasured package sorts below every measured one, a measured `0` included. */
export function libyearsSortKey(finding: Pick<Finding, "libyears"> | null): number {
  const value = finding ? finding.libyears : null;

  return value === null ? -1 : value;
}

const UNMEASURED_REASONS: Readonly<Record<string, string>> = vocabTable({
  branch_snapshot: "branch snapshot",
  no_stable_release_date: "no release date lockrot trusts",
  not_from_composer_repository: "not from a Composer repository",
  metadata_unavailable: "metadata unavailable",
});

/** In the words the report's `unmeasured` block counts it under, an unknown reason as written; empty
 *  when measured, when there is no block, or when no field says which reason. */
export function libyearsReason(
  finding: Finding | null,
  details: PackageDetails | null,
  block: LibyearsBlock | null,
): string {
  if (!finding || !block || fixed(finding.libyears, 1) !== null) return "";
  const code = finding.libyearsUnmeasured;
  if (code !== null) return UNMEASURED_REASONS[code] ?? code;
  if (finding.note === NOT_FROM_COMPOSER_NOTE) return "not from a Composer repository";
  if (finding.note) return "metadata unavailable";
  switch (readPinnedFacts(finding, details).branchSnapshot) {
    case true:
      return "branch snapshot";
    case false:
      return "no release date lockrot trusts";
    case null:
      return "";
  }
}

/** Never "ahead": the value is a difference of release dates clamped at zero. */
export function libyearsAtZero(
  finding: Pick<Finding, "libyears" | "version"> | null,
  meta: Pick<ExplainMetadata, "lastStableVersion"> | null,
): string | null {
  if (!finding || finding.libyears !== 0) return null;
  const newest = meta?.lastStableVersion ?? null;

  return newest && newest !== finding.version
    ? `not behind the newest release, ${newest}`
    : "the installed release is the newest";
}

/** `libyearsAtZero` in the word or two a printed table has room for (PD-PRINT-4). */
export function libyearsAtZeroMark(
  finding: Pick<Finding, "libyears" | "version"> | null,
  meta: Pick<ExplainMetadata, "lastStableVersion"> | null,
): string | null {
  if (!finding || finding.libyears !== 0) return null;
  const newest = meta?.lastStableVersion ?? null;

  return newest && newest !== finding.version ? `not behind ${newest}` : "newest";
}

/** The libyears block, minus the total, as the ledger's plain-text items after the number. */
export function libyearsItems(block: LibyearsBlock | null): string[] {
  if (!block) return [];
  const unmeasured = block.unmeasured.reduce((sum, [, count]) => sum + count, 0);
  const packages = block.measured + unmeasured;

  if (!block.measured) {
    if (!packages) return ["nothing to measure"];

    return [
      packages === 1
        ? "the one package could not be measured"
        : `none of the ${packages} packages could be measured`,
    ];
  }

  const scope =
    block.measured === packages
      ? packages === 1
        ? "the one package"
        : `all ${packages} packages`
      : `${block.measured} of ${packages} packages`;
  const items = [`across ${scope}`];
  const worst = block.furthestBehind;
  if (worst) {
    const direct = fixed(block.directRequirements, 1);
    if (direct !== null) items.push(`${direct} from direct requirements`);
    const behind = fixed(worst.libyears, 1);
    items.push(`furthest behind ${worst.package} ${worst.version}${behind === null ? "" : ` at ${behind}`}`);
  }

  return items;
}

/** One phrase of a package's libyears row, as data rather than markup. */
export interface LibyearsPhrase {
  text: string;
  /** An ISO date the phrase names; the caller formats it and keeps it on one line. */
  date?: string;
}

export function libyearsRowPhrases(
  finding: Pick<Finding, "libyears" | "version"> | null,
  metadata: Pick<
    ExplainMetadata,
    | "hasStableRelease"
    | "lastStableRelease"
    | "lastStableVersion"
    | "installedRelease"
    | "installedReleaseDatedBy"
  > | null,
): LibyearsPhrase[] {
  if (!finding || fixed(finding.libyears, 1) === null) return [];

  const newest = metadata?.lastStableVersion ?? null;
  const atZero = libyearsAtZero(finding, metadata);

  let why: LibyearsPhrase | null = null;
  if (metadata?.hasStableRelease && !metadata.lastStableRelease) {
    // The newest release itself carries no date; measured instead to the newest dated one above it.
    why = { text: "at least: the newest release is undated, measured to the newest dated one above" };
  } else if (atZero !== null) {
    why = { text: atZero };
  } else if (newest) {
    why = metadata?.lastStableRelease
      ? { text: `newest ${newest} released `, date: metadata.lastStableRelease }
      : { text: `newest ${newest}` };
  }

  const phrases: LibyearsPhrase[] = why ? [why] : [];
  if (metadata?.installedReleaseDatedBy) {
    // A split package's installed version is dated by its monorepo's tag.
    const name = metadata.installedReleaseDatedBy;
    phrases.push(
      metadata.installedRelease
        ? { text: `installed release dated by ${name}, `, date: metadata.installedRelease }
        : { text: `installed release dated by ${name}` },
    );
  }

  return phrases;
}

/** Counts whatever list it is handed, so under a filter it counts what is listed. */
export interface LibyearsTally {
  readonly behind: number;
  readonly current: number;
  readonly unmeasured: number;
}

export function libyearsTally(findings: readonly Pick<Finding, "libyears">[]): LibyearsTally {
  let behind = 0;
  let current = 0;
  let unmeasured = 0;
  for (const finding of findings) {
    const value = finding.libyears;
    if (value === null || !Number.isFinite(value)) unmeasured += 1;
    else if (value > 0) behind += 1;
    else current += 1;
  }
  return { behind, current, unmeasured };
}

/** 0 to the population's largest value, whole years, so a bar keeps its length while the list
 *  narrows. */
export function libyearsAxisMax(findings: readonly Pick<Finding, "libyears">[]): number | null {
  let largest = 0;
  for (const finding of findings) {
    const value = finding.libyears;
    if (value !== null && Number.isFinite(value) && value > largest) largest = value;
  }
  return largest > 0 ? Math.max(1, Math.ceil(largest)) : null;
}
