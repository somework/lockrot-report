/**
 * The Age row of the detail sheet (SPEC §7.9.8): `AgeText`'s line without its `age:` prefix, and
 * a note for each reading lockrot could not take.
 */

import type {
  Age,
  AgeBranchRelease,
  AgeInstalled,
  AgePush,
  AgeRelease,
  Finding,
  RepositoryMetadata,
} from "../model/report2";
import { ago } from "./ago";
import { AGE_WORDS, causeWord, eventWord } from "./pageVocabulary";

type Reading = AgeInstalled | AgeBranchRelease | AgeRelease | AgePush;

const dateOf = (dateTime: string): string => dateTime.slice(0, 10);

function when(reading: Reading): string {
  const datedBy = "dated_by" in reading && reading.dated_by !== null ? `, dated by ${reading.dated_by}` : "";
  return `${dateOf(reading.at)} (${ago(reading.years)}${datedBy})`;
}

/**
 * `finding.branch`. A branch-alias snapshot (`5.4.x-dev`) has none: its line is the branch row whose
 * newest dated release is the branch's last release, else "its branch".
 */
function branchOf({ branch, age }: Finding, metadata: RepositoryMetadata | null): string {
  if (branch !== null) return branch;
  const rows = (metadata?.branches ?? []).filter(
    ({ newest_dated: newestDated }) => newestDated === age.branch_release?.version,
  );
  return rows.length === 1 ? (rows[0]?.branch ?? "its branch") : "its branch";
}

function installedPart(finding: Finding, age: Age, branch: string): string | null {
  const { version } = finding;
  if (age.installed === null) {
    return age.installed_unmeasured === "branch_snapshot"
      ? null
      : `installed ${version}, release date not known (${causeWord(age.installed_unmeasured ?? "", finding.origin.kind)})`;
  }
  const newest =
    age.release?.version === version
      ? ", its newest release"
      : age.branch_release?.version === version
        ? `, the newest on ${branch}`
        : "";
  return `installed ${version} released ${when(age.installed)}${newest}`;
}

/** `null` when no reading was taken. The text formats print it only where no flag line already does. */
export function ageLine(finding: Finding, metadata: RepositoryMetadata | null = null): string | null {
  const { age, version } = finding;
  const { release, branch_release: branchRelease, push } = age;
  const branch = branchOf(finding, metadata);
  const parts = [
    installedPart(finding, age, branch),
    branchRelease !== null && branchRelease.version !== version && release?.version !== branchRelease.version
      ? `${branch} last released ${branchRelease.version} ${when(branchRelease)}`
      : null,
    release !== null && release.version !== version
      ? branchRelease?.version === release.version
        ? `${branch} last released ${release.version} ${when(release)}, its newest release`
        : `newest release ${release.version} ${when(release)}`
      : null,
    push === null ? null : `last ${eventWord(finding.activity.event ?? "push")} ${when(push)}`,
  ].filter((part) => part !== null);

  return parts.length === 0 ? null : parts.join("; ");
}

/** One note per reading that was not taken, `{name} not read ({cause words})`. A branch snapshot has no release branch to read. */
export function ageNotRead(finding: Finding, metadata: RepositoryMetadata | null = null): string[] {
  const { age } = finding;
  const event = eventWord(finding.activity.event ?? "push");
  const readings = [
    [AGE_WORDS.reading.installed, age.installed_unmeasured],
    [
      AGE_WORDS.reading.branch_release.replace("{branch}", branchOf(finding, metadata)),
      age.branch_release_unmeasured,
    ],
    [AGE_WORDS.reading.release, age.release_unmeasured],
    [AGE_WORDS.reading.push.replace("{event}", event), age.push_unmeasured],
  ] as const;

  return readings
    .filter(
      (reading): reading is readonly [string, string] =>
        reading[1] !== null && reading[1] !== "branch_snapshot",
    )
    .map(([name, cause]) =>
      AGE_WORDS.not_read
        .replace("{reading}", name)
        .replace("{reason words}", causeWord(cause, finding.origin.kind)),
    );
}
