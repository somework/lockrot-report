/**
 * The Repository line of the detail sheet (SPEC §7.9.8): what lockrot learned from the forge about
 * the package's repository, or why it did not ask.
 */

import type { Finding } from "../model/report";
import { causeWord, eventWord, forgeWord } from "./pageVocabulary";

const dateOf = (dateTime: string): string => dateTime.slice(0, 10);

function readLine(finding: Finding): string {
  const { activity, age } = finding;
  const place = `${activity.forge === null ? "" : `${forgeWord(activity.forge)} `}${activity.host ?? ""}/${activity.repo ?? ""}`;
  const event = eventWord(activity.event ?? "push");
  const last = age.push === null ? `no ${event} reported` : `last ${event} ${dateOf(age.push.at)}`;
  const archivedFlagRead = finding.checks_skipped.find(({ check }) => check === "repository_archived");
  const archived =
    activity.archived === true
      ? ", archived"
      : activity.archived === null
        ? `, archived flag not read${archivedFlagRead === undefined ? "" : ` (${causeWord(archivedFlagRead.reason, finding.origin.kind)})`}`
        : "";
  const fetched = activity.fetched_at === null ? "" : ` · fetched ${dateOf(activity.fetched_at)}`;
  const cached = activity.cached_at === null ? "" : ` (cached ${dateOf(activity.cached_at)})`;
  return `${place}: ${last}${archived}${fetched}${cached}`;
}

function notReadLine(finding: Finding): string {
  const { activity } = finding;
  if (activity.reason === "host_not_supported") {
    return `lockrot cannot ask ${activity.host ?? ""} about repository activity`;
  }
  const why = activity.reason === null ? "" : ` (${causeWord(activity.reason, finding.origin.kind)})`;
  return activity.repo === null
    ? `Repository activity not asked${why}`
    : `${activity.host ?? ""}/${activity.repo}: not asked${why}`;
}

export function repositoryLine(finding: Finding): string {
  const { activity } = finding;
  switch (activity.status) {
    case "read":
      return readLine(finding);
    case "not_found":
      return `${activity.forge === null ? "" : `${forgeWord(activity.forge)} `}${activity.host}/${activity.repo}: the host answered 404 (private, renamed or removed)`;
    default:
      return notReadLine(finding);
  }
}
