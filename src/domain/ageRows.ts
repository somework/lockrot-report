/** The Age row of the detail sheet (SPEC §7.9.8.12, §7.9.13.8): one row per reading, then a line
 *  per reading lockrot could not take. */

import type {
  AgeBranchRelease,
  AgeInstalled,
  AgePush,
  AgeRelease,
  Finding,
  RepositoryMetadata,
} from "../model/report";
import { ago } from "./ago";
import { day } from "./format";
import { causeWord, eventWord } from "./pageVocabulary";

export interface AgeRow {
  /** Null on a line for a reading that was not read. */
  readonly label: string | null;
  readonly value: string;
}

type Reading = AgeInstalled | AgeBranchRelease | AgeRelease | AgePush;

function when(reading: Reading): string {
  const datedBy = "dated_by" in reading && reading.dated_by ? `, dated by ${reading.dated_by}` : "";
  return `${day(reading.at)} · ${ago(reading.years)}${datedBy}`;
}

export function ageRows(finding: Finding, metadata: RepositoryMetadata | null): AgeRow[] {
  const { age, version } = finding;
  const { installed, release, branch_release: last, push } = age;
  const cause = (id: string): string => causeWord(id, finding.origin.kind);
  const branch =
    finding.branch ??
    (metadata?.branches ?? []).find((r) => last !== null && r.newest_dated === last.version)?.branch ??
    "its branch";
  const rows: AgeRow[] = [];
  if (installed === null) {
    if (age.installed_unmeasured !== "branch_snapshot") {
      rows.push({
        label: "installed",
        value: `${version} · release date not known (${cause(age.installed_unmeasured ?? "")})`,
      });
    }
  } else {
    const newest =
      release?.version === version
        ? " · its most recent release"
        : last?.version === version
          ? ` · the newest on ${branch}`
          : "";
    rows.push({ label: "installed", value: `${version} · ${when(installed)}${newest}` });
  }
  if (last !== null && last.version !== version && release?.version !== last.version) {
    rows.push({ label: `${branch} last`, value: `${last.version} · ${when(last)}` });
  }
  if (release !== null && release.version !== version) {
    rows.push(
      last?.version === release.version
        ? {
            label: `${branch} last`,
            value: `${release.version} · ${when(release)} · its most recent release`,
          }
        : { label: "most recent", value: `${release.version} · ${when(release)}` },
    );
  }
  const event = eventWord(finding.activity.event ?? "push");
  if (push !== null) rows.push({ label: `last ${event}`, value: when(push) });
  const notRead: [string, string | null][] = [
    ["installed", age.installed_unmeasured],
    [finding.branch ?? "its branch", age.branch_release_unmeasured],
    ["most recent", age.release_unmeasured],
    [`last ${event}`, age.push_unmeasured],
  ];
  for (const [name, id] of notRead) {
    if (id !== null && id !== "branch_snapshot")
      rows.push({ label: null, value: `${name} not read (${cause(id)})` });
  }
  return rows;
}
